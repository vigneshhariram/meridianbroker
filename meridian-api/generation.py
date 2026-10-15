"""Bounded, persisted account briefing jobs with source-scoped caching.

The SQLite job row survives a browser disconnect within a backend session.
A small local worker pool is appropriate for this single-service deployment.
Startup clears derived briefs and jobs; source records remain independent.
"""

import json
import logging
import sqlite3
import threading
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date

from fastapi import HTTPException

from access import authorize, log_security
from agent import ClientIntelligenceAgent, citation_allowlist, verify_brief_completeness
from auth import SessionUser
from intelligence import build_agent_input_context, build_brief

logger = logging.getLogger(__name__)
ConnectionFactory = Callable[[], sqlite3.Connection]
AgentFactory = Callable[[], ClientIntelligenceAgent]
_executor: ThreadPoolExecutor | None = None
_dispatch_lock = threading.RLock()
MAX_ACTIVE_JOBS = 8


def initialize_generation(connection: sqlite3.Connection, recover: bool = False) -> None:
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS brief_generation_jobs (
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(user_id),
            account_id TEXT NOT NULL REFERENCES accounts(account_id),
            persona TEXT NOT NULL,
            source_fingerprint TEXT NOT NULL,
            status TEXT NOT NULL,
            phase TEXT NOT NULL,
            message TEXT NOT NULL,
            error TEXT,
            brief_id TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_brief_generation
            ON brief_generation_jobs(user_id, account_id, persona, source_fingerprint)
            WHERE status IN ('queued','running');
    """)
    if recover:
        connection.execute("""
            UPDATE brief_generation_jobs SET status='failed',phase='failed',
                message='Generation was interrupted. Please retry.',
                error='The service restarted before this brief finished.',
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE status IN ('queued','running')
        """)
    connection.commit()


def shutdown_generation(wait: bool = True) -> None:
    global _executor
    with _dispatch_lock:
        executor, _executor = _executor, None
    if executor:
        executor.shutdown(wait=wait, cancel_futures=False)


def reset_generated_state(connection: sqlite3.Connection) -> None:
    """Start a new demo generation session without resetting source records.

    Real provider audit entries survive; only known legacy fixture audit IDs
    are removed. Versions derive from briefs, so an empty table restarts at 1.
    Call once during startup before any generation workers are dispatched.
    """
    with connection:
        connection.execute("DELETE FROM brief_generation_jobs")
        connection.execute("DELETE FROM briefs")
        connection.executemany(
            "DELETE FROM audit_log WHERE log_id=?",
            [(f"LOG_BR{number:02d}",) for number in range(1, 21)],
        )


def generate_account(
    connection_factory: ConnectionFactory,
    user: SessionUser,
    account_id: str,
    as_of: date,
    agent_factory: AgentFactory = ClientIntelligenceAgent,
    progress: Callable[[str, str], None] | None = None,
) -> dict:
    """Shared synchronous implementation; no database lock during provider I/O."""
    if progress:
        progress("collecting", "Collecting accessible policies, claims and source evidence.")
    with closing(connection_factory()) as connection:
        authorize(connection, user, account_id)
        connection.execute("BEGIN")
        current = build_brief(connection, user, account_id, as_of)
        fingerprint = current["generation"]["source_fingerprint"]
        context = build_agent_input_context(connection, user, account_id, as_of)
        connection.commit()

    if progress:
        progress("generating", "Preparing the client synthesis from accessible evidence.")
    with agent_factory() as agent:
        output, telemetry, passed, reason = agent.generate_brief(context)
    if progress:
        progress("validating", "Checking open-claim coverage and source citations.")
    passed, reason = verify_brief_completeness(output, context)
    if not passed or any(
        citation not in citation_allowlist(context) for citation in output.evidence_citations
    ):
        raise ValueError("Generated synthesis failed evidence validation")

    content = {
        "summary": output.executive_summary,
        "agenda": output.agenda,
        "talking_points": output.talking_points,
        "prioritized_risks": output.prioritized_risks,
        "opportunity_hypotheses": output.opportunity_hypotheses,
        "suggested_actions": [action.model_dump() for action in output.suggested_actions],
        "evidence_citations": output.evidence_citations,
        "telemetry": telemetry.model_dump(),
        "generation_scope": {
            "user_id": user.user_id,
            "source_fingerprint": fingerprint,
        },
    }
    with closing(connection_factory()) as connection:
        # Permissions may have changed while the remote model was running.
        authorize(connection, user, account_id)
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT COALESCE(MAX(version),0) AS version FROM briefs WHERE account_id=? AND persona=?",
            (account_id, user.persona),
        ).fetchone()
        version = row["version"] + 1
        brief_id = f"BR_{uuid.uuid4().hex}"
        connection.execute(
            "INSERT INTO briefs (brief_id,account_id,persona,version,generated_at,content_json,model_version,completeness_check_passed) VALUES (?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?,?)",
            (
                brief_id,
                account_id,
                user.persona,
                version,
                json.dumps(content),
                telemetry.model,
                int(passed),
            ),
        )
        connection.execute(
            "INSERT INTO audit_log (log_id,user_id,account_id,persona,action,model,tokens_in,tokens_out,total_tokens,cost_usd,latency_ms,completeness_passed,blocked_flag,block_reason) VALUES (?,?,?,?,'brief_generation',?,?,?,?,?,?,?,0,NULL)",
            (
                f"LOG_{uuid.uuid4().hex}",
                user.user_id,
                account_id,
                user.persona,
                telemetry.model,
                telemetry.tokens_in,
                telemetry.tokens_out,
                telemetry.total_tokens,
                telemetry.cost_usd,
                telemetry.latency_ms,
                int(passed),
            ),
        )
        connection.commit()
        log_security(
            connection, user, "brief_generated", account_id, f"v{version} by {telemetry.model}"
        )
        result = build_brief(connection, user, account_id, as_of)
        if result["generation"]["mode"] == "stored_ai":
            result["generation"]["mode"] = "live_ai"
        return result


def _public_job(row: sqlite3.Row, result: dict | None = None) -> dict:
    return {
        key: row[key]
        for key in (
            "job_id",
            "account_id",
            "source_fingerprint",
            "status",
            "phase",
            "message",
            "error",
            "created_at",
            "updated_at",
        )
    } | {"result": result}


def get_job(
    connection_factory: ConnectionFactory,
    user: SessionUser,
    account_id: str,
    job_id: str,
    as_of: date,
) -> dict:
    with closing(connection_factory()) as connection:
        authorize(connection, user, account_id)
        initialize_generation(connection)
        row = connection.execute(
            "SELECT * FROM brief_generation_jobs WHERE job_id=? AND account_id=? AND user_id=? AND persona=?",
            (job_id, account_id, user.user_id, user.persona),
        ).fetchone()
        if not row:
            raise HTTPException(404, "This generation job was not found.")
        result = (
            build_brief(connection, user, account_id, as_of)
            if row["status"] == "succeeded"
            else None
        )
        if result and result["generation"]["mode"] == "stored_ai":
            result["generation"]["mode"] = "live_ai"
        return _public_job(row, result)


def _run_job(
    connection_factory: ConnectionFactory,
    user: SessionUser,
    account_id: str,
    job_id: str,
    as_of: date,
    agent_factory: AgentFactory,
) -> None:
    def progress(phase: str, message: str) -> None:
        with closing(connection_factory()) as connection:
            connection.execute(
                "UPDATE brief_generation_jobs SET status='running',phase=?,message=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=?",
                (phase, message, job_id),
            )
            connection.commit()

    try:
        result = generate_account(
            connection_factory, user, account_id, as_of, agent_factory, progress
        )
        with closing(connection_factory()) as connection:
            connection.execute(
                "UPDATE brief_generation_jobs SET status='succeeded',phase='completed',message=?,brief_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=?",
                (
                    "Source-based brief ready. AI is temporarily unavailable."
                    if result["generation"]["mode"] == "offline"
                    else "Brief ready. Review the source-backed preparation cards.",
                    result["latest_brief"]["brief_id"],
                    job_id,
                ),
            )
            connection.commit()
    except Exception as exc:
        logger.warning("Brief generation job %s failed (%s)", job_id, type(exc).__name__)
        with closing(connection_factory()) as connection:
            connection.execute(
                "UPDATE brief_generation_jobs SET status='failed',phase='failed',message='Unable to finish this brief. Your current cards remain available.',error='Generation could not finish. Please retry.',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=?",
                (job_id,),
            )
            connection.commit()


def start_job(
    connection_factory: ConnectionFactory,
    user: SessionUser,
    account_id: str,
    as_of: date,
    force: bool = False,
    agent_factory: AgentFactory = ClientIntelligenceAgent,
) -> dict:
    global _executor
    with _dispatch_lock, closing(connection_factory()) as connection:
        authorize(connection, user, account_id)
        initialize_generation(connection)
        current = build_brief(connection, user, account_id, as_of)
        fingerprint = current["generation"]["source_fingerprint"]
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT * FROM brief_generation_jobs WHERE user_id=? AND account_id=? AND persona=? AND source_fingerprint=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",
            (user.user_id, account_id, user.persona, fingerprint),
        ).fetchone()
        if existing:
            connection.commit()
            return _public_job(existing)
        cached = not force and not current["generation"]["stale"]
        active = connection.execute(
            "SELECT COUNT(*) FROM brief_generation_jobs WHERE status IN ('queued','running')"
        ).fetchone()[0]
        if not cached and active >= MAX_ACTIVE_JOBS:
            connection.rollback()
            raise HTTPException(429, "Brief generation is busy. Please try again shortly.")
        job_id = f"JOB_{uuid.uuid4().hex}"
        connection.execute(
            "INSERT INTO brief_generation_jobs (job_id,user_id,account_id,persona,source_fingerprint,status,phase,message,brief_id) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                job_id,
                user.user_id,
                account_id,
                user.persona,
                fingerprint,
                "succeeded" if cached else "queued",
                "completed" if cached else "queued",
                "Your brief is up to date." if cached else "Queued for client briefing.",
                current["latest_brief"]["brief_id"] if cached else None,
            ),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM brief_generation_jobs WHERE job_id=?", (job_id,)
        ).fetchone()
        if cached:
            return _public_job(row, current)
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="meridian-brief")
        _executor.submit(
            _run_job,
            connection_factory,
            user.model_copy(deep=True),
            account_id,
            job_id,
            as_of,
            agent_factory,
        )
        return _public_job(row)
