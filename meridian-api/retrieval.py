"""Request-local keyword RAG over an already permission-filtered SQL snapshot.

FTS5 is an intermediary index, not a semantic/vector store. Nothing is persisted
and source text is always data, never executable SQL or agent instructions.
"""

import hashlib
import json
import re
import sqlite3
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from access import RESOURCE_COLUMNS, SOURCE_RESOURCES, authorize
from auth import SessionUser


class StrictRetrievalModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class SourceCitation(StrictRetrievalModel):
    source_id: str = Field(min_length=1)
    source_table: str = Field(min_length=1)
    account_id: str = Field(min_length=1)
    title: str
    excerpt: str
    content_hash: str


class RetrievalContext(StrictRetrievalModel):
    account_id: str
    question: str = Field(min_length=1, max_length=2000)
    as_of_date: str
    method: Literal["sqlite_fts5", "lexical"]
    indexed_records: int
    snapshot_hash: str
    records: list[SourceCitation]
    mandatory_claim_ids: list[str]


class CitationReference(StrictRetrievalModel):
    source_id: str = Field(min_length=1)
    source_table: str = Field(min_length=1)


class GroundedAnswer(StrictRetrievalModel):
    answer: str = Field(min_length=1, max_length=12000)
    citations: list[CitationReference] = Field(min_length=1, max_length=100)


SOURCE_KEYS = {
    "claims": "claim_id",
    "policies": "policy_id",
    "endorsements": "endorsement_id",
    "billing": "invoice_id",
    "service_cases": "case_id",
    "documents": "doc_id",
    "activities": "activity_id",
    "commitments": "commitment_id",
}


def retrieve_authorized(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    question: str,
    as_of_date: str,
) -> RetrievalContext:
    rule = authorize(connection, user, account_id)
    data: dict[str, list[dict]] = {}
    connection.execute("SAVEPOINT retrieval_snapshot")
    try:
        for table in SOURCE_KEYS:
            resource = SOURCE_RESOURCES.get(table)
            if resource and not rule[RESOURCE_COLUMNS[resource]]:
                continue
            # Table names come only from the fixed mapping, never the question.
            data[table] = [
                dict(row)
                for row in connection.execute(
                    f"SELECT * FROM {table} WHERE account_id=?",
                    (account_id,),
                )
            ]
    finally:
        connection.execute("RELEASE SAVEPOINT retrieval_snapshot")
    return retrieve_snapshot(account_id, question, as_of_date, data)


def retrieve_snapshot(
    account_id: str,
    question: str,
    as_of_date: str,
    permitted_records: dict[str, list[dict]],
    limit: int = 12,
) -> RetrievalContext:
    """Index only caller-authorized, same-client records; preserve every open claim."""
    # Validate before tokenization or indexing, including internal callers.
    if not isinstance(question, str) or not question.strip() or len(question) > 2000:
        raise ValueError("Question must contain 1-2000 characters")
    sources: list[SourceCitation] = []
    mandatory: list[str] = []
    for table, key in SOURCE_KEYS.items():
        for row in permitted_records.get(table, []):
            if str(row.get("account_id", "")) != account_id or not row.get(key):
                continue
            source_id = str(row[key])
            canonical = json.dumps(row, sort_keys=True, ensure_ascii=False, default=str)
            excerpt = "; ".join(
                f"{name.replace('_', ' ')}: {value}"
                for name, value in row.items()
                if value is not None and name != "account_id"
            )[:4000]
            sources.append(
                SourceCitation(
                    source_id=source_id,
                    source_table=table,
                    account_id=account_id,
                    title=str(
                        row.get("title")
                        or row.get("claim_number")
                        or row.get("case_number")
                        or row.get("policy_number")
                        or source_id
                    ),
                    excerpt=excerpt,
                    content_hash=hashlib.sha256(canonical.encode()).hexdigest(),
                )
            )
            if table == "claims" and str(row.get("status", "")).casefold() == "open":
                mandatory.append(source_id)
    sources.sort(key=lambda source: (source.source_table, source.source_id))
    fingerprint = hashlib.sha256(
        "|".join(
            [
                account_id,
                as_of_date,
                *(f"{row.source_table}:{row.source_id}:{row.content_hash}" for row in sources),
            ]
        ).encode()
    ).hexdigest()
    # Only normalized alphanumeric tokens enter MATCH; user FTS syntax is never used.
    tokens = list(dict.fromkeys(re.findall(r"[a-z0-9]{2,}", question.casefold())))[:40]
    ranked: list[int] = []
    method = "sqlite_fts5"
    index = sqlite3.connect(":memory:")
    try:
        index.execute("CREATE VIRTUAL TABLE evidence USING fts5(content)")
        index.executemany(
            "INSERT INTO evidence(rowid,content) VALUES (?,?)",
            [
                (number + 1, f"{source.source_table} {source.title} {source.excerpt}")
                for number, source in enumerate(sources)
            ],
        )
        if tokens:
            expression = " OR ".join(f'"{token}"' for token in tokens)
            ranked = [
                row[0] - 1
                for row in index.execute(
                    "SELECT rowid FROM evidence WHERE evidence MATCH ? ORDER BY bm25(evidence),rowid LIMIT ?",
                    (expression, max(1, min(limit, 30))),
                )
            ]
    except sqlite3.OperationalError:
        method = "lexical"
        scores = [
            (
                sum(
                    token in f"{row.source_table} {row.title} {row.excerpt}".casefold()
                    for token in tokens
                ),
                number,
            )
            for number, row in enumerate(sources)
        ]
        ranked = [
            number
            for score, number in sorted(scores, key=lambda item: (-item[0], item[1]))
            if score
        ][:limit]
    finally:
        index.close()
    selected = {number for number, row in enumerate(sources) if row.source_id in mandatory}
    selected.update(ranked)
    return RetrievalContext(
        account_id=account_id,
        question=question.strip(),
        as_of_date=as_of_date,
        method=method,
        indexed_records=len(sources),
        snapshot_hash=fingerprint,
        records=[sources[number] for number in sorted(selected)],
        mandatory_claim_ids=mandatory,
    )
