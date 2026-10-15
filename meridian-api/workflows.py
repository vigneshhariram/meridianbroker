"""Account-scoped source answers, human review requests and correction history."""

import re
import sqlite3
import uuid
from datetime import date
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from access import authorize, log_security
from agent import BriefTelemetry, ClientIntelligenceAgent
from auth import SessionUser
from intelligence import build_brief
from retrieval import SourceCitation, retrieve_authorized


class WorkflowRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid", strict=True)


class CopilotRequest(WorkflowRequest):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=2000)


class RetrievalMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    method: Literal["sqlite_fts5", "lexical"]
    indexed_records: int
    retrieved_records: int
    snapshot_hash: str
    scope: Literal["selected_account"] = "selected_account"


class CopilotResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    answer: str
    evidence_citations: list[str]
    mode: Literal["live_ai", "source_based"]
    as_of_date: str
    citations: list[SourceCitation]
    retrieval: RetrievalMetadata
    telemetry: BriefTelemetry


class ActionRequest(WorkflowRequest):
    action_type: Literal["draft_followup", "review_task", "referral"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=12000)
    source_fingerprint: str | None = Field(default=None, min_length=1, max_length=128)


class ApprovalRequest(WorkflowRequest):
    approved: bool


class FeedbackRequest(WorkflowRequest):
    suggestion: str = Field(min_length=1, max_length=12000)
    decision: Literal["accepted", "rejected", "corrected"]
    correction: str | None = Field(default=None, max_length=12000)

    @model_validator(mode="after")
    def require_correction(self):
        if self.decision == "corrected" and not self.correction:
            raise ValueError("A correction is required for corrected feedback.")
        return self


def initialize_workflows(connection: sqlite3.Connection) -> None:
    """Add only workflow records; never reset the source or generated data."""
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS client_actions (
            action_id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(account_id),
            user_id TEXT NOT NULL REFERENCES users(user_id),
            action_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending_approval',
            source_fingerprint TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            decided_at TEXT
        );
        CREATE TABLE IF NOT EXISTS client_feedback (
            feedback_id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(account_id),
            user_id TEXT NOT NULL REFERENCES users(user_id),
            suggestion TEXT NOT NULL,
            decision TEXT NOT NULL,
            correction TEXT,
            source_fingerprint TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS client_actions_scope
            ON client_actions(user_id, account_id, created_at);
        CREATE INDEX IF NOT EXISTS client_feedback_scope
            ON client_feedback(user_id, account_id, created_at);
    """)


def list_actions(connection: sqlite3.Connection, user: SessionUser, account_id: str) -> dict:
    authorize(connection, user, account_id)
    initialize_workflows(connection)
    rows = connection.execute(
        "SELECT * FROM client_actions WHERE account_id=? AND user_id=? ORDER BY created_at DESC LIMIT 100",
        (account_id, user.user_id),
    ).fetchall()
    return {"actions": [dict(row) for row in rows]}


def create_action(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    payload: ActionRequest,
    as_of: date,
) -> dict:
    authorize(connection, user, account_id)
    initialize_workflows(connection)
    fingerprint = build_brief(connection, user, account_id, as_of)["generation"][
        "source_fingerprint"
    ]
    if payload.source_fingerprint and payload.source_fingerprint != fingerprint:
        raise HTTPException(
            409,
            "Source records changed. Refresh the brief and review this draft before submitting.",
        )
    action_id = f"ACTION_{uuid.uuid4().hex}"
    connection.execute(
        "INSERT INTO client_actions (action_id,account_id,user_id,action_type,title,description,source_fingerprint) VALUES (?,?,?,?,?,?,?)",
        (
            action_id,
            account_id,
            user.user_id,
            payload.action_type,
            payload.title,
            payload.description,
            fingerprint,
        ),
    )
    log_security(connection, user, "action_submitted_for_approval", account_id, action_id)
    return dict(
        connection.execute(
            "SELECT * FROM client_actions WHERE action_id=?",
            (action_id,),
        ).fetchone()
    )


def decide_action(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    action_id: str,
    approved: bool,
    as_of: date,
) -> dict:
    authorize(connection, user, account_id)
    initialize_workflows(connection)
    connection.execute("BEGIN IMMEDIATE")
    row = connection.execute(
        "SELECT * FROM client_actions WHERE action_id=? AND account_id=? AND user_id=?",
        (action_id, account_id, user.user_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Review request was not found.")
    if row["status"] != "pending_approval":
        raise HTTPException(409, "This review request already has a decision.")
    current = build_brief(connection, user, account_id, as_of)
    if approved and row["source_fingerprint"] != current["generation"]["source_fingerprint"]:
        raise HTTPException(
            409, "Source records changed. Review the current brief and submit a new request."
        )
    status = "approved" if approved else "rejected"
    connection.execute(
        "UPDATE client_actions SET status=?,decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE action_id=?",
        (status, action_id),
    )
    # Approval records a human decision only; it sends nothing and changes no policy.
    log_security(connection, user, f"action_{status}", account_id, action_id)
    return dict(
        connection.execute(
            "SELECT * FROM client_actions WHERE action_id=?",
            (action_id,),
        ).fetchone()
    )


def save_feedback(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    payload: FeedbackRequest,
    as_of: date,
) -> dict:
    authorize(connection, user, account_id)
    initialize_workflows(connection)
    fingerprint = build_brief(connection, user, account_id, as_of)["generation"][
        "source_fingerprint"
    ]
    feedback_id = f"FEEDBACK_{uuid.uuid4().hex}"
    connection.execute(
        "INSERT INTO client_feedback (feedback_id,account_id,user_id,suggestion,decision,correction,source_fingerprint) VALUES (?,?,?,?,?,?,?)",
        (
            feedback_id,
            account_id,
            user.user_id,
            payload.suggestion,
            payload.decision,
            payload.correction,
            fingerprint,
        ),
    )
    log_security(connection, user, f"feedback_{payload.decision}", account_id, feedback_id)
    return dict(
        connection.execute(
            "SELECT feedback_id,decision,created_at FROM client_feedback WHERE feedback_id=?",
            (feedback_id,),
        ).fetchone()
    )


def answer_question(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    question: str,
    as_of: date,
) -> dict:
    """Grounded, typed keyword RAG over permitted current relational records."""
    question = CopilotRequest(question=question).question
    authorize(connection, user, account_id)
    text = question.casefold()
    mentioned_ids = re.findall(r"\bA\d+\b", question, flags=re.IGNORECASE)
    other_name = any(
        row["name"].casefold() in text
        for row in connection.execute(
            "SELECT account_id,name FROM accounts WHERE account_id!=?", (account_id,)
        )
        if row["name"]
    )
    if other_name or any(identifier.upper() != account_id.upper() for identifier in mentioned_ids):
        log_security(connection, user, "copilot_scope_denied", account_id)
        raise HTTPException(
            403,
            "Ask about the selected client only; other client information is not available here.",
        )
    sensitive = (
        (("claim", "loss", "reserve"), "claims"),
        (("policy", "policies", "endorsement", "coverage", "renewal"), "policies"),
        (("invoice", "billing", "payment"), "billing"),
        (("service", "case", "complaint"), "service-cases"),
        (("document", "email", "note"), "documents"),
    )
    for keywords, resource in sensitive:
        if any(word in text for word in keywords):
            authorize(connection, user, account_id, resource)
    retrieved = retrieve_authorized(connection, user, account_id, question, as_of.isoformat())
    with ClientIntelligenceAgent() as agent:
        generated, telemetry = agent.answer_retrieved(retrieved)
    lookup = {(row.source_table, row.source_id): row for row in retrieved.records}
    if generated:
        answer = generated.answer
        citations = list(
            {
                (cite.source_table, cite.source_id): lookup[(cite.source_table, cite.source_id)]
                for cite in generated.citations
            }.values()
        )
        mode = "live_ai"
    else:
        citations = retrieved.records
        if citations:
            answer = "Current accessible source records (human review required):\n\n" + "\n\n".join(
                f"{row.title} [{row.source_id}]: {row.excerpt[:1800]}" for row in citations
            )
            answer += "\n\nThese records do not establish facts beyond their contents. Coverage suggestions require client validation and human approval."
        else:
            answer = "No matching records were found in the selected client's accessible sources. This does not establish that no issue exists. Try a specific claim, policy, document or activity."
        mode = "source_based"
    log_security(connection, user, f"copilot_{mode}", account_id, retrieved.snapshot_hash)
    return CopilotResponse(
        answer=answer,
        evidence_citations=list(dict.fromkeys(row.source_id for row in citations)),
        mode=mode,
        as_of_date=as_of.isoformat(),
        citations=citations,
        retrieval=RetrievalMetadata(
            method=retrieved.method,
            indexed_records=retrieved.indexed_records,
            retrieved_records=len(retrieved.records),
            snapshot_hash=retrieved.snapshot_hash,
        ),
        telemetry=BriefTelemetry.model_validate(telemetry),
    ).model_dump()
