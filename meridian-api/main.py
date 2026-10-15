import logging
import os
import sqlite3
from contextlib import asynccontextmanager, closing
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from access import allowed_accounts, authorize, log_security, verify_identity
from agent import ClientIntelligenceAgent
from auth import AuthService, SessionUser, initialize_security
from generation import (
    generate_account,
    get_job,
    initialize_generation,
    reset_generated_state,
    shutdown_generation,
    start_job,
)
from init_db import init_database
from intelligence import build_brief
from models import (
    Account,
    AccountBrief,
    Billing,
    BriefGenerationJob,
    BriefGenerationRequest,
    Claim,
    Document,
    Policy,
    ServiceCase,
)
from portfolio import build_portfolio

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("SQLITE_DB_PATH", BASE_DIR / "meridian.db"))
# Configurable demo clock: synthetic October records remain reproducible.
AS_OF_DATE = date.fromisoformat(os.getenv("MERIDIAN_AS_OF_DATE", "2026-10-08"))
RESET_DB_ON_START = os.getenv("RESET_DB_ON_START", "0").lower() in ("1", "true", "yes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if RESET_DB_ON_START:
        logger.info(
            "Server start: checking for existing DB at %s and recreating fresh synthetic database...",
            DB_PATH,
        )
        init_database(DB_PATH, force_recreate=True)
    elif not DB_PATH.exists():
        init_database(DB_PATH, force_recreate=False)
    with closing(_get_database_connection()) as connection:
        initialize_generation(connection)
        reset_generated_state(connection)
        logger.info("Started fresh briefing session; source records and real audit history preserved.")
    try:
        yield
    finally:
        shutdown_generation(wait=True)


app = FastAPI(title="Meridian Broker API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(
        ","
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)


def _get_database_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        init_database(DB_PATH, force_recreate=True)
    try:
        connection = sqlite3.connect(DB_PATH, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        migrated = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_sessions'"
        ).fetchone()
        if not migrated:
            initialize_security(connection)
        return connection
    except sqlite3.OperationalError as exc:
        logger.exception("Unable to connect to the database")
        raise HTTPException(503, "The database is currently unavailable.") from exc


auth = AuthService(lambda: _get_database_connection())
app.include_router(auth.router)


@app.get("/accounts", response_model=list[Account])
def get_accounts(user: SessionUser = Depends(auth.require_user)):
    with closing(_get_database_connection()) as connection:
        return [
            build_brief(connection, user, row["account_id"], AS_OF_DATE)["account"]
            for row in allowed_accounts(connection, user)
        ]


def account_records(
    account_id: str, table: str, resource: str, user: SessionUser, supplied_id: str | None
):
    verify_identity(supplied_id, user)
    with closing(_get_database_connection()) as connection:
        authorize(connection, user, account_id, resource)
        rows = [
            dict(row)
            for row in connection.execute(
                f"SELECT * FROM {table} WHERE account_id=?", (account_id,)
            )
        ]
        log_security(connection, user, "record_read", account_id, resource)
        return rows


@app.get("/accounts/{account_id}/policies", response_model=list[Policy])
def get_account_policies(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    return account_records(account_id, "policies", "policies", user, user_id)


@app.get("/accounts/{account_id}/claims", response_model=list[Claim])
def get_account_claims(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    return account_records(account_id, "claims", "claims", user, user_id)


@app.get("/accounts/{account_id}/billing", response_model=list[Billing])
def get_account_billing(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    return account_records(account_id, "billing", "billing", user, user_id)


@app.get("/accounts/{account_id}/service-cases", response_model=list[ServiceCase])
def get_account_service_cases(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    return account_records(account_id, "service_cases", "service-cases", user, user_id)


@app.get("/accounts/{account_id}/documents", response_model=list[Document])
def get_account_documents(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    return account_records(account_id, "documents", "documents", user, user_id)


@app.get("/accounts/{account_id}/brief", response_model=AccountBrief)
def get_account_brief(
    account_id: str, user_id: str | None = None, user: SessionUser = Depends(auth.require_user)
):
    verify_identity(user_id, user)
    with closing(_get_database_connection()) as connection:
        brief = build_brief(connection, user, account_id, AS_OF_DATE)
        log_security(connection, user, "brief_read", account_id)
        return brief


@app.post("/accounts/{account_id}/brief/generate", response_model=AccountBrief)
def generate_account_brief(
    account_id: str,
    user: SessionUser = Depends(auth.require_user),
):
    return generate_account(
        _get_database_connection, user, account_id, AS_OF_DATE, ClientIntelligenceAgent
    )


@app.post("/accounts/{account_id}/brief/jobs", response_model=BriefGenerationJob, status_code=202)
def start_brief_generation(
    account_id: str,
    request: BriefGenerationRequest | None = None,
    user: SessionUser = Depends(auth.require_user),
):
    return start_job(
        _get_database_connection,
        user,
        account_id,
        AS_OF_DATE,
        force=request.force if request else False,
        agent_factory=ClientIntelligenceAgent,
    )


@app.get("/accounts/{account_id}/brief/jobs/{job_id}", response_model=BriefGenerationJob)
def get_brief_generation(
    account_id: str, job_id: str, user: SessionUser = Depends(auth.require_user)
):
    return get_job(_get_database_connection, user, account_id, job_id, AS_OF_DATE)


@app.get("/portfolio")
def get_portfolio(
    producer_id: str | None = None,
    risk_level: Literal["high", "medium", "low"] | None = None,
    renewal_days: int = Query(default=0, ge=0, le=3650),
    user: SessionUser = Depends(auth.require_user),
):
    with closing(_get_database_connection()) as connection:
        portfolio = build_portfolio(
            connection, user, AS_OF_DATE, producer_id, risk_level, renewal_days
        )
        log_security(connection, user, "portfolio_read", detail=user.region)
        return portfolio


@app.get("/admin/audit")
def get_audit_telemetry(
    user: SessionUser = Depends(auth.require_user),
):
    with closing(_get_database_connection()) as connection:
        # Producers see their own usage; leaders see only authorized regional accounts.
        accessible = [row["account_id"] for row in allowed_accounts(connection, user)]
        placeholders = ",".join("?" for _ in accessible) or "NULL"
        scope = f"account_id IN ({placeholders})"
        params = list(accessible)
        if user.persona != "regional_leader":
            scope += " AND user_id=?"
            params.append(user.user_id)
        stats = connection.execute(
            f"""
            SELECT
                COUNT(*) as total_calls,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
            FROM audit_log
            WHERE {scope}
            """,
            params,
        ).fetchone()

        rows = connection.execute(
            f"SELECT * FROM audit_log WHERE {scope} ORDER BY created_at DESC LIMIT 50",
            params,
        ).fetchall()

        return {
            "summary": {
                "total_generations": stats["total_calls"],
                "total_tokens": stats["total_tokens"],
                "total_cost_usd": round(float(stats["total_cost_usd"]), 6),
                "avg_latency_ms": round(float(stats["avg_latency_ms"]), 1),
            },
            "recent_logs": [dict(r) for r in rows],
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
