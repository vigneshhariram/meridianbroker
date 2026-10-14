"""Regional portfolio metrics; every aggregate uses the same authorized account set."""

import sqlite3
from collections import Counter
from datetime import date

from fastapi import HTTPException

from access import allowed_accounts, require_leader
from auth import SessionUser
from intelligence import RANK, build_brief


def build_portfolio(
    connection: sqlite3.Connection,
    user: SessionUser,
    as_of: date,
    producer_id: str | None = None,
    risk_level: str | None = None,
    renewal_days: int = 0,
) -> dict:
    require_leader(user)
    scope = allowed_accounts(connection, user)
    producers = sorted(
        {row["owner_user_id"]: row["producer_name"] for row in scope}.items(),
        key=lambda item: item[1],
    )
    if producer_id and producer_id not in dict(producers):
        raise HTTPException(403, "This producer is outside your regional access.")
    briefs = [
        build_brief(connection, user, row["account_id"], as_of)
        for row in scope
        if not producer_id or row["owner_user_id"] == producer_id
    ]
    if risk_level:
        briefs = [brief for brief in briefs if brief["account"]["risk_level"] == risk_level]
    if renewal_days:
        briefs = [
            brief
            for brief in briefs
            if brief["days_to_renewal"] is not None and brief["days_to_renewal"] <= renewal_days
        ]
    names = dict(producers)
    accounts = []
    for brief in briefs:
        account = brief["account"]
        signals = brief["risks"] or brief["opportunities"]
        top = signals[0] if signals else None
        overdue = [item for item in brief["commitments"] if item["status"] == "overdue"]
        flags = []
        if brief["contradictions"]:
            flags.append("Date conflict")
        if overdue:
            flags.append("Overdue")
        if any(signal["category"] == "endorsement" for signal in brief["risks"]):
            flags.append("Endorsement")
        accounts.append(
            {
                "account_id": account["account_id"],
                "name": account["name"],
                "producer_id": account["owner_user_id"],
                "producer_name": names[account["owner_user_id"]],
                "annual_premium": float(account["annual_premium"] or 0),
                "risk_level": account["risk_level"],
                "days_to_renewal": brief["days_to_renewal"],
                "open_claims": brief["snapshot"]["open_claim_count"],
                "high_severity_claims": sum(
                    signal["category"] == "claims" and signal["severity"] == "high"
                    for signal in brief["risks"]
                ),
                "overdue_commitments": len(overdue),
                "has_date_conflict": bool(brief["contradictions"]),
                "top_signal": {
                    "title": top["title"],
                    "confidence": float(top["confidence"] or 0),
                    "is_fact": bool(top["is_fact"]),
                }
                if top
                else None,
                "flags": flags,
                "signals": [
                    {
                        "title": s["title"],
                        "severity": s["severity"],
                        "confidence": float(s["confidence"] or 0),
                    }
                    for s in sorted(
                        brief["risks"],
                        key=lambda signal: {
                            "claims": 0,
                            "endorsement": 1,
                            "data_conflict": 2,
                            "service": 3,
                            "billing": 4,
                            "commitment": 5,
                        }.get(signal["category"], 6),
                    )[:4]
                ],
                "overdue_items": [item["description"] for item in overdue],
            }
        )
    accounts.sort(
        key=lambda row: (
            RANK[row["risk_level"]],
            row["days_to_renewal"] if row["days_to_renewal"] is not None else 99999,
            row["name"],
        )
    )
    upcoming = [
        row
        for row in accounts
        if row["days_to_renewal"] is not None and row["days_to_renewal"] <= 30
    ]
    high_risk = [row for row in accounts if row["risk_level"] == "high"]
    conflicts = [row for row in accounts if row["has_date_conflict"]]
    overdue_clients = [row for row in accounts if row["overdue_commitments"]]
    high_claims = sum(row["high_severity_claims"] for row in accounts)
    distribution = Counter(row["risk_level"] for row in accounts)
    workloads = []
    for user_id, name in producers:
        owned = [row for row in accounts if row["producer_id"] == user_id]
        if producer_id and producer_id != user_id:
            continue
        workloads.append(
            {
                "producer_id": user_id,
                "name": name,
                "clients": len(owned),
                "high_risk": sum(row["risk_level"] == "high" for row in owned),
                "open_claims": sum(row["open_claims"] for row in owned),
                "overdue": sum(row["overdue_commitments"] for row in owned),
            }
        )
    timeline = []
    for start, end, label in [
        (0, 30, "0 to 30 days"),
        (31, 60, "31 to 60 days"),
        (61, 90, "61 to 90 days"),
    ]:
        bucket = [
            row
            for row in accounts
            if row["days_to_renewal"] is not None and start <= row["days_to_renewal"] <= end
        ]
        timeline.append(
            {
                "label": label,
                "count": len(bucket),
                "premium": sum(row["annual_premium"] for row in bucket),
                "accounts": [
                    {
                        "account_id": row["account_id"],
                        "name": row["name"],
                        "days": row["days_to_renewal"],
                        "risk_level": row["risk_level"],
                    }
                    for row in bucket
                ],
            }
        )
    sources = []
    for brief in briefs:
        for signal in brief["risks"]:
            if signal["category"] in ("claims", "data_conflict", "commitment"):
                for ev in signal["evidence"]:
                    sources.append(
                        {
                            "source_id": ev["source_id"],
                            "source_table": ev["source_table"],
                            "system": ev["source_system"],
                            "title": signal["title"],
                        }
                    )
    sources = list({(source["source_id"], source["system"]): source for source in sources}.values())
    conflict_names = ", ".join(row["name"] for row in conflicts)
    summary = f"{len(upcoming)} renewal(s) fall within 30 days or are past due, representing ${sum(row['annual_premium'] for row in upcoming):,.0f} in annual account premium. {high_claims} high-severity claim(s) remain open. "
    summary += (
        f"{conflict_names} have renewal dates that conflict across systems. "
        if conflicts
        else "No renewal-date conflicts are currently flagged. "
    )
    summary += f"{sum(row['overdue_commitments'] for row in accounts)} overdue commitment(s) sit with {len(overdue_clients)} client(s)."
    return {
        "region": user.region,
        "as_of_date": as_of.isoformat(),
        "total_accounts": len(accounts),
        "total_region_accounts": len(scope),
        "total_annual_premium": sum(row["annual_premium"] for row in accounts),
        "premium_at_risk": sum(row["annual_premium"] for row in high_risk),
        "renewals_30_days": len(upcoming),
        "renewals_30_days_premium": sum(row["annual_premium"] for row in upcoming),
        "high_risk_clients": len(high_risk),
        "open_high_severity_claims": high_claims,
        "overdue_commitments": sum(row["overdue_commitments"] for row in accounts),
        "overdue_clients": len(overdue_clients),
        "risk_distribution": {level: distribution[level] for level in RANK},
        "total_open_claims": sum(row["open_claims"] for row in accounts),
        "total_open_cases": sum(brief["snapshot"]["open_service_case_count"] for brief in briefs),
        "locked_count": connection.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        - len(scope),
        "accounts": accounts,
        "producers": [{"user_id": user_id, "name": name} for user_id, name in producers],
        "workloads": workloads,
        "timeline": timeline,
        "summary": summary,
        "sources": sources,
        "filters": {
            "producer_id": producer_id,
            "risk_level": risk_level,
            "renewal_days": renewal_days,
        },
    }
