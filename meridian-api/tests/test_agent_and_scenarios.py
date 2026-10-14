"""
Comprehensive verification of Client Intelligence Agent and all 5 Mandatory Scenarios.
Tests live LiteLLM gateway, schema validation, deterministic fallback, completeness verification,
RBAC protection, live scenario injection, and audit tokenomics.
"""

import sqlite3
import sys
import unittest
import uuid
from pathlib import Path

# Add parent directory to sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import main  # noqa: E402
from agent import (  # noqa: E402
    BriefAgentInputContext,
    BriefAgentOutput,
    ClaimContext,
    SuggestedAction,
    verify_brief_completeness,
)
from auth import initialize_security  # noqa: E402
from tests.test_workspaces import ApiClient  # noqa: E402


class AgentAndMandatoryScenariosTests(unittest.TestCase):
    def setUp(self):
        # Create an isolated in-memory SQLite database loaded with schema and synthetic data
        self.uri = f"file:meridian_agent_test_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.anchor = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
        self.anchor.row_factory = sqlite3.Row
        sql_content = (BASE_DIR / "sql/meridian_schema_and_seed_sqlite.sql").read_text(
            encoding="utf-8"
        )
        self.anchor.executescript(sql_content)
        initialize_security(self.anchor)

        self.previous_conn = main._get_database_connection

        def connection():
            res = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
            res.row_factory = sqlite3.Row
            res.execute("PRAGMA foreign_keys=ON")
            return res

        main._get_database_connection = connection

        self.jordan = ApiClient()
        self.priya = ApiClient()
        self.leader = ApiClient()

        self.assertEqual(self.jordan.login("jordan.davis@meridian.example")[0], 200)
        self.assertEqual(self.priya.login("priya.nair@meridian.example")[0], 200)
        self.assertEqual(self.leader.login("morgan.hayes@meridian.example")[0], 200)

    def tearDown(self):
        main._get_database_connection = self.previous_conn
        self.anchor.close()

    def test_completeness_validator(self):
        """Unit test: Deterministic completeness checker verifies open claims citation."""
        context = BriefAgentInputContext(
            account_id="A02",
            account_name="Horizon Health Systems",
            risk_level="high",
            open_claims=[
                ClaimContext(
                    claim_id="C02",
                    claim_number="CLM-88410",
                    severity="high",
                    summary="Open malpractice claim",
                    status="open",
                )
            ],
        )

        # 1. Output omitting the claim fails completeness
        bad_output = BriefAgentOutput(
            executive_summary="Steady hospital account with general risks.",
            agenda=["1. Annual review", "2. EHR plans"],
            talking_points=["Discuss service level agreement."],
            prioritized_risks=["Service delay"],
            opportunity_hypotheses=[],
            suggested_actions=[
                SuggestedAction(
                    action_type="draft_followup",
                    title="Follow-up",
                    description="Email client",
                )
            ],
            evidence_citations=["P01"],
        )
        passed, reason = verify_brief_completeness(bad_output, context)
        self.assertFalse(passed)
        self.assertIn("CLM-88410", reason)

        # 2. Output citing the claim passes completeness
        good_output = BriefAgentOutput(
            executive_summary="Horizon Health renewal at risk due to open claim CLM-88410.",
            agenda=["1. Review claim CLM-88410 status", "2. Underwriter discussion"],
            talking_points=["Malpractice claim CLM-88410 is active."],
            prioritized_risks=["Active litigation under CLM-88410"],
            opportunity_hypotheses=[],
            suggested_actions=[
                SuggestedAction(
                    action_type="review_task",
                    title="Legal update",
                    description="Request loss runs for CLM-88410",
                )
            ],
            evidence_citations=["CLM-88410", "P03"],
        )
        passed, reason = verify_brief_completeness(good_output, context)
        self.assertTrue(passed)
        self.assertIsNone(reason)

    def test_scenario_1_material_open_claim_omission_and_regeneration(self):
        """
        Scenario 1:
        Account A02 (Horizon Health Systems) initial v1 brief omits claim CLM-88410.
        UI/API returns completeness failure.
        User calls POST /accounts/A02/brief/generate.
        Agent generates v2, validator confirms CLM-88410 is cited, version increments,
        and completeness passes.
        """
        # Step 1: GET initial brief
        status, brief = self.jordan.request("GET", "/accounts/A02/brief")
        self.assertEqual(status, 200)
        self.assertEqual(brief["latest_brief"]["version"], 1)
        self.assertFalse(brief["claim_review"]["complete"])
        self.assertIn("CLM-88410", brief["claim_review"]["omitted"])

        # Step 2: POST /accounts/A02/brief/generate
        status, regenerated = self.jordan.request("POST", "/accounts/A02/brief/generate", {})
        self.assertEqual(status, 200)
        self.assertEqual(regenerated["latest_brief"]["version"], 2)
        self.assertTrue(regenerated["claim_review"]["complete"])
        self.assertIsNone(regenerated["claim_review"]["omitted"])

        # Verify CLM-88410 is present in citations, summary or agenda
        v2_content = regenerated["latest_brief"]["content_json"]
        combined_text = (
            f"{v2_content.get('summary', '')} "
            f"{' '.join(v2_content.get('agenda', []))} "
            f"{' '.join(v2_content.get('evidence_citations', []))} "
            f"{' '.join(v2_content.get('prioritized_risks', []))}"
        )
        self.assertIn("CLM-88410", combined_text)

        # Verify audit log recorded the generation with telemetry
        audit_row = self.anchor.execute(
            "SELECT * FROM audit_log WHERE account_id='A02' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        self.assertIsNotNone(audit_row)
        self.assertEqual(audit_row["action"], "brief_generation")
        self.assertGreater(audit_row["total_tokens"], 0)
        self.assertEqual(audit_row["completeness_passed"], 1)

    def test_scenario_2_conflicting_renewal_dates_agenda(self):
        """
        Scenario 2:
        Account A01 (Riverside Manufacturing) has conflicting renewal dates across systems:
        PolicyCenter Oct 20 vs CRM Oct 25.
        Agent brief must contain an explicit agenda item to confirm the discrepancy before binding.
        """
        status, brief = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertEqual(status, 200)
        self.assertTrue(len(brief["contradictions"]) > 0)

        agenda_text = " ".join(brief["agenda"]).lower()
        talking_points_text = " ".join(brief.get("talking_points", [])).lower()
        combined = f"{agenda_text} {talking_points_text}"

        self.assertTrue(
            "discrepancy" in combined
            or "conflict" in combined
            or "reconcil" in combined
            or "date" in combined
        )

    def test_scenario_3_cross_sell_opportunity_lacks_evidence(self):
        """
        Scenario 3:
        Account A07 (Cedar Logistics) has an EV fleet cross-sell signal with low confidence (<60%).
        Agent brief places it strictly under opportunity_hypotheses as an unverified hypothesis.
        """
        status, brief = self.priya.request("GET", "/accounts/A07/brief")
        self.assertEqual(status, 200)

        # Check opportunity signals in brief
        self.assertTrue(len(brief["opportunities"]) > 0)
        top_opp = brief["opportunities"][0]
        self.assertFalse(top_opp["is_fact"])
        self.assertLess(float(top_opp["confidence"]), 0.60)

        # Verify opportunity hypotheses in structured output
        hypotheses = " ".join(brief.get("opportunity_hypotheses", [])).lower()
        self.assertTrue("hypothesis" in hypotheses or "unverified" in hypotheses)

    def test_scenario_4_restricted_info_exposure_protection(self):
        """
        Scenario 4:
        - Layer 1: Producer Jordan Davis (U1) attempting to access Account A05 (Harbor Marine)
          must receive HTTP 403 Forbidden.
        - Layer 2: Producer Priya Nair (U2) accessing A05 with can_view_documents=0 has documents
          stripped from agent context.
        """
        # Layer 1: U1 blocked from A05
        status, _ = self.jordan.request("GET", "/accounts/A05/brief")
        self.assertEqual(status, 403)

        status, _ = self.jordan.request("POST", "/accounts/A05/brief/generate", {})
        self.assertEqual(status, 403)

        # Layer 2: U2 has access to A05, but document permission is False
        status, brief = self.priya.request("GET", "/accounts/A05/brief")
        self.assertEqual(status, 200)
        self.assertFalse(brief["permissions"]["documents"])

        # Confidential survey document is excluded
        status, doc_data = self.priya.request("GET", "/accounts/A05/documents")
        self.assertEqual(status, 403)

    def test_scenario_5_live_injected_scenario(self):
        """
        Scenario 5:
        Injecting a new high-severity claim into SQLite dynamically updates the agent input context
        and regenerated brief without any code rework.
        """
        # Inject new claim for A01
        self.anchor.execute(
            """
            INSERT INTO claims (claim_id, policy_id, account_id, claim_number, status, loss_date, reserve_amount, severity, summary, source_system, updated_at)
            VALUES ('CLM_LIVE_999', 'P01', 'A01', 'CLM-LIVE-999', 'open', '2026-10-08', 350000.0, 'high', 'Live Injected Warehouse Chemical Spill', 'Guidewire ClaimCenter', '2026-10-08')
            """
        )
        self.anchor.commit()

        # Generate fresh brief
        status, regenerated = self.jordan.request("POST", "/accounts/A01/brief/generate", {})
        self.assertEqual(status, 200)

        # Programmatic validator verified CLM-LIVE-999
        v_latest = regenerated["latest_brief"]["content_json"]
        combined_text = (
            f"{v_latest.get('summary', '')} "
            f"{' '.join(v_latest.get('agenda', []))} "
            f"{' '.join(v_latest.get('evidence_citations', []))} "
            f"{' '.join(v_latest.get('prioritized_risks', []))}"
        )
        self.assertIn("CLM-LIVE-999", combined_text)
        self.assertTrue(regenerated["claim_review"]["complete"])

    def test_admin_audit_endpoint(self):
        """Test GET /admin/audit returns aggregated tokenomics and recent entries."""
        # Generate a brief to create an audit record
        self.jordan.request("POST", "/accounts/A02/brief/generate", {})

        status, audit = self.jordan.request("GET", "/admin/audit")
        self.assertEqual(status, 200)
        self.assertIn("summary", audit)
        self.assertIn("recent_logs", audit)
        self.assertGreater(audit["summary"]["total_generations"], 0)
        self.assertGreater(audit["summary"]["total_tokens"], 0)
        self.assertTrue(len(audit["recent_logs"]) > 0)

    def test_offline_deterministic_fallback(self):
        """Test agent falls back gracefully to deterministic generator when gateway is unreachable."""
        from agent import ClientIntelligenceAgent, PolicyContext

        offline_agent = ClientIntelligenceAgent(
            base_url="https://invalid.gateway.local/v1",
            api_key="invalid-key",
        )
        context = BriefAgentInputContext(
            account_id="A01",
            account_name="Riverside Manufacturing",
            risk_level="high",
            annual_premium=1420000.0,
            days_to_renewal=12,
            persona="producer",
            open_claims=[
                ClaimContext(
                    claim_id="C01",
                    claim_number="CLM-99231",
                    severity="high",
                    summary="Property water damage",
                    status="open",
                )
            ],
            policies=[
                PolicyContext(
                    policy_id="P01",
                    line_of_business="Commercial Property",
                    carrier="Travelers",
                    premium=620000.0,
                    renewal_date="2026-10-20",
                )
            ],
        )
        output, telemetry, passed, reason = offline_agent.generate_brief(context)
        self.assertEqual(telemetry.model, "offline-deterministic")
        self.assertTrue(passed)
        self.assertIsNone(reason)
        self.assertIn("CLM-99231", output.evidence_citations)
        self.assertTrue(len(output.agenda) > 0)
        self.assertTrue(len(output.talking_points) > 0)
        self.assertTrue(len(output.suggested_actions) > 0)

    def test_all_accounts_brief_cards_coverage(self):
        """Test all accessible accounts return populated agenda, talking points, actions, citations, and telemetry."""
        # Jordan Davis owns A01, A02, A03, A08, A09
        for acct_id in ["A01", "A02", "A03", "A08", "A09"]:
            status, brief = self.jordan.request("GET", f"/accounts/{acct_id}/brief")
            self.assertEqual(status, 200, f"Failed for account {acct_id}")
            self.assertTrue(len(brief["agenda"]) > 0, f"Empty agenda for {acct_id}")
            self.assertTrue(len(brief["talking_points"]) > 0, f"Empty talking points for {acct_id}")
            self.assertTrue(
                len(brief["suggested_actions"]) > 0, f"Empty suggested actions for {acct_id}"
            )
            self.assertTrue(len(brief["prioritized_risks"]) > 0, f"Empty risks for {acct_id}")
            self.assertTrue(len(brief["evidence_citations"]) > 0, f"Empty citations for {acct_id}")
            self.assertIsNotNone(brief["latest_brief"], f"Missing latest_brief for {acct_id}")
            self.assertIsNotNone(brief["telemetry"], f"Missing telemetry for {acct_id}")

        # Priya Nair owns A04, A06, A07, A10 (and A05 restricted)
        for acct_id in ["A04", "A06", "A07", "A10"]:
            status, brief = self.priya.request("GET", f"/accounts/{acct_id}/brief")
            self.assertEqual(status, 200, f"Failed for account {acct_id}")
            self.assertTrue(len(brief["agenda"]) > 0, f"Empty agenda for {acct_id}")
            self.assertTrue(len(brief["talking_points"]) > 0, f"Empty talking points for {acct_id}")
            self.assertTrue(
                len(brief["suggested_actions"]) > 0, f"Empty suggested actions for {acct_id}"
            )
            self.assertIsNotNone(brief["latest_brief"], f"Missing latest_brief for {acct_id}")
            self.assertIsNotNone(brief["telemetry"], f"Missing telemetry for {acct_id}")

    def test_scenario_1_regional_leader_omission_and_reason(self):
        """Test Regional Leader Morgan Hayes also receives clean Scenario 1 omission on A02."""
        status, brief = self.leader.request("GET", "/accounts/A02/brief")
        self.assertEqual(status, 200)
        self.assertEqual(brief["latest_brief"]["version"], 1)
        self.assertFalse(brief["claim_review"]["complete"])
        self.assertIn("CLM-88410", brief["claim_review"]["omitted"])
        self.assertEqual(brief["completeness_reason"], "open claim CLM-88410 omitted")

    def test_agent_resource_cleanup(self):
        """Test ClientIntelligenceAgent context manager closes underlying HTTP clients cleanly."""
        from agent import ClientIntelligenceAgent

        with ClientIntelligenceAgent() as agent:
            self.assertIsNotNone(agent.client)
            self.assertFalse(agent._http_client.is_closed)
        self.assertTrue(agent._http_client.is_closed)


if __name__ == "__main__":
    unittest.main()
