"""Additive financial demo facts attached only to existing seeded policies.

These are explicitly synthetic ledger facts, not inferred production results.
Known demo policies receive monthly earned premium, a 12% commission and a
35% paid-loss allowance. Renewal facts record retained prior-year renewals.
No account, producer, policy, claim or existing financial row is overwritten.
"""

import sqlite3

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS policy_financial_months (
    policy_id TEXT NOT NULL REFERENCES policies(policy_id),
    posted_at DATE NOT NULL,
    earned_premium NUMERIC(14,2) NOT NULL CHECK (earned_premium >= 0),
    commission_revenue NUMERIC(14,2) NOT NULL CHECK (commission_revenue >= 0),
    paid_losses NUMERIC(14,2) NOT NULL CHECK (paid_losses >= 0),
    source TEXT NOT NULL DEFAULT 'synthetic_financial_seed_v1',
    PRIMARY KEY (policy_id, posted_at)
);
CREATE TABLE IF NOT EXISTS renewal_outcomes (
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    renewed_at DATE NOT NULL,
    retained INTEGER NOT NULL CHECK (retained IN (0,1)),
    source TEXT NOT NULL DEFAULT 'synthetic_financial_seed_v1',
    PRIMARY KEY (account_id, renewed_at)
);
"""


def financial_seed_sql(dialect: str = "sqlite") -> str:
    """Same data rules for the lazy SQLite upgrade and both fresh SQL seeds."""
    periods = ",".join(
        f"('{year}-{month:02d}-01')"
        for year, month in [(2025, 11), (2025, 12), *((2026, month) for month in range(1, 11))]
    )
    effective = "p.effective_date" if dialect == "sqlite" else "CAST(p.effective_date AS TEXT)"
    renewal = (
        "date(p.renewal_date,'-1 year')"
        if dialect == "sqlite"
        else "CAST((p.renewal_date - INTERVAL '1 year') AS DATE)"
    )
    month_date = "m.posted_at" if dialect == "sqlite" else "CAST(m.posted_at AS DATE)"
    return f"""
WITH months(posted_at) AS (VALUES {periods})
INSERT INTO policy_financial_months
    (policy_id,posted_at,earned_premium,commission_revenue,paid_losses)
SELECT p.policy_id,{month_date},ROUND(p.premium/12.0,2),
       ROUND(p.premium*0.12/12.0,2),ROUND(p.premium*0.35/12.0,2)
FROM policies p CROSS JOIN months m
WHERE p.policy_id IN ({",".join(f"'P{number:02d}'" for number in range(1, 19))})
  AND p.account_id IN ({",".join(f"'A{number:02d}'" for number in range(1, 11))})
  AND m.posted_at >= {effective}
  AND m.posted_at <= '2026-10-08'
  AND p.premium IS NOT NULL AND p.premium >= 0
ON CONFLICT (policy_id,posted_at) DO NOTHING;
INSERT INTO renewal_outcomes (account_id,renewed_at,retained)
SELECT p.account_id,MAX({renewal}),1 FROM policies p
WHERE p.policy_id IN ({",".join(f"'P{number:02d}'" for number in range(1, 19))})
  AND {renewal} <= '2026-10-08'
GROUP BY p.account_id
ON CONFLICT (account_id,renewed_at) DO NOTHING;
"""


def initialize_executive_metrics(connection: sqlite3.Connection) -> None:
    # A dashboard read must not repeatedly seed facts from subsequently edited
    # source records, acquire write locks, or commit a caller's transaction.
    migration_id = "executive_financial_seed_v1"
    marker_exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='executive_metric_migrations'"
    ).fetchone()
    if marker_exists and connection.execute(
        "SELECT 1 FROM executive_metric_migrations WHERE migration_id=?", (migration_id,)
    ).fetchone():
        return
    nested = connection.in_transaction
    connection.execute("SAVEPOINT executive_metrics_upgrade" if nested else "BEGIN IMMEDIATE")
    try:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS executive_metric_migrations (migration_id TEXT PRIMARY KEY)"
        )
        # Recheck after obtaining the write lock; another request may have upgraded.
        if not connection.execute(
            "SELECT 1 FROM executive_metric_migrations WHERE migration_id=?", (migration_id,)
        ).fetchone():
            for statement in (SCHEMA_SQL + financial_seed_sql()).split(";"):
                if statement.strip():
                    connection.execute(statement)
            connection.execute(
                "INSERT INTO executive_metric_migrations (migration_id) VALUES (?)", (migration_id,)
            )
        if nested:
            connection.execute("RELEASE SAVEPOINT executive_metrics_upgrade")
        else:
            connection.commit()
    except Exception:
        if nested:
            connection.execute("ROLLBACK TO SAVEPOINT executive_metrics_upgrade")
            connection.execute("RELEASE SAVEPOINT executive_metrics_upgrade")
        else:
            connection.rollback()
        raise
