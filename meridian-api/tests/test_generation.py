"""Offline contracts for loading, grounded provider output and background jobs."""

import json
import sqlite3
import sys
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import main  # noqa: E402
from agent import (  # noqa: E402
    BriefAgentInputContext,
    BriefTelemetry,
    ClientIntelligenceAgent,
    generate_deterministic_brief,
)
from auth import initialize_security  # noqa: E402
from tests.test_workspaces import ApiClient  # noqa: E402


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.uri = f"file:meridian_generation_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.anchor = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
        self.anchor.row_factory = sqlite3.Row
        self.anchor.executescript(
            (BASE_DIR / "sql/meridian_schema_and_seed_sqlite.sql").read_text(encoding="utf-8")
        )
        fixtures_path = BASE_DIR / "sql/fixtures/legacy_generated_briefs_sqlite.sql"
        if fixtures_path.exists():
            self.anchor.executescript(fixtures_path.read_text(encoding="utf-8"))
        initialize_security(self.anchor)
        self.previous_connection = main._get_database_connection

        def connection():
            result = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
            result.row_factory = sqlite3.Row
            result.execute("PRAGMA foreign_keys=ON")
            return result

        main._get_database_connection = connection
        self.model_patch = patch.object(
            ClientIntelligenceAgent,
            "_call_model",
            side_effect=RuntimeError("Provider disabled during isolated verification"),
        )
        self.model_call = self.model_patch.start()
        self.jordan, self.priya, self.leader = ApiClient(), ApiClient(), ApiClient()
        for client, email in [
            (self.jordan, "jordan.davis@meridian.example"),
            (self.priya, "priya.nair@meridian.example"),
            (self.leader, "morgan.hayes@meridian.example"),
        ]:
            self.assertEqual(client.login(email)[0], 200)
        self.releases = []

    def tearDown(self):
        # Finish all workers before restoring the shared connection seam.
        for release in self.releases:
            release.set()
        import generation

        generation.shutdown_generation(wait=True)
        main._get_database_connection = self.previous_connection
        self.model_patch.stop()
        self.anchor.close()

    @staticmethod
    def generated(context):
        return (
            generate_deterministic_brief(context),
            BriefTelemetry(
                model="verified-test-model",
                tokens_in=130,
                tokens_out=90,
                total_tokens=220,
                latency_ms=12,
                cost_usd=0.001,
            ),
            True,
            None,
        )

    def wait_job(self, job_id, account_id="A01", client=None):
        client = client or self.jordan
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, job = client.request(
                "GET", f"/accounts/{account_id}/brief/jobs/{job_id}"
            )
            self.assertEqual(status, 200, job)
            if job["status"] in {"succeeded", "failed"}:
                return job
            time.sleep(0.01)
        self.fail(f"Job {job_id} did not finish: {job}")

    def hold_generation(self):
        entered, release = threading.Event(), threading.Event()
        self.releases.append(release)
        seen = []

        def generate(context):
            seen.append(context)
            entered.set()
            if not release.wait(timeout=5):
                raise RuntimeError("Test did not release generation")
            return self.generated(context)

        return entered, release, seen, patch.object(
            ClientIntelligenceAgent, "generate_brief", side_effect=generate
        )

    def inject_claim(self):
        self.anchor.execute(
            """INSERT INTO claims
            (claim_id,policy_id,account_id,claim_number,status,loss_date,severity,
             summary,source_system,updated_at)
            VALUES ('C_NEW','P01','A01','CLM-NEW-2026','open','2026-10-08','high',
                    'New material warehouse loss','Guidewire ClaimCenter','2026-10-08')"""
        )
        self.anchor.commit()

    def test_first_load_is_complete_current_and_never_calls_a_provider(self):
        before = self.anchor.execute("SELECT COUNT(*) FROM briefs").fetchone()[0]
        for account_id in ["A01", "A02", "A03", "A08", "A09"]:
            status, brief = self.jordan.request("GET", f"/accounts/{account_id}/brief")
            self.assertEqual(status, 200)
            self.assertEqual(brief["generation"]["mode"], "rules")
            self.assertTrue(brief["generation"]["stale"])
            self.assertTrue(brief["claim_review"]["complete"])
            self.assertTrue(brief["generation"]["source_fingerprint"])
            self.assertTrue(brief["agenda"])
            self.assertTrue(brief["suggested_actions"])
        self.assertEqual(self.model_call.call_count, 0)
        self.assertEqual(self.anchor.execute("SELECT COUNT(*) FROM briefs").fetchone()[0], before)

    def test_structured_provider_success_is_cached_until_sources_change(self):
        def provider(model_name, _system_prompt, user_prompt):
            context = BriefAgentInputContext.model_validate_json(user_prompt.split("\n", 1)[1])
            output, telemetry, _, _ = self.generated(context)
            telemetry.model = model_name
            return output, telemetry

        self.model_call.side_effect = provider
        status, fresh = self.jordan.request("POST", "/accounts/A01/brief/generate", {})
        self.assertEqual(status, 200)
        self.assertEqual(self.model_call.call_count, 1)
        self.assertEqual(fresh["generation"]["mode"], "live_ai")
        self.assertFalse(fresh["generation"]["stale"])
        self.assertEqual(fresh["telemetry"]["total_tokens"], 220)
        _, cached = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertEqual(cached["summary"], fresh["summary"])
        self.assertFalse(cached["generation"]["stale"])
        self.assertEqual(self.model_call.call_count, 1)
        fingerprint = cached["generation"]["source_fingerprint"]
        self.anchor.execute(
            """INSERT INTO briefs
            (brief_id,account_id,persona,version,generated_at,content_json,model_version,completeness_check_passed)
            VALUES ('BR_OTHER_USER','A01','producer',99,'2026-10-15',?,'other-model',1)""",
            (json.dumps({
                "summary": "OTHER USER NARRATIVE MUST NOT EVICT MY CACHE",
                "generation_scope": {"user_id": "U2", "source_fingerprint": "other-scope"},
            }),),
        )
        self.anchor.commit()
        _, still_cached = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertFalse(still_cached["generation"]["stale"])
        self.assertEqual(still_cached["summary"], fresh["summary"])
        self.assertEqual(still_cached["latest_brief"]["version"], fresh["latest_brief"]["version"])
        self.assertNotIn("OTHER USER NARRATIVE", str(still_cached))
        self.inject_claim()
        _, stale = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertTrue(stale["generation"]["stale"])
        self.assertEqual(stale["generation"]["mode"], "rules")
        self.assertNotEqual(stale["generation"]["source_fingerprint"], fingerprint)
        self.assertTrue(stale["claim_review"]["complete"])
        self.assertIn("CLM-NEW-2026", " ".join(stale["prioritized_risks"]))

    def test_provider_failure_reports_rules_and_zero_model_usage(self):
        status, brief = self.jordan.request("POST", "/accounts/A02/brief/generate", {})
        self.assertEqual(status, 200)
        self.assertEqual(brief["generation"]["mode"], "offline")
        self.assertEqual(brief["telemetry"]["total_tokens"], 0)
        self.assertEqual(brief["telemetry"]["cost_usd"], 0)
        self.assertTrue(brief["claim_review"]["complete"])
        self.assertIn("CLM-88410", " ".join(brief["prioritized_risks"]))

    def test_invented_provider_citations_are_rejected_before_persistence(self):
        def invented_source(model_name, _system_prompt, user_prompt):
            context = BriefAgentInputContext.model_validate_json(user_prompt.split("\n", 1)[1])
            output, telemetry, _, _ = self.generated(context)
            output.evidence_citations.append("CONFIDENTIAL-OTHER-ACCOUNT-999")
            telemetry.model = model_name
            return output, telemetry

        self.model_call.side_effect = invented_source
        status, brief = self.jordan.request("POST", "/accounts/A01/brief/generate", {})
        self.assertEqual(status, 200)
        self.assertEqual(brief["generation"]["mode"], "offline")
        self.assertNotIn("CONFIDENTIAL-OTHER-ACCOUNT-999", str(brief))
        persisted = self.anchor.execute(
            "SELECT content_json FROM briefs WHERE account_id='A01' ORDER BY version DESC LIMIT 1"
        ).fetchone()[0]
        self.assertNotIn("CONFIDENTIAL-OTHER-ACCOUNT-999", persisted)

    def test_cached_narrative_is_suppressed_when_record_permissions_change(self):
        marker = "CONFIDENTIAL DOCUMENT NARRATIVE MARKER"

        def confidential_summary(context):
            output, telemetry, passed, reason = self.generated(context)
            output.executive_summary += " " + marker
            return output, telemetry, passed, reason

        with patch.object(ClientIntelligenceAgent, "generate_brief", side_effect=confidential_summary):
            status, fresh = self.jordan.request("POST", "/accounts/A01/brief/generate", {})
        self.assertEqual(status, 200)
        self.assertIn(marker, fresh["summary"])
        self.anchor.execute(
            "UPDATE access_rules SET can_view_documents=0 WHERE user_id='U1' AND account_id='A01'"
        )
        self.anchor.commit()
        _, restricted = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertFalse(restricted["permissions"]["documents"])
        self.assertTrue(restricted["generation"]["stale"])
        self.assertEqual(restricted["generation"]["mode"], "rules")
        self.assertNotIn(marker, str(restricted))

    def test_background_job_returns_before_generation_and_deduplicates(self):
        entered, release, seen, mocked = self.hold_generation()
        with mocked as generate:
            status, started = self.jordan.request(
                "POST", "/accounts/A01/brief/jobs", {"force": True}
            )
            self.assertEqual(status, 202)
            self.assertTrue(entered.wait(timeout=2))
            self.assertIn(started["status"], {"queued", "running"})
            self.assertIsNone(started["result"])
            duplicate_status, duplicate = self.jordan.request(
                "POST", "/accounts/A01/brief/jobs", {"force": True}
            )
            self.assertEqual(duplicate_status, 202)
            self.assertEqual(duplicate["job_id"], started["job_id"])
            self.assertEqual(generate.call_count, 1)
            _, running = self.jordan.request(
                "GET", f"/accounts/A01/brief/jobs/{started['job_id']}"
            )
            self.assertEqual(running["status"], "running")
            self.assertIn(running["phase"], {"collecting", "generating", "validating"})
            self.assertTrue(running["message"])
            self.assertEqual(seen[0].risk_level, "high")
            self.assertTrue(all(case["status"] != "closed" for case in seen[0].open_service_cases))
            self.assertIn("CLM-99231", seen[0].allowed_citation_ids)
            self.assertIn("SRV-38190", seen[0].allowed_citation_ids)
            self.assertIn("E01", [row["endorsement_id"] for row in seen[0].pending_endorsements])
            self.assertIn("CM01", [row["commitment_id"] for row in seen[0].overdue_commitments])
            self.assertFalse(seen[0].overdue_invoices, 'Paid invoices must not reach overdue context')
            release.set()
            completed = self.wait_job(started["job_id"])
            self.assertEqual(completed["status"], "succeeded", completed)
            self.assertEqual(completed["phase"], "completed")
            self.assertEqual(completed["result"]["account"]["account_id"], "A01")
            self.assertFalse(completed["result"]["generation"]["stale"])
            self.assertEqual(generate.call_count, 1)
            versions = self.anchor.execute(
                "SELECT COUNT(*) FROM briefs WHERE account_id='A01' AND persona='producer'"
            ).fetchone()[0]
            self.assertEqual(versions, 2)
            cached_status, cached_job = self.jordan.request(
                "POST", "/accounts/A01/brief/jobs", {"force": False}
            )
            self.assertEqual(cached_status, 202)
            self.assertEqual(cached_job["status"], "succeeded")
            self.assertEqual(cached_job["result"]["summary"], completed["result"]["summary"])
            self.assertEqual(generate.call_count, 1)

    def test_job_start_and_poll_enforce_session_csrf_account_and_owner(self):
        stranger = ApiClient()
        self.assertEqual(stranger.request("POST", "/accounts/A01/brief/jobs", {})[0], 401)
        self.assertEqual(
            self.jordan.request("POST", "/accounts/A01/brief/jobs", {}, csrf=False)[0], 403
        )
        self.assertEqual(self.priya.request("POST", "/accounts/A01/brief/jobs", {})[0], 403)
        entered, release, _, mocked = self.hold_generation()
        with mocked:
            _, started = self.jordan.request("POST", "/accounts/A01/brief/jobs", {})
            self.assertTrue(entered.wait(timeout=2))
            path = f"/accounts/A01/brief/jobs/{started['job_id']}"
            self.assertEqual(stranger.request("GET", path)[0], 401)
            self.assertEqual(self.priya.request("GET", path)[0], 403)
            self.assertEqual(self.leader.request("GET", path)[0], 404)
            self.assertEqual(
                self.jordan.request("GET", f"/accounts/A02/brief/jobs/{started['job_id']}")[0],
                404,
            )
            release.set()
            self.assertEqual(self.wait_job(started["job_id"])["status"], "succeeded")

    def test_failed_job_preserves_cards_and_can_be_retried(self):
        _, original = self.jordan.request("GET", "/accounts/A01/brief")
        with patch.object(
            ClientIntelligenceAgent, "generate_brief", side_effect=RuntimeError("Worker failure")
        ):
            _, started = self.jordan.request("POST", "/accounts/A01/brief/jobs", {})
            failed = self.wait_job(started["job_id"])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["phase"], "failed")
        self.assertTrue(failed["error"])
        self.assertIsNone(failed["result"])
        _, preserved = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertEqual(preserved["summary"], original["summary"])
        with patch.object(ClientIntelligenceAgent, "generate_brief", side_effect=self.generated):
            _, retried = self.jordan.request("POST", "/accounts/A01/brief/jobs", {})
            completed = self.wait_job(retried["job_id"])
        self.assertNotEqual(retried["job_id"], started["job_id"])
        self.assertEqual(completed["status"], "succeeded", completed)

    def test_sources_changing_during_generation_cannot_be_marked_fresh(self):
        entered, release, _, mocked = self.hold_generation()
        with mocked:
            _, started = self.jordan.request("POST", "/accounts/A01/brief/jobs", {})
            self.assertTrue(entered.wait(timeout=2))
            self.inject_claim()
            release.set()
            completed = self.wait_job(started["job_id"])
        self.assertEqual(completed["status"], "succeeded", completed)
        _, brief = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertTrue(brief["generation"]["stale"])
        self.assertTrue(brief["claim_review"]["complete"])
        self.assertIn("CLM-NEW-2026", " ".join(brief["prioritized_risks"]))

    def test_service_restart_marks_interrupted_jobs_failed_and_allows_retry(self):
        from generation import initialize_generation

        initialize_generation(self.anchor)
        _, brief = self.jordan.request("GET", "/accounts/A01/brief")
        self.anchor.execute(
            """INSERT INTO brief_generation_jobs
            (job_id,user_id,account_id,persona,source_fingerprint,status,phase,message)
            VALUES ('JOB_INTERRUPTED','U1','A01','producer',?,'running','generating','Preparing')""",
            (brief["generation"]["source_fingerprint"],),
        )
        self.anchor.commit()
        initialize_generation(self.anchor, recover=True)
        recovered = self.wait_job("JOB_INTERRUPTED")
        self.assertEqual(recovered["status"], "failed")
        self.assertTrue(recovered["error"])
        with patch.object(ClientIntelligenceAgent, "generate_brief", side_effect=self.generated):
            status, retry = self.jordan.request("POST", "/accounts/A01/brief/jobs", {})
            self.assertEqual(status, 202)
            self.assertNotEqual(retry["job_id"], "JOB_INTERRUPTED")
            self.assertEqual(self.wait_job(retry["job_id"])["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
