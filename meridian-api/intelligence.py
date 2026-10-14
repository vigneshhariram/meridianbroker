"""Account-scoped, rule-based intelligence computed from current relational records."""

import json
import sqlite3
from datetime import date

from access import RESOURCE_COLUMNS, SOURCE_RESOURCES, authorize
from agent import (
    BriefAgentInputContext,
    ClaimContext,
    ContradictionContext,
    OpportunitySignalContext,
    PolicyContext,
    RiskSignalContext,
)
from auth import SessionUser

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
RANK = {"high": 0, "medium": 1, "low": 2}


def fetch_rows(connection: sqlite3.Connection, table: str, account_id: str) -> list[dict]:
    return [
        dict(row)
        for row in connection.execute(f"SELECT * FROM {table} WHERE account_id=?", (account_id,))
    ]


def build_brief(
    connection: sqlite3.Connection, user: SessionUser, account_id: str, as_of: date
) -> dict:
    rule = authorize(connection, user, account_id)
    permissions = {name: bool(rule[column]) for name, column in RESOURCE_COLUMNS.items()}
    account = dict(
        connection.execute("SELECT * FROM accounts WHERE account_id=?", (account_id,)).fetchone()
    )
    data = {}
    for table in SOURCE_KEYS:
        resource = SOURCE_RESOURCES.get(table)
        data[table] = (
            fetch_rows(connection, table, account_id)
            if not resource or permissions[resource]
            else []
        )
    source_records = {
        table: {row[key]: row for row in data[table]} for table, key in SOURCE_KEYS.items()
    }
    policies = [row for row in data["policies"] if row["status"] == "active"]
    renewal_dates = [
        date.fromisoformat(row["renewal_date"]) for row in policies if row["renewal_date"]
    ]
    next_renewal = min(renewal_dates) if renewal_dates else None
    days = (next_renewal - as_of).days if next_renewal else None
    primary = connection.execute(
        "SELECT * FROM contacts WHERE account_id=? AND is_primary=1 LIMIT 1", (account_id,)
    ).fetchone()
    account.update(
        days_to_renewal=days,
        primary_contact_name=primary["name"] if primary else None,
        primary_contact_role=primary["role"] if primary else None,
    )
    risks, opportunities, contradictions = [], [], []
    source_scores = {
        row["source_system"]: float(row["score"])
        for row in connection.execute("SELECT * FROM source_reliability")
    }
    bands = list(connection.execute("SELECT * FROM recency_bands ORDER BY max_age_days"))

    def evidence(table: str, record: dict, snippet: str, signal_id: str, suffix: str = "") -> dict:
        system = record.get("source_system") or "Salesforce CRM"
        recency = (
            record.get("updated_at")
            or record.get("uploaded_at")
            or record.get("activity_date")
            or record.get("requested_at")
            or as_of.isoformat()
        )
        age = max(0, (as_of - date.fromisoformat(recency)).days)
        factor = next(
            (float(band["factor"]) for band in bands if age <= band["max_age_days"]), 0.65
        )
        score = source_scores.get(system, 0.7)
        return {
            "evidence_id": f"live:{table}:{record[SOURCE_KEYS[table]]}{suffix}",
            "signal_id": signal_id,
            "source_table": table,
            "source_id": record[SOURCE_KEYS[table]],
            "source_system": system,
            "snippet": snippet,
            "recency_date": recency,
            "source_score": score,
            "recency_factor": factor,
            "confidence": round(score * factor, 2),
        }

    def add_risk(
        category: str,
        table: str,
        record: dict,
        title: str,
        description: str,
        severity: str,
        rule_id: str | None = None,
        custom_evidence: list[dict] | None = None,
    ) -> dict:
        signal_id = f"live:{category}:{record[SOURCE_KEYS[table]]}"
        ev_list = custom_evidence or [evidence(table, record, description, signal_id)]
        risk = {
            "signal_id": signal_id,
            "account_id": account_id,
            "signal_type": "risk",
            "category": category,
            "title": title,
            "description": description,
            "severity": severity,
            "is_fact": True,
            "confidence": ev_list[0]["confidence"],
            "assumptions": None,
            "rule_id": rule_id,
            "status": "active",
            "created_at": as_of.isoformat(),
            "evidence": ev_list,
            "confidence_breakdown": {
                "source_score": ev_list[0]["source_score"],
                "recency_factor": ev_list[0]["recency_factor"],
            },
        }
        risks.append(risk)
        return risk

    policy_map = {row["policy_id"]: row for row in data["policies"]}

    # R1: Open claim on a policy renewing within 60 days (Severity: the claim's own severity)
    open_claims = [row for row in data["claims"] if row["status"] == "open"]
    for row in open_claims:
        policy = policy_map.get(row.get("policy_id"))
        p_renewal = (
            date.fromisoformat(policy["renewal_date"])
            if policy and policy.get("renewal_date")
            else None
        )
        p_days = (p_renewal - as_of).days if p_renewal else None
        if p_days is not None and p_days <= 60:
            severity = row["severity"] or "medium"
            add_risk(
                "claims",
                "claims",
                row,
                f"Open claim {row['claim_number']}",
                row["summary"] or f"Claim remains open ahead of renewal in {p_days} days.",
                severity,
                rule_id="R1",
            )

    # R3: Endorsement pending, policy renews within 90 days
    # Medium if renewal within 30 days, else low
    for row in data["endorsements"]:
        if row["status"] == "pending":
            policy = policy_map.get(row.get("policy_id"))
            p_renewal = (
                date.fromisoformat(policy["renewal_date"])
                if policy and policy.get("renewal_date")
                else None
            )
            p_days = (p_renewal - as_of).days if p_renewal else None
            if p_days is not None and p_days <= 90:
                severity = "medium" if p_days <= 30 else "low"
                add_risk(
                    "endorsement",
                    "endorsements",
                    row,
                    "Endorsement pending",
                    row["description"] or f"Pending endorsement with renewal in {p_days} days.",
                    severity,
                    rule_id="R3",
                )

    # R4: Service case is open. Medium for Claims Handling or Billing, else low
    open_cases = [row for row in data["service_cases"] if row["status"] == "open"]
    for row in open_cases:
        cat = row.get("category") or ""
        severity = "medium" if cat in ("Claims Handling", "Billing") else "low"
        add_risk(
            "service",
            "service_cases",
            row,
            f"Open {cat.lower() or 'service'} issue",
            row["issue"] or "Service case remains open.",
            severity,
            rule_id="R4",
        )

    # R6: Commitment past due and not done (Severity: Medium)
    commitments = [row for row in data["commitments"] if row["status"] != "done"]
    for row in commitments:
        if row["due_date"] and date.fromisoformat(row["due_date"]) < as_of:
            row["status"] = "overdue"
        if row["status"] == "overdue":
            add_risk(
                "commitment",
                "commitments",
                row,
                "Overdue commitment",
                row["description"],
                "medium",
                rule_id="R6",
            )

    # R7: Invoice overdue (Severity: Medium)
    for row in data["billing"]:
        if row["status"] == "overdue" or (
            row["status"] == "due"
            and row["due_date"]
            and date.fromisoformat(row["due_date"]) < as_of
        ):
            add_risk(
                "billing",
                "billing",
                row,
                "Overdue invoice",
                f"Invoice {row['invoice_id']} remains unpaid; amount ${row['amount']:,.0f}.",
                "medium",
                rule_id="R7",
            )

    # R2: Conflicting renewal dates (Policy Admin vs CRM)
    # Severity: Medium. Uses weakest conflicting source, no corroboration.
    for row in policies:
        if row["crm_renewal_date"] and row["crm_renewal_date"] != row["renewal_date"]:
            existing = connection.execute(
                "SELECT contradiction_id FROM contradictions WHERE account_id=? AND policy_id=? AND field='renewal_date' AND status='needs_review'",
                (account_id, row["policy_id"]),
            ).fetchone()
            contradictions.append(
                {
                    "contradiction_id": existing[0]
                    if existing
                    else f"live:conflict:{row['policy_id']}",
                    "account_id": account_id,
                    "policy_id": row["policy_id"],
                    "field": "renewal_date",
                    "value_a": row["renewal_date"],
                    "source_a": row["source_system"],
                    "value_b": row["crm_renewal_date"],
                    "source_b": "Salesforce CRM",
                    "status": "needs_review",
                    "detected_at": as_of.isoformat(),
                }
            )
            conflict_risk = add_risk(
                "data_conflict",
                "policies",
                row,
                "Renewal dates conflict",
                f"Policy Admin: {row['renewal_date']}; CRM: {row['crm_renewal_date']}. Human review required.",
                "medium",
                rule_id="R2",
            )
            crm = {**row, "source_system": "Salesforce CRM", "updated_at": row["crm_updated_at"]}
            crm_ev = evidence(
                "policies",
                crm,
                f"CRM renewal: {row['crm_renewal_date']}",
                conflict_risk["signal_id"],
                ":crm",
            )
            conflict_risk["evidence"].append(crm_ev)

    # R8: Last logged activity over 180 days old (Severity: Low)
    if data["activities"]:
        dated_acts = [row for row in data["activities"] if row.get("activity_date")]
        if dated_acts:
            latest_act = max(dated_acts, key=lambda a: date.fromisoformat(a["activity_date"]))
            act_age = (as_of - date.fromisoformat(latest_act["activity_date"])).days
            if act_age > 180:
                add_risk(
                    "engagement",
                    "activities",
                    latest_act,
                    "No recent client meeting",
                    f"Last logged activity was {act_age} days ago ({latest_act['activity_date']}).",
                    "low",
                    rule_id="R8",
                )

    # R9: Notes contain risk words (price, unhappy, concern, frustrated, complaint) (Severity: Low)
    risk_words = ("price", "unhappy", "concern", "frustrated", "complaint")
    flagged_r9 = False
    for act in data["activities"]:
        notes = (act.get("notes") or "").lower()
        if any(w in notes for w in risk_words):
            add_risk(
                "pricing",
                "activities",
                act,
                "Client risk language in notes",
                act.get("notes") or "Risk language noted in recent activity.",
                "low",
                rule_id="R9",
            )
            flagged_r9 = True
            break
    if not flagged_r9:
        for doc in data["documents"]:
            content = (doc.get("content_text") or "").lower()
            if any(w in content for w in risk_words):
                add_risk(
                    "pricing",
                    "documents",
                    doc,
                    "Risk language in client documents",
                    doc.get("content_text") or "Risk language in document store.",
                    "low",
                    rule_id="R9",
                )
                break

    # R10: Policy record not updated in over 540 days (Severity: Low)
    for pol in policies:
        if pol.get("updated_at"):
            pol_age = (as_of - date.fromisoformat(pol["updated_at"])).days
            if pol_age > 540:
                add_risk(
                    "data_quality",
                    "policies",
                    pol,
                    "Policy data not updated in 18+ months",
                    f"Policy {pol.get('policy_number')} last updated {pol.get('updated_at')} ({pol_age} days ago).",
                    "low",
                    rule_id="R10",
                )

    # Corroboration formula across all dynamically computed risks:
    # Risk % = min(0.98, strongest evidence % + corroboration)
    # Corroboration: +0.05 per additional independent source system, up to +0.10.
    # Conflicts (R2): use the weakest conflicting source and add no corroboration.
    for r in risks:
        if r["category"] == "data_conflict":
            r["confidence"] = round(min(float(ev["confidence"]) for ev in r["evidence"]), 2)
            r["confidence_breakdown"] = {
                "type": "risk",
                "formula": "min(confidences)",
                "conflict_uses_weaker_source": True,
                "corroboration": 0.0,
            }
        else:
            ev_scores = [float(ev["confidence"]) for ev in r["evidence"]]
            strongest = max(ev_scores)
            systems = {ev["source_system"] for ev in r["evidence"] if ev.get("source_system")}
            extra_sources = max(0, len(systems) - 1)
            corroboration = min(0.10, extra_sources * 0.05)
            r["confidence"] = round(min(0.98, strongest + corroboration), 2)
            r["confidence_breakdown"] = {
                "type": "risk",
                "formula": "min(0.98, strongest_evidence + corroboration)",
                "strongest_evidence": round(strongest, 2),
                "corroboration": round(corroboration, 2),
                "extra_independent_sources": extra_sources,
            }

    # Retain curated note/opportunity signals only when their evidence is accessible
    # and still resolves to records belonging to the selected account.
    dynamic_categories = {
        "claims",
        "endorsement",
        "service",
        "commitment",
        "billing",
        "data_conflict",
        "engagement",
        "pricing",
        "data_quality",
    }
    for stored in fetch_rows(connection, "signals", account_id):
        if stored["status"] != "active" or (
            stored["signal_type"] == "risk" and stored["category"] in dynamic_categories
        ):
            continue
        evs = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM evidence WHERE signal_id=?", (stored["signal_id"],)
            )
        ]
        if not evs or any(
            ev["source_id"] not in source_records.get(ev["source_table"], {}) for ev in evs
        ):
            continue
        stored["evidence"] = evs
        stored["confidence_breakdown"] = (
            json.loads(stored["confidence_breakdown"])
            if stored.get("confidence_breakdown")
            else None
        )
        (risks if stored["signal_type"] == "risk" else opportunities).append(stored)

    risks.sort(
        key=lambda signal: (
            RANK.get(signal["severity"], 2),
            0 if signal["category"] == "commitment" else 1,
            -float(signal["confidence"] or 0),
        )
    )
    opportunities.sort(key=lambda signal: -float(signal["confidence"] or 0))

    # Client risk level roll-up (Section 6):
    # High: at least one high-severity risk with confidence >= 50%
    # Medium: no high, but at least one medium-severity risk with confidence >= 50%
    # Low: neither. Opportunities never affect risk level.
    qualified_risks = [s for s in risks if float(s.get("confidence") or 0) >= 0.50]
    if any(s["severity"] == "high" for s in qualified_risks):
        risk_level = "high"
    elif any(s["severity"] == "medium" for s in qualified_risks):
        risk_level = "medium"
    else:
        risk_level = "low"
    account["risk_level"] = risk_level

    milestone_rows = []
    if permissions["policies"]:
        milestone_rows = [
            dict(row)
            for row in connection.execute(
                "SELECT m.* FROM renewal_milestones m JOIN policies p ON p.policy_id=m.policy_id WHERE p.account_id=? ORDER BY m.due_date",
                (account_id,),
            )
        ]

    latest = connection.execute(
        "SELECT * FROM briefs WHERE account_id=? AND persona=? ORDER BY version DESC,generated_at DESC LIMIT 1",
        (account_id, user.persona),
    ).fetchone()
    latest_content = {}
    telemetry = None
    if latest and latest["content_json"]:
        raw_json = latest["content_json"]
        latest_content = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
        if isinstance(latest_content, dict) and "telemetry" in latest_content:
            telemetry = latest_content["telemetry"]
    omitted_item = latest_content.get("omitted") if isinstance(latest_content, dict) else None

    # Check brief completeness check: passed if permissions exist and no omission
    completeness_passed = (
        bool(latest["completeness_check_passed"])
        if latest and latest["completeness_check_passed"] is not None
        else permissions["claims"]
    )
    if omitted_item:
        completeness_passed = False

    claim_review_complete = bool(permissions["claims"] and completeness_passed)
    claim_review = {
        "reviewed": max(0, len(open_claims) - (1 if omitted_item else 0)),
        "total": len(open_claims),
        "complete": claim_review_complete,
        "omitted": omitted_item,
    }

    rule_agenda = []
    idx = 1
    if contradictions:
        for c in contradictions:
            rule_agenda.append(
                f"{idx}. Reconcile conflicting renewal dates ({c['source_a']} {c['value_a']} vs {c['source_b']} {c['value_b']}) before binding."
            )
            idx += 1
            break
    for clm in open_claims:
        rule_agenda.append(
            f"{idx}. Review status of open {clm['severity']} claim {clm['claim_number']} ({clm['summary']})."
        )
        idx += 1
    for signal in risks[:3]:
        if not any(clm["claim_number"] in signal["title"] for clm in open_claims):
            rule_agenda.append(f"{idx}. Address {signal['title']} ({signal['severity']} severity).")
            idx += 1
    if opportunities:
        rule_agenda.append(
            f"{idx}. Validate client need for {opportunities[0]['title'].lower()} (unverified hypothesis)."
        )
        idx += 1
    if not rule_agenda:
        rule_agenda.append("1. Confirm stewardship goals and carrier renewal milestones.")

    rule_summary = f"{account['name']} has {risk_level} renewal risk"
    rule_summary += (
        f"; next renewal is {next_renewal.isoformat()} ({days} days). "
        if next_renewal
        else "; no renewal date is available. "
    )
    rule_summary += f"{len(open_claims)} open claim(s), {len(open_cases)} open service case(s), and {sum(row['status'] == 'overdue' for row in commitments)} overdue commitment(s). "
    if contradictions:
        rule_summary += "Conflicting renewal dates require human review. "
    if risks:
        rule_summary += "Prioritize: " + "; ".join(signal["title"] for signal in risks[:3]) + "."
    if not all(permissions.values()):
        rule_summary += (
            " Some record types are restricted; this brief covers accessible evidence only."
        )

    default_talking_points = []
    if user.persona == "regional_leader":
        default_talking_points.append(
            f"Portfolio impact: {account['name']} represents ${float(account.get('annual_premium') or 0):,.0f} annual premium in {risk_level} risk tier."
        )
    else:
        default_talking_points.append(
            f"Confirmed fact: Account status is {risk_level} risk with {days or 'unknown'} days to renewal."
        )
    for clm in open_claims:
        default_talking_points.append(
            f"Confirmed fact: Open claim {clm['claim_number']} ({clm['summary']}) has active reserve and requires underwriter review."
        )
    for c in contradictions:
        default_talking_points.append(
            f"Confirmed discrepancy: {c['field']} differs between {c['source_a']} ({c['value_a']}) and {c['source_b']} ({c['value_b']}); resolve prior to binding."
        )
    for opp in opportunities:
        conf_pct = int(float(opp.get("confidence") or 0.5) * 100)
        default_talking_points.append(
            f"Hypothesis (unverified): {opp['title']} ({conf_pct}% confidence) based on account activity; validate need before coverage modeling."
        )

    default_suggested_actions = [
        {
            "action_type": "draft_followup",
            "title": f"Draft stewardship agenda for {account['name']}",
            "description": "Send renewal briefing timeline and schedule stewardship meeting with client leadership.",
        },
        {
            "action_type": "review_task",
            "title": "Reconcile policy endorsements & loss history",
            "description": "Review current policy schedules and carrier loss runs to ensure accurate renewal submissions.",
        },
    ]
    if open_claims:
        default_suggested_actions.append(
            {
                "action_type": "review_task",
                "title": f"Litigation & reserve check for {open_claims[0]['claim_number']}",
                "description": "Contact claims adjuster for litigation evaluation and updated reserve posture.",
            }
        )

    agenda = latest_content.get("agenda") or rule_agenda
    talking_points = latest_content.get("talking_points") or default_talking_points
    prioritized_risks = (
        latest_content.get("prioritized_risks")
        or [s["title"] for s in risks[:4]]
        or ["No material operational risk flags identified."]
    )
    opportunity_hypotheses = latest_content.get("opportunity_hypotheses") or [
        f"Hypothesis (unverified): {o['title']} ({int(float(o.get('confidence') or 0.5) * 100)}% confidence) - {o.get('description', '')}"
        for o in opportunities
    ]
    suggested_actions = latest_content.get("suggested_actions") or default_suggested_actions
    evidence_citations = (
        latest_content.get("evidence_citations")
        or latest_content.get("evidence_ids")
        or [clm["claim_number"] for clm in open_claims] + [p["policy_id"] for p in policies]
    )

    # Grounded summary: honor stored AI brief or live dynamic updates
    stored_summary = latest_content.get("summary")
    if stored_summary:
        new_open_claims = [
            c["claim_number"]
            for c in open_claims
            if c.get("claim_number") and c["claim_number"] not in str(latest_content)
        ]
        if new_open_claims:
            active_summary = (
                f"{stored_summary} Note: New live claim(s) detected: {', '.join(new_open_claims)}."
            )
        else:
            active_summary = stored_summary
    else:
        active_summary = rule_summary

    live_brief = (
        {
            "brief_id": latest["brief_id"],
            "persona": user.persona,
            "version": latest["version"],
            "generated_at": latest["generated_at"],
            "content_json": latest_content
            or {
                "summary": active_summary,
                "agenda": agenda,
                **({"omitted": omitted_item} if omitted_item else {}),
            },
            "completeness_check_passed": claim_review_complete,
            "telemetry": telemetry,
        }
        if latest
        else None
    )
    timeline = [
        dict(row)
        for row in connection.execute(
            "SELECT * FROM timeline_events WHERE account_id=? ORDER BY event_date DESC",
            (account_id,),
        )
    ]
    timeline = [
        row for row in timeline if row["ref_id"] in source_records.get(row["ref_table"], {})
    ]
    completeness_reason = None
    if omitted_item:
        omitted_str = str(omitted_item).strip()
        if omitted_str.startswith("open claim "):
            omitted_str = omitted_str[len("open claim ") :].strip()
        if omitted_str.endswith(" omitted"):
            omitted_str = omitted_str[: -len(" omitted")].strip()
        completeness_reason = f"open claim {omitted_str} omitted"

    result = {
        "account": account,
        "snapshot": {
            "policy_count": len(policies),
            "open_claim_count": len(open_claims),
            "open_service_case_count": len(open_cases),
        },
        "milestones": milestone_rows,
        "commitments": commitments,
        "risks": risks,
        "opportunities": opportunities,
        "contradictions": contradictions,
        "latest_brief": live_brief,
        "primary_contact": dict(primary) if primary else None,
        "days_to_renewal": days,
        "agenda": agenda,
        "talking_points": talking_points,
        "prioritized_risks": prioritized_risks,
        "opportunity_hypotheses": opportunity_hypotheses,
        "suggested_actions": suggested_actions,
        "evidence_citations": evidence_citations,
        "telemetry": telemetry,
        "completeness_reason": completeness_reason,
        "as_of_date": as_of.isoformat(),
        "claim_review": claim_review,
        "timeline": timeline,
        "permissions": permissions,
        "summary": active_summary,
    }
    return result


def build_agent_input_context(
    connection: sqlite3.Connection,
    user: SessionUser,
    account_id: str,
    as_of: date,
    persona: str | None = None,
) -> BriefAgentInputContext:
    """Builds the strict input context for the Client Intelligence Agent."""
    rule = authorize(connection, user, account_id)
    permissions = {name: bool(rule[column]) for name, column in RESOURCE_COLUMNS.items()}
    account = dict(
        connection.execute("SELECT * FROM accounts WHERE account_id=?", (account_id,)).fetchone()
    )

    data = {}
    for table in SOURCE_KEYS:
        resource = SOURCE_RESOURCES.get(table)
        data[table] = (
            fetch_rows(connection, table, account_id)
            if not resource or permissions[resource]
            else []
        )

    policy_contexts = [
        PolicyContext(
            policy_id=row["policy_id"],
            line_of_business=row.get("line_of_business") or "Commercial",
            carrier=row.get("carrier") or "Carrier",
            premium=float(row.get("premium") or 0.0),
            renewal_date=row.get("renewal_date") or "",
            crm_renewal_date=row.get("crm_renewal_date"),
        )
        for row in data["policies"]
        if row.get("status") == "active"
    ]

    claim_contexts = [
        ClaimContext(
            claim_id=row["claim_id"],
            claim_number=row.get("claim_number") or row["claim_id"],
            loss_date=row.get("loss_date"),
            reserve_amount=float(row["reserve_amount"])
            if row.get("reserve_amount") is not None
            else None,
            severity=row.get("severity") or "medium",
            summary=row.get("summary") or "Open claim",
            status="open",
        )
        for row in data["claims"]
        if row.get("status") == "open"
    ]

    brief_data = build_brief(connection, user, account_id, as_of)

    risk_contexts = [
        RiskSignalContext(
            signal_id=r["signal_id"],
            rule_id=r.get("rule_id"),
            category=r.get("category") or "general",
            title=r["title"],
            description=r["description"],
            severity=r.get("severity") or "medium",
            confidence=float(r.get("confidence") or 0.7),
            evidence_snippets=[
                ev.get("snippet", "") for ev in r.get("evidence", []) if ev.get("snippet")
            ],
        )
        for r in brief_data["risks"]
    ]

    opp_contexts = [
        OpportunitySignalContext(
            signal_id=o["signal_id"],
            category=o.get("category") or "coverage",
            title=o["title"],
            description=o["description"],
            confidence=float(o.get("confidence") or 0.5),
            assumptions=o.get("assumptions"),
        )
        for o in brief_data["opportunities"]
    ]

    contra_contexts = [
        ContradictionContext(
            field=c.get("field") or "field",
            source_a=c.get("source_a") or "System A",
            value_a=str(c.get("value_a") or ""),
            source_b=c.get("source_b") or "System B",
            value_b=str(c.get("value_b") or ""),
        )
        for c in brief_data["contradictions"]
    ]

    primary = brief_data.get("primary_contact")

    return BriefAgentInputContext(
        account_id=account_id,
        account_name=account["name"],
        industry=account.get("industry"),
        annual_premium=float(account["annual_premium"]) if account.get("annual_premium") else None,
        days_to_renewal=brief_data.get("days_to_renewal"),
        risk_level=account.get("risk_level") or "low",
        persona=persona or user.persona,
        primary_contact=primary,
        policies=policy_contexts,
        open_claims=claim_contexts,
        open_service_cases=data["service_cases"],
        overdue_commitments=[c for c in data["commitments"] if c.get("status") == "overdue"],
        overdue_invoices=[b for b in data["billing"] if b.get("status") == "overdue"],
        milestones=brief_data.get("milestones", []),
        risks=risk_contexts,
        opportunities=opp_contexts,
        contradictions=contra_contexts,
        restricted_resources=[res for res, allowed in permissions.items() if not allowed],
    )
