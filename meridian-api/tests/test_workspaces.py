"""Exercise real ASGI routes using isolated seeded SQLite databases (stdlib only)."""

import asyncio
import hashlib
import json
import sqlite3
import sys
import time
import unittest
import uuid
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from auth import COOKIE_NAME, DEMO_PASSWORD, initialize_security


class ApiClient:
    def __init__(self):
        self.cookies = {}
        self.csrf = ""

    def request(self, method, url, body=None, csrf=True):
        async def invoke():
            parts, messages = urlsplit(url), []
            content = json.dumps(body).encode() if body is not None else b""
            received = False

            async def receive():
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": content, "more_body": False}
                await asyncio.Event().wait()

            async def send(message):
                messages.append(message)

            headers = [(b"content-type", b"application/json")]
            if self.cookies:
                headers.append(
                    (
                        b"cookie",
                        "; ".join(f"{key}={value}" for key, value in self.cookies.items()).encode(),
                    )
                )
            if csrf and self.csrf:
                headers.append((b"x-csrf-token", self.csrf.encode()))
            scope = {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": method,
                "scheme": "http",
                "path": parts.path,
                "raw_path": parts.path.encode(),
                "query_string": parts.query.encode(),
                "root_path": "",
                "headers": headers,
                "client": ("127.0.0.1", 12345),
                "server": ("test", 80),
            }
            await main.app(scope, receive, send)
            start = next(
                message for message in messages if message["type"] == "http.response.start"
            )
            for key, value in start["headers"]:
                if key == b"set-cookie":
                    parsed = SimpleCookie(value.decode())
                    for name, item in parsed.items():
                        if item["max-age"] == "0":
                            self.cookies.pop(name, None)
                        else:
                            self.cookies[name] = item.value
            payload = json.loads(
                b"".join(
                    message.get("body", b"")
                    for message in messages
                    if message["type"] == "http.response.body"
                )
            )
            if "csrf_token" in payload:
                self.csrf = payload["csrf_token"]
            return start["status"], payload

        return asyncio.run(invoke())

    def login(self, email):
        return self.request("POST", "/auth/login", {"email": email, "password": DEMO_PASSWORD})


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.uri = f"file:meridian_test_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.anchor = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
        self.anchor.row_factory = sqlite3.Row
        self.anchor.executescript(
            (
                Path(__file__).resolve().parents[1] / "sql/meridian_schema_and_seed_sqlite.sql"
            ).read_text(encoding="utf-8")
        )
        initialize_security(self.anchor)
        self.previous = main._get_database_connection

        def connection():
            result = sqlite3.connect(self.uri, uri=True, check_same_thread=False)
            result.row_factory = sqlite3.Row
            result.execute("PRAGMA foreign_keys=ON")
            return result

        main._get_database_connection = connection
        self.jordan, self.priya, self.leader = ApiClient(), ApiClient(), ApiClient()
        for client, email in [
            (self.jordan, "jordan.davis@meridian.example"),
            (self.priya, "priya.nair@meridian.example"),
            (self.leader, "morgan.hayes@meridian.example"),
        ]:
            self.assertEqual(client.login(email)[0], 200)

    def tearDown(self):
        main._get_database_connection = self.previous
        self.anchor.close()

    def test_password_session_csrf_logout_and_expiry(self):
        stranger = ApiClient()
        self.assertEqual(
            stranger.request(
                "POST",
                "/auth/login",
                {"email": "jordan.davis@meridian.example", "password": "incorrect"},
            )[0],
            401,
        )
        self.assertEqual(stranger.request("GET", "/accounts")[0], 401)
        self.assertEqual(
            self.leader.request("GET", "/auth/session")[1]["user"]["role"], "Regional Leader"
        )
        self.assertEqual(
            self.jordan.request(
                "POST",
                "/auth/logout",
                {},
                csrf=False,
            )[0],
            403,
        )
        self.assertEqual(self.jordan.request("POST", "/auth/logout", {})[0], 200)
        self.assertEqual(self.jordan.request("GET", "/accounts")[0], 401)
        self.anchor.execute("UPDATE auth_sessions SET expires_at=?", (int(time.time()) - 1,))
        self.anchor.commit()
        self.assertEqual(self.priya.request("GET", "/accounts")[0], 401)
        status, restored = stranger.request(
            "POST",
            "/auth/login",
            {
                "email": "jordan.davis@meridian.example",
                "password": DEMO_PASSWORD,
                "remember_me": True,
                "role": "Regional Leader",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(restored["user"]["role"], "Producer")
        token_hash = hashlib.sha256(stranger.cookies[COOKIE_NAME].encode()).hexdigest()
        expires = self.anchor.execute(
            "SELECT expires_at FROM auth_sessions WHERE token_hash=?", (token_hash,)
        ).fetchone()[0]
        self.assertGreater(expires - int(time.time()), 29 * 86400)

    def test_login_throttle(self):
        stranger = ApiClient()
        for _ in range(5):
            self.assertEqual(
                stranger.request(
                    "POST", "/auth/login", {"email": "missing@meridian.example", "password": "bad"}
                )[0],
                401,
            )
        self.assertEqual(
            stranger.request(
                "POST", "/auth/login", {"email": "missing@meridian.example", "password": "bad"}
            )[0],
            429,
        )

    def test_books_and_no_identity_spoofing(self):
        self.assertEqual(
            {row["account_id"] for row in self.jordan.request("GET", "/accounts")[1]},
            {"A01", "A02", "A03", "A08", "A09"},
        )
        self.assertEqual(
            {row["account_id"] for row in self.priya.request("GET", "/accounts")[1]},
            {"A04", "A05", "A06", "A07", "A10"},
        )
        for path in [
            "/accounts/A05/documents",
            "/accounts/A05/documents?user_id=U2",
            "/accounts/A05/brief",
            "/portfolio",
        ]:
            self.assertEqual(self.jordan.request("GET", path)[0], 403, path)
        self.assertEqual(self.jordan.request("GET", "/accounts/A01/claims?user_id=unknown")[0], 403)
        self.assertEqual(self.priya.request("GET", "/accounts/A05/documents")[0], 403)
        self.assertEqual(self.priya.request("GET", "/accounts/A05/brief")[1]["opportunities"], [])
        self.anchor.execute(
            "UPDATE access_rules SET allowed=1 WHERE user_id='U1' AND account_id='A04'"
        )
        self.anchor.commit()
        self.assertEqual(self.jordan.request("GET", "/accounts/A04/brief")[0], 403)

    def test_regional_totals_filters_and_workloads(self):
        status, data = self.leader.request("GET", "/portfolio")
        self.assertEqual(status, 200)
        expected = {
            "total_accounts": 9,
            "total_annual_premium": 5440000,
            "premium_at_risk": 2770000,
            "renewals_30_days": 4,
            "renewals_30_days_premium": 3390000,
            "high_risk_clients": 3,
            "open_high_severity_claims": 3,
            "overdue_commitments": 3,
            "locked_count": 1,
        }
        for key, value in expected.items():
            self.assertEqual(data[key], value, key)
        self.assertNotIn("A05", [row["account_id"] for row in data["accounts"]])
        self.assertEqual([bucket["count"] for bucket in data["timeline"]], [4, 1, 1])
        self.assertEqual(
            [(row["clients"], row["open_claims"], row["overdue"]) for row in data["workloads"]],
            [(5, 3, 1), (4, 2, 2)],
        )
        filtered = self.leader.request(
            "GET", "/portfolio?producer_id=U2&risk_level=high&renewal_days=30"
        )[1]
        self.assertEqual([row["account_id"] for row in filtered["accounts"]], ["A06"])
        self.assertEqual(filtered["total_annual_premium"], 720000)
        self.assertEqual(self.leader.request("GET", "/portfolio?producer_id=unknown")[0], 403)
        self.assertEqual(self.leader.request("GET", "/accounts/A05/brief")[0], 403)

    def test_live_claim_conflicts_and_real_citations(self):
        before = self.jordan.request("GET", "/accounts/A01/brief")[1]
        self.assertEqual(before["latest_brief"]["persona"], "producer")
        self.anchor.execute(
            "INSERT INTO claims (claim_id,policy_id,account_id,claim_number,status,loss_date,severity,summary,source_system,updated_at) VALUES ('C_TEST','P01','A01','CLM-TEST','open','2026-10-08','high','Injected material claim','Guidewire ClaimCenter','2026-10-08')"
        )
        self.anchor.execute(
            "UPDATE policies SET crm_renewal_date='2027-01-01' WHERE account_id='A08'"
        )
        self.anchor.commit()
        after = self.jordan.request("GET", "/accounts/A01/brief")[1]
        self.assertEqual(after["claim_review"]["reviewed"], 2)
        self.assertIn("CLM-TEST", " ".join(risk["title"] for risk in after["risks"]))
        self.assertNotEqual(before["summary"], after["summary"])
        self.assertEqual(
            len(self.jordan.request("GET", "/accounts/A08/brief")[1]["contradictions"]), 2
        )

    def test_security_migration_preserves_business_records(self):
        count = self.anchor.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        digest = self.anchor.execute(
            "SELECT password_hash FROM auth_credentials WHERE user_id='U1'"
        ).fetchone()[0]
        initialize_security(self.anchor)
        self.assertEqual(self.anchor.execute("SELECT COUNT(*) FROM accounts").fetchone()[0], count)
        self.assertEqual(
            self.anchor.execute(
                "SELECT password_hash FROM auth_credentials WHERE user_id='U1'"
            ).fetchone()[0],
            digest,
        )
        raw = self.jordan.cookies[COOKIE_NAME]
        self.assertIsNotNone(
            self.anchor.execute(
                "SELECT 1 FROM auth_sessions WHERE token_hash=?",
                (hashlib.sha256(raw.encode()).hexdigest(),),
            ).fetchone()
        )

    def test_business_rules_confidence_and_thresholds(self):
        # 1. Riverside A01 brief: checks R1, R2, R3, R4 and high risk roll-up
        status, brief = self.jordan.request("GET", "/accounts/A01/brief")
        self.assertEqual(status, 200)
        self.assertEqual(brief["account"]["risk_level"], "high")
        risks = {r["category"]: r for r in brief["risks"]}
        self.assertIn("claims", risks)
        self.assertEqual(risks["claims"]["severity"], "high")
        self.assertIn("data_conflict", risks)
        self.assertEqual(risks["data_conflict"]["severity"], "medium")
        # R2 uses weakest conflicting source and 0 corroboration
        self.assertAlmostEqual(float(risks["data_conflict"]["confidence"]), 0.68, places=2)

        # 2. Lakeside A08 brief: R8 stale meeting has 49% confidence (< 50% floor) -> account stays 'low'
        status, lakeside = self.jordan.request("GET", "/accounts/A08/brief")
        self.assertEqual(status, 200)
        self.assertEqual(lakeside["account"]["risk_level"], "low")


if __name__ == "__main__":
    unittest.main()
