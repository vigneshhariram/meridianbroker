"""Shared authorization for account lists, details, evidence and writes."""

import sqlite3

from fastapi import HTTPException

from auth import SessionUser

RESOURCE_COLUMNS = {
    "policies": "can_view_policies",
    "claims": "can_view_claims",
    "service-cases": "can_view_service_cases",
    "billing": "can_view_billing",
    "documents": "can_view_documents",
}
SOURCE_RESOURCES = {
    "policies": "policies",
    "claims": "claims",
    "service_cases": "service-cases",
    "billing": "billing",
    "documents": "documents",
    "endorsements": "policies",
}


def scope_sql(user: SessionUser) -> tuple[str, tuple]:
    if user.persona == "regional_leader":
        return "a.region=?", (user.region,)
    return "a.owner_user_id=?", (user.user_id,)


def allowed_accounts(connection: sqlite3.Connection, user: SessionUser) -> list[dict]:
    scope, params = scope_sql(user)
    return [
        dict(row)
        for row in connection.execute(
            f"""
        SELECT a.*, u.name AS producer_name FROM accounts a
        JOIN access_rules r ON r.account_id=a.account_id AND r.user_id=? AND r.allowed=1
        JOIN users u ON u.user_id=a.owner_user_id WHERE {scope}
        ORDER BY a.account_id
    """,
            (user.user_id, *params),
        )
    ]


def log_security(
    connection: sqlite3.Connection,
    user: SessionUser,
    event: str,
    account_id: str | None = None,
    detail: str = "",
) -> None:
    connection.execute(
        "INSERT INTO security_events (user_id,account_id,event,detail) VALUES (?,?,?,?)",
        (user.user_id, account_id, event, detail),
    )
    connection.commit()


def authorize(
    connection: sqlite3.Connection, user: SessionUser, account_id: str, resource: str = "general"
) -> dict:
    row = connection.execute(
        """
        SELECT a.owner_user_id, a.region, r.* FROM accounts a
        LEFT JOIN access_rules r ON r.account_id=a.account_id AND r.user_id=? WHERE a.account_id=?
    """,
        (user.user_id, account_id),
    ).fetchone()
    in_scope = row and (
        row["region"] == user.region
        if user.persona == "regional_leader"
        else row["owner_user_id"] == user.user_id
    )
    column = RESOURCE_COLUMNS.get(resource)
    if not in_scope or not row["allowed"] or (column and not row[column]):
        log_security(connection, user, "access_denied", account_id, resource)
        raise HTTPException(403, "This client or record is outside your authorized access.")
    return dict(row)


def verify_identity(supplied: str | None, user: SessionUser) -> None:
    if supplied is not None and supplied != user.user_id:
        raise HTTPException(403, "The requested identity does not match your session.")


def require_leader(user: SessionUser) -> None:
    if user.persona != "regional_leader":
        raise HTTPException(403, "Regional leader access is required.")
