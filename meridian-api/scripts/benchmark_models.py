"""Small, read-only Pinecrest benchmark using the application's structured contract."""

import json
import os
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import (
    ClientIntelligenceAgent,
    citation_allowlist,
    failure_category,
    normalize_citations,
    verify_brief_completeness,
)
from auth import SessionUser
from intelligence import build_agent_input_context


def main() -> None:
    base = Path(__file__).resolve().parents[1]
    database = Path(os.getenv("SQLITE_DB_PATH", base / "meridian.db")).resolve()
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute("SELECT * FROM users WHERE user_id='U1'").fetchone()
        user = SessionUser(**dict(row))
        context = build_agent_input_context(
            connection,
            user,
            "A03",
            date.fromisoformat(os.getenv("MERIDIAN_AS_OF_DATE", "2026-10-08")),
        )

    def measure(model: str) -> dict:
        started = time.perf_counter()
        result = {"model": model}
        try:
            with ClientIntelligenceAgent(primary_model=model, fallback_model="") as agent:
                agent._deadline = time.perf_counter() + 20
                output, telemetry = agent._call_model(
                    model,
                    agent._build_system_prompt(context.persona),
                    f"Client Relational Context:\n{context.model_dump_json(indent=2)}",
                )
                normalize_citations(output, citation_allowlist(context))
                passed, reason = verify_brief_completeness(output, context)
                result.update(
                    status="passed" if passed else "incomplete",
                    reason=reason,
                    tokens=telemetry.total_tokens,
                )
        except Exception as error:
            result.update(
                status="failed", category=failure_category(error), error_type=type(error).__name__
            )
        result["elapsed_seconds"] = round(time.perf_counter() - started, 2)
        print(json.dumps(result), flush=True)
        return result

    models = [
        "genailab-maas-gpt-35-turbo",
        "genailab-maas-gpt-4o",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(measure, models))
    report = {
        "account_id": "A03",
        "account_name": context.account_name,
        "as_of": os.getenv("MERIDIAN_AS_OF_DATE", "2026-10-08"),
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "method": "One structured source-grounded request/model; no repair or fallback; two concurrent workers; read-only DB",
        "results": results,
    }
    target = base.parent / "docs/validation/pinecrest-model-benchmark.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
