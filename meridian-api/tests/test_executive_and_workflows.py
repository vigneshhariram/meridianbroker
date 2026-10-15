"""Unit and integration tests for Executive Dashboard, Grounded Retrieval, and Workflows."""

import sqlite3
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import main  # noqa: E402
from agent import ClientIntelligenceAgent  # noqa: E402
from auth import initialize_security  # noqa: E402
from retrieval import retrieve_authorized  # noqa: E402
from tests.test_workspaces import ApiClient  # noqa: E402


class ExecutiveAndWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.model_patch = patch.object(
            ClientIntelligenceAgent,
            "_call_model",
            side_effect=RuntimeError("Provider disabled during isolated verification"),
        )
        self.model_patch.start()
        self.addCleanup(self.model_patch.stop)

        self.uri = f"file:meridian_exec_test_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.anchor = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
        self.anchor.row_factory = sqlite3.Row
        sql_content = (BASE_DIR / "sql/meridian_schema_and_seed_sqlite.sql").read_text(
            encoding="utf-8"
        )
        self.anchor.executescript(sql_content)
        fixtures_path = BASE_DIR / "sql/fixtures/legacy_generated_briefs_sqlite.sql"
        if fixtures_path.exists():
            self.anchor.executescript(fixtures_path.read_text(encoding="utf-8"))
        initialize_security(self.anchor)

        self.previous_conn = main._get_database_connection

        def connection():
            res = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
            res.row_factory = sqlite3.Row
            res.execute("PRAGMA foreign_keys=ON")
            return res

        main._get_database_connection = connection

        self.jordan = ApiClient()
        self.leader = ApiClient()
        self.assertEqual(self.jordan.login("jordan.davis@meridian.example")[0], 200)
        self.assertEqual(self.leader.login("morgan.hayes@meridian.example")[0], 200)

    def tearDown(self):
        main._get_database_connection = self.previous_conn
        self.anchor.close()

    def test_executive_dashboard_access_and_metrics(self):
        """Executive dashboard allows regional leaders and forbids producers."""
        # Producer access denied
        status, _ = self.jordan.request("GET", "/api/executive-dashboard")
        self.assertEqual(status, 403)

        # Leader access allowed
        status, data = self.leader.request("GET", "/api/executive-dashboard")
        self.assertEqual(status, 200)
        self.assertIn("metadata", data)
        self.assertIn("as_of", data["metadata"])
        self.assertEqual(data["metadata"]["authorized_client_count"], 9)
        self.assertEqual(data["metadata"]["scope"], "Midwest")
        self.assertTrue(len(data["kpis"]) >= 4)
        labels = [kpi["label"] for kpi in data["kpis"]]
        self.assertIn("Written Premium", labels)
        self.assertIn("Retention Rate", labels)
        self.assertIn("Commission Revenue", labels)
        self.assertIn("Loss Ratio", labels)
        self.assertTrue(len(data["top_producers"]) >= 2)
        self.assertTrue(len(data["carrier_mix"]["carriers"]) >= 1)
        self.assertTrue(len(data["commission_trend"]["months"]) >= 1)

    def test_copilot_retrieval_and_rbac(self):
        """Copilot retrieves authorized records with grounded citations."""
        # Leader asks question on authorized account A01
        status, res = self.leader.request(
            "POST",
            "/accounts/A01/copilot",
            {"question": "What open claims or property endorsements exist for Riverside?"},
        )
        self.assertEqual(status, 200)
        self.assertIn("answer", res)
        self.assertIn("evidence_citations", res)
        self.assertIn("retrieval", res)
        self.assertEqual(res["retrieval"]["scope"], "selected_account")
        self.assertGreater(res["retrieval"]["indexed_records"], 0)

        # Producer denied access to unauthorized account A05
        status, _ = self.jordan.request(
            "POST",
            "/accounts/A05/copilot",
            {"question": "What is the cargo status?"},
        )
        self.assertEqual(status, 403)

    def test_actions_lifecycle_create_list_and_approve(self):
        """Client actions can be submitted, listed, and approved/rejected."""
        # Initial list is empty
        status, list_res = self.jordan.request("GET", "/accounts/A01/actions")
        self.assertEqual(status, 200)
        initial_count = len(list_res["actions"])

        # Create action
        status, created = self.jordan.request(
            "POST",
            "/accounts/A01/actions",
            {
                "action_type": "review_task",
                "title": "Loss run review",
                "description": "Request updated loss runs from adjuster for open claim CLM-99231.",
            },
        )
        self.assertEqual(status, 201)
        self.assertIn("action_id", created)
        self.assertEqual(created["status"], "pending_approval")
        action_id = created["action_id"]

        # List now contains the new action
        status, list_res = self.jordan.request("GET", "/accounts/A01/actions")
        self.assertEqual(status, 200)
        self.assertEqual(len(list_res["actions"]), initial_count + 1)

        # Approve action
        status, approved = self.jordan.request(
            "POST",
            f"/accounts/A01/actions/{action_id}/approve",
            {"approved": True},
        )
        self.assertEqual(status, 200)
        self.assertEqual(approved["status"], "approved")
        self.assertIsNotNone(approved["decided_at"])

    def test_feedback_submission(self):
        """Client feedback is recorded with suggestion, decision, and optional correction."""
        status, res = self.jordan.request(
            "POST",
            "/accounts/A01/feedback",
            {
                "suggestion": "Add flood policy endorsement recommendation.",
                "decision": "accepted",
                "correction": "Client confirmed river proximity requires explicit flood coverage.",
            },
        )
        self.assertEqual(status, 201)
        self.assertIn("feedback_id", res)
        self.assertEqual(res["decision"], "accepted")

    def test_direct_fts5_retrieval(self):
        """Keyword search on SQLite snapshot returns relevant citations."""
        with main.closing(main._get_database_connection()) as conn:
            user = main.SessionUser(
                user_id="U1",
                email="jordan.davis@meridian.example",
                name="Jordan Davis",
                role="Producer",
                persona="producer",
                region="Midwest",
            )
            ctx = retrieve_authorized(conn, user, "A01", "property damage claim", "2026-10-08")
            self.assertEqual(ctx.account_id, "A01")
            self.assertGreater(len(ctx.records), 0)
            self.assertIn(ctx.method, {"sqlite_fts5", "lexical"})
            self.assertTrue(all(r.account_id == "A01" for r in ctx.records))
            self.assertTrue(all(r.source_table for r in ctx.records))
