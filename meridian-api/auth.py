"""Password authentication, revocable cookie sessions, and CSRF protection."""

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from collections.abc import Callable
from contextlib import closing

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

COOKIE_NAME = "meridian_session"
ITERATIONS = 210_000
DEMO_PASSWORD = "MeridianDemo!2026"


def password_hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()


def initialize_security(connection: sqlite3.Connection) -> None:
    """Add security tables without resetting existing business data."""
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS auth_credentials (
            user_id TEXT PRIMARY KEY REFERENCES users(user_id),
            salt TEXT NOT NULL, password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(user_id),
            csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_failures (
            email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS security_events (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT,
            account_id TEXT, event TEXT NOT NULL, detail TEXT, ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            log_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(user_id),
            account_id TEXT REFERENCES accounts(account_id),
            persona TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'brief_generation',
            model TEXT NOT NULL,
            tokens_in INTEGER NOT NULL,
            tokens_out INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            cost_usd NUMERIC(8,6) NOT NULL DEFAULT 0.0,
            latency_ms INTEGER NOT NULL,
            completeness_passed BOOLEAN NOT NULL DEFAULT 1,
            blocked_flag BOOLEAN NOT NULL DEFAULT 0,
            block_reason TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """)
    if os.getenv("DEMO_AUTH_ENABLED", "1") == "1":
        for row in connection.execute(
            "SELECT user_id FROM users WHERE user_id IN ('U1','U2','U5')"
        ):
            if not connection.execute(
                "SELECT 1 FROM auth_credentials WHERE user_id=?", (row[0],)
            ).fetchone():
                salt = secrets.token_hex(16)
                connection.execute(
                    "INSERT INTO auth_credentials VALUES (?,?,?)",
                    (row[0], salt, password_hash(DEMO_PASSWORD, salt)),
                )
    connection.commit()


class SessionUser(BaseModel):
    user_id: str
    name: str
    email: str
    persona: str
    region: str

    def profile(self) -> dict:
        role = "Regional Leader" if self.persona == "regional_leader" else "Producer"
        return {
            "userId": self.user_id,
            "name": self.name,
            "email": self.email,
            "role": role,
            "region": self.region,
            "title": f"{role} | {self.region}" if self.persona == "regional_leader" else role,
        }


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    remember_me: bool = False


class AuthService:
    def __init__(self, get_connection: Callable[[], sqlite3.Connection]):
        self.get_connection = get_connection
        self.router = APIRouter(prefix="/auth", tags=["Authentication"])
        self.router.add_api_route("/login", self.login, methods=["POST"])
        self.router.add_api_route("/session", self.session, methods=["GET"])
        self.router.add_api_route("/logout", self.logout, methods=["POST"])

    def _session(self, request: Request) -> tuple[SessionUser, str]:
        token = request.cookies.get(COOKIE_NAME, "")
        if not token:
            raise HTTPException(401, "Please sign in to continue.")
        with closing(self.get_connection()) as connection:
            row = connection.execute(
                """
                SELECT u.*, s.csrf_token FROM auth_sessions s JOIN users u ON u.user_id=s.user_id
                WHERE s.token_hash=? AND s.expires_at>?
            """,
                (hashlib.sha256(token.encode()).hexdigest(), int(time.time())),
            ).fetchone()
        if not row:
            raise HTTPException(401, "Your session expired. Please sign in again.")
        if request.method not in ("GET", "HEAD", "OPTIONS") and not hmac.compare_digest(
            request.headers.get("X-CSRF-Token", ""), row["csrf_token"]
        ):
            raise HTTPException(403, "Invalid session verification. Refresh and try again.")
        return SessionUser(**dict(row)), row["csrf_token"]

    def require_user(self, request: Request) -> SessionUser:
        return self._session(request)[0]

    def login(self, payload: LoginRequest, request: Request, response: Response) -> dict:
        email = payload.email.strip().lower()
        now = int(time.time())
        with closing(self.get_connection()) as connection:
            failure = connection.execute(
                "SELECT * FROM login_failures WHERE email=?", (email,)
            ).fetchone()
            if failure and now - failure["window_start"] < 300 and failure["attempts"] >= 5:
                raise HTTPException(429, "Too many sign-in attempts. Try again in five minutes.")
            row = connection.execute(
                """
                SELECT u.*, c.salt, c.password_hash FROM users u
                JOIN auth_credentials c ON c.user_id=u.user_id WHERE lower(u.email)=?
            """,
                (email,),
            ).fetchone()
            digest = password_hash(payload.password, row["salt"] if row else "00" * 16)
            if not row or not hmac.compare_digest(digest, row["password_hash"]):
                in_window = failure and now - failure["window_start"] < 300
                start = failure["window_start"] if in_window else now
                attempts = failure["attempts"] + 1 if in_window else 1
                connection.execute(
                    "INSERT OR REPLACE INTO login_failures VALUES (?,?,?)", (email, attempts, start)
                )
                connection.execute(
                    "INSERT INTO security_events (event,detail) VALUES ('login_failed','Invalid credentials')"
                )
                connection.commit()
                raise HTTPException(401, "Email or password is incorrect.")
            user = SessionUser(**dict(row))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            ttl = 30 * 86400 if payload.remember_me else 8 * 3600
            old_token = request.cookies.get(COOKIE_NAME, "")
            connection.execute(
                "DELETE FROM auth_sessions WHERE expires_at<=? OR token_hash=?",
                (now, hashlib.sha256(old_token.encode()).hexdigest()),
            )
            connection.execute(
                "INSERT INTO auth_sessions VALUES (?,?,?,?)",
                (hashlib.sha256(token.encode()).hexdigest(), user.user_id, csrf, now + ttl),
            )
            connection.execute("DELETE FROM login_failures WHERE email=?", (email,))
            connection.execute(
                "INSERT INTO security_events (user_id,event) VALUES (?,'login')", (user.user_id,)
            )
            connection.commit()
        response.set_cookie(
            COOKIE_NAME,
            token,
            httponly=True,
            secure=os.getenv("COOKIE_SECURE", "0") == "1",
            samesite="strict",
            path="/",
            max_age=ttl if payload.remember_me else None,
        )
        response.headers["Cache-Control"] = "no-store"
        return {"user": user.profile(), "csrf_token": csrf}

    def session(self, request: Request, response: Response) -> dict:
        user, csrf = self._session(request)
        response.headers["Cache-Control"] = "no-store"
        return {"user": user.profile(), "csrf_token": csrf}

    def logout(self, request: Request, response: Response) -> dict:
        user, _ = self._session(request)
        with closing(self.get_connection()) as connection:
            connection.execute(
                "DELETE FROM auth_sessions WHERE token_hash=?",
                (hashlib.sha256(request.cookies[COOKIE_NAME].encode()).hexdigest(),),
            )
            connection.execute(
                "INSERT INTO security_events (user_id,event) VALUES (?,'logout')", (user.user_id,)
            )
            connection.commit()
        response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="strict")
        return {"status": "signed_out"}
