"""Executive metrics derived from authorized relational records and demo ledgers."""

import calendar
import sqlite3
from collections import defaultdict
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from access import allowed_accounts, require_leader
from auth import SessionUser
from executive_metrics_seed import initialize_executive_metrics

Color = Literal["blue", "purple", "green", "amber", "coral", "gray"]
COLORS: tuple[Color, ...] = ("blue", "green", "amber", "purple", "coral", "gray")


class StrictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ExecutiveKpi(StrictResponse):
    label: str
    value: str
    raw_value: float | None
    change: str
    color: Color


class PremiumLine(StrictResponse):
    label: str
    premium: float
    color: Color


class CarrierSegment(StrictResponse):
    name: str
    premium: float
    percentage: float
    color: Color


class CarrierMix(StrictResponse):
    total: int
    carriers: list[CarrierSegment]


class CommissionMonth(StrictResponse):
    month: str
    label: str
    value: float


class CommissionTrend(StrictResponse):
    months: list[CommissionMonth]
    latest_label: str
    latest: float | None
    average: float | None
    period_label: str


class ExecutiveProducer(StrictResponse):
    producer_id: str
    name: str
    client_count: int
    premium: float
    retention: float | None
    commission: float | None


class ExecutiveMetadata(StrictResponse):
    source: Literal["sqlite"]
    as_of: date
    scope: str
    authorized_client_count: int
    producer_count: int
    period_start: date
    period_end: date
    metric_definitions: dict[str, str]
    notes: list[str]


class ExecutiveDashboard(StrictResponse):
    subtitle: str
    metadata: ExecutiveMetadata
    kpis: list[ExecutiveKpi]
    premium_by_line: list[PremiumLine]
    carrier_mix: CarrierMix
    commission_trend: CommissionTrend
    top_producers: list[ExecutiveProducer]


def _money(amount: float | None) -> str:
    if amount is None:
        return "Not available"
    if abs(amount) >= 1_000_000:
        return f"${amount / 1_000_000:,.2f}M"
    if abs(amount) >= 1_000:
        return f"${amount / 1_000:,.1f}K"
    return f"${amount:,.2f}"


def _percent(numerator: float, denominator: float) -> float | None:
    return round(numerator / denominator * 100, 2) if denominator else None


def build_executive_dashboard(
    connection: sqlite3.Connection,
    user: SessionUser,
    as_of: date,
) -> ExecutiveDashboard:
    require_leader(user)
    accounts = allowed_accounts(connection, user)
    initialize_executive_metrics(connection)
    account_map = {account["account_id"]: account for account in accounts}
    account_ids = list(account_map)
    placeholders = ",".join("?" for _ in account_ids) or "NULL"
    policy_rows = connection.execute(
        f"""SELECT p.*,r.can_view_claims,r.can_view_billing FROM policies p
        JOIN access_rules r ON r.account_id=p.account_id AND r.user_id=?
        WHERE p.account_id IN ({placeholders}) AND r.allowed=1 AND r.can_view_policies=1""",
        (user.user_id, *account_ids),
    ).fetchall()
    policies = {row["policy_id"]: dict(row) for row in policy_rows}
    current_policies = [
        row
        for row in policies.values()
        if row["status"] == "active"
        and (not row["effective_date"] or row["effective_date"] <= as_of.isoformat())
        and (not row["renewal_date"] or row["renewal_date"] >= as_of.isoformat())
    ]
    month_index = as_of.year * 12 + as_of.month - 1
    month_starts = [
        date(index // 12, index % 12 + 1, 1) for index in range(month_index - 11, month_index + 1)
    ]
    period_start = month_starts[0]
    ledger_rows = connection.execute(
        f"""SELECT f.* FROM policy_financial_months f JOIN policies p ON p.policy_id=f.policy_id
        WHERE p.account_id IN ({placeholders}) AND f.posted_at>=? AND f.posted_at<=?""",
        (*account_ids, period_start.isoformat(), as_of.isoformat()),
    ).fetchall()
    ledger = [dict(row) for row in ledger_rows if row["policy_id"] in policies]
    commission_rows = [row for row in ledger if policies[row["policy_id"]]["can_view_billing"]]
    loss_rows = [row for row in ledger if policies[row["policy_id"]]["can_view_claims"]]
    commission = (
        round(sum(float(row["commission_revenue"]) for row in commission_rows), 2)
        if commission_rows
        else None
    )
    paid_losses = sum(float(row["paid_losses"]) for row in loss_rows)
    earned_premium = sum(float(row["earned_premium"]) for row in loss_rows)
    loss_ratio = _percent(paid_losses, earned_premium)
    outcome_rows = connection.execute(
        f"""SELECT * FROM renewal_outcomes WHERE account_id IN ({placeholders})
        AND renewed_at>=? AND renewed_at<=?""",
        (*account_ids, period_start.isoformat(), as_of.isoformat()),
    ).fetchall()
    outcomes = [dict(row) for row in outcome_rows]
    retention = _percent(sum(row["retained"] for row in outcomes), len(outcomes))
    premium = round(sum(float(account["annual_premium"] or 0) for account in accounts), 2)
    lines: dict[str, float] = defaultdict(float)
    carriers: dict[str, float] = defaultdict(float)
    for policy in current_policies:
        lines[policy["line_of_business"] or "Unspecified"] += float(policy["premium"] or 0)
        carriers[policy["carrier"] or "Unspecified"] += float(policy["premium"] or 0)
    carrier_premium = sum(carriers.values())
    premium_lines = [
        PremiumLine(label=label, premium=round(amount, 2), color=COLORS[index % len(COLORS)])
        for index, (label, amount) in enumerate(
            sorted(lines.items(), key=lambda item: (-item[1], item[0]))
        )
    ]
    carrier_segments = [
        CarrierSegment(
            name=name,
            premium=round(amount, 2),
            percentage=_percent(amount, carrier_premium) or 0,
            color=COLORS[index % len(COLORS)],
        )
        for index, (name, amount) in enumerate(
            sorted(carriers.items(), key=lambda item: (-item[1], item[0]))
        )
    ]
    monthly: dict[str, float] = defaultdict(float)
    for row in commission_rows:
        monthly[str(row["posted_at"])[:7]] += float(row["commission_revenue"])
    # Missing months are not manufactured into zero-revenue history.
    months = [
        CommissionMonth(
            month=calendar.month_abbr[start.month],
            label=start.strftime("%b %Y"),
            value=round(monthly[start.isoformat()[:7]], 2),
        )
        for start in month_starts
        if start.isoformat()[:7] in monthly
    ]
    producers = []
    producer_ids = sorted({account["owner_user_id"] for account in accounts})
    for producer_id in producer_ids:
        producer_accounts = [
            account for account in accounts if account["owner_user_id"] == producer_id
        ]
        producer_account_ids = {account["account_id"] for account in producer_accounts}
        producer_commission = [
            row
            for row in commission_rows
            if policies[row["policy_id"]]["account_id"] in producer_account_ids
        ]
        producer_outcomes = [row for row in outcomes if row["account_id"] in producer_account_ids]
        producers.append(
            ExecutiveProducer(
                producer_id=producer_id,
                name=producer_accounts[0]["producer_name"],
                client_count=len(producer_accounts),
                premium=round(
                    sum(float(account["annual_premium"] or 0) for account in producer_accounts), 2
                ),
                retention=_percent(
                    sum(row["retained"] for row in producer_outcomes), len(producer_outcomes)
                ),
                commission=round(
                    sum(float(row["commission_revenue"]) for row in producer_commission), 2
                )
                if producer_commission
                else None,
            )
        )
    producers.sort(key=lambda producer: (-producer.premium, producer.name))
    period_label = f"{period_start:%b %Y} – {as_of:%b %Y} (through {as_of:%d %b})"
    notes = [
        "Financial ledger and prior-renewal outcomes are explicitly synthetic demo facts attached to existing policies/accounts; no screenshot totals or fictional producers are used.",
        "Synthetic financial seed: monthly earned premium = annual policy premium / 12; commission = 12% of earned premium; paid losses = 35% of earned premium. These are demo assumptions, not observed claims payments.",
        "Historical renewal outcomes are synthetic retained outcomes for existing accounts; the small sample does not estimate future retention.",
        "Policy charts use active accessible policy premiums. Written premium uses authorized account annual premiums; sums can differ when source records or permissions differ.",
        "The current month is partial. Missing ledger months are omitted, not treated as zero. Demo ledger coverage ends October 2026; later data requires new posted records.",
    ]
    if len(current_policies) < len([row for row in policy_rows if row["status"] == "active"]):
        notes.append("Future-effective policies are excluded from current policy charts.")
    return ExecutiveDashboard(
        subtitle=f"{user.region} · As of {as_of:%d %b %Y}",
        metadata=ExecutiveMetadata(
            source="sqlite",
            as_of=as_of,
            scope=user.region,
            authorized_client_count=len(accounts),
            producer_count=len(producers),
            period_start=period_start,
            period_end=as_of,
            metric_definitions={
                "written_premium": "Sum of authorized account annual_premium; current account snapshot, not period bookings.",
                "commission_revenue": "Sum of posted commission_revenue within the period, requiring policy and billing access.",
                "loss_ratio": "Sum of synthetic paid_losses / earned_premium for the same permitted policy-month rows; requires policies and claims access.",
                "retention_rate": "Retained renewal outcomes / eligible renewal outcomes posted within the period.",
                "carrier_mix": "Active accessible policy premium share by actual carrier; zero premium yields zero shares.",
                "commission_average": "Average across months with posted accessible commission records; not an assumed 12-month average.",
            },
            notes=notes,
        ),
        kpis=[
            ExecutiveKpi(
                label="Written Premium",
                value=_money(premium),
                raw_value=premium,
                change=f"{len(accounts)} authorized clients · current annual premium",
                color="blue",
            ),
            ExecutiveKpi(
                label="Commission Revenue",
                value=_money(commission),
                raw_value=commission,
                change="Posted synthetic ledger · trailing period",
                color="purple",
            ),
            ExecutiveKpi(
                label="Loss Ratio",
                value=f"{loss_ratio:.1f}%" if loss_ratio is not None else "Not available",
                raw_value=loss_ratio,
                change="Synthetic paid losses / earned premium",
                color="green",
            ),
            ExecutiveKpi(
                label="Retention Rate",
                value=f"{retention:.1f}%" if retention is not None else "Not available",
                raw_value=retention,
                change=f"{len(outcomes)} synthetic renewal outcomes",
                color="amber",
            ),
        ],
        premium_by_line=premium_lines,
        carrier_mix=CarrierMix(total=len(carrier_segments), carriers=carrier_segments),
        commission_trend=CommissionTrend(
            months=months,
            latest_label=months[-1].label if months else "No posted months",
            latest=months[-1].value if months else None,
            average=round(sum(month.value for month in months) / len(months), 2)
            if months
            else None,
            period_label=period_label,
        ),
        top_producers=producers,
    )
