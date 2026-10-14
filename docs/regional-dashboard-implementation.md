# Regional portfolio and authenticated workspaces

Implemented against `Regional Leader - Midwest portfolio@1x.png` and the sign-in mockup in this directory.

## Experience

Signing in with a valid account opens the workspace assigned by the server. Producers see their owned clients. Morgan Hayes sees the authorized Midwest portfolio. The role selector, producer impersonation controls, and “View as” panel have been removed. Signing out revokes the session; a page refresh restores an unexpired session.

The regional screen provides five KPI cards, producer/risk/renewal filters, the ranked client table, selected-client details, a 90-day timeline, producer workloads, regional questions, and review-task assignment. Opening a client brief retains the leader's identity and provides a return button. Task assignment targets the owning producer and creates a pending item; the producer can approve or reject that specific item.

The mockup lists all nine Midwest clients even though its filter reads “next 90 days.” The implementation defaults to **All renewals** so the label matches the displayed dataset. Selecting **Next 90 days** returns six clients. Filters affect the KPIs, table, workload, summary, timeline, and regional answers consistently.

The client workspace now renders returned risks, opportunities, assumptions, commitments, milestones, contradictions, evidence, relationship events, and claim-review counts. It no longer reuses Riverside's fixed content for other clients. Draft text is editable, approvals target explicit actions, corrections accept user-written notes, and errors are visible.

## API and backend

| Endpoint | Purpose and access |
| --- | --- |
| `POST /auth/login` | Verify email/password; create a revocable session and CSRF token. |
| `GET /auth/session` | Restore the signed-in user and session verification token. |
| `POST /auth/logout` | Revoke the current session and clear the cookie. |
| `GET /accounts` | Return the authenticated producer's book or leader's authorized regional clients. |
| `GET /portfolio?producer_id=&risk_level=&renewal_days=` | Leader-only filtered portfolio, KPIs, table rows, workload, summary, sources, and timeline. Zero renewal days means all renewals. |
| `POST /portfolio/ask` | Leader-only regional questions using the same filters and authorized records. |
| `GET /accounts/{id}/brief` | Build a current, account-scoped brief and evidence from relational source records. |
| `GET /accounts/{id}/policies`, `/claims`, `/billing`, `/service-cases`, `/documents` | Account and resource access enforced on every request. |
| `GET /accounts/{id}/actions` | Authorized client's task/draft history. |
| `POST /actions` | Create a pending draft or task; validate client, brief, and owning-producer assignment. |
| `PATCH /actions/{id}` | Authorized approval/rejection; reject repeated decisions with HTTP 409. |
| `POST /feedback` | Save feedback against an authorized client/brief/signal; validate references and correction text. |
| `POST /copilot/ask` | Answer selected-client questions from accessible records; return real citations and measured response time. |
| `GET /admin/audit` | Current user's measured rule-assistant activity for the current UTC day. |

Legacy user/region account-list routes remain for compatibility, enforce session identity, and are marked deprecated. A query parameter or request-body user ID cannot impersonate another user. Missing sessions return 401; denied scopes/resources return 403. Access defaults to denied when no explicit rule exists. Producer ownership and leader region are checked in addition to access-rule flags.

Backend responsibilities are separated into `auth.py`, `access.py`, `intelligence.py`, `portfolio.py`, `models.py`, and `main.py`. Frontend session/request handling lives in `api.ts`, with separate sign-in, regional, producer, header, and detail components. TanStack Query manages scoped requests, loading/error states, cancellation, refresh, and cache clearing between sessions.

## Database and data definitions

- Existing relational business data is preserved. Runtime migration adds `auth_credentials`, `auth_sessions`, `login_failures`, and `security_events`; task assignment and feedback account references are added when needed.
- Passwords use salted PBKDF2-SHA256 hashes. Session tokens are stored as SHA256 hashes, expire server-side, and are sent in HttpOnly, SameSite=Strict cookies. Mutating authenticated requests require the session's CSRF token. Repeated invalid logins are throttled.
- SQL seeds retain explicit synthetic records. SQLite initialization also provisions synthetic login credentials. Resetting a synthetic database clears its old security sessions. Do not reset the current database just to apply this change; migration is automatic.
- All portfolio aggregates use allowed regional accounts, excluding Harbor Marine in Northeast from Morgan's results and totals. Priya can access Harbor's permitted records, but its restricted document content and document-derived opportunity evidence are excluded.
- Premium at risk is the annual account premium of high-risk clients, counted once per account. Renewal metrics use each client's earliest active-policy renewal. Workload uses clients in the current regional filters; pending tasks use the assigned producer, falling back to the owning producer for older records.
- The seed's scenario date is **8 October 2026**, configurable with `MERIDIAN_AS_OF_DATE`. The UI shows this date. With no filters, expected totals are 9 clients, $5.44M annual premium, $2.77M premium at risk, 4 renewals in 30 days worth $3.39M, 3 high-risk clients, 3 open high-severity claims, and 3 overdue commitments.
- Open claims, pending endorsements, open service issues, overdue commitments/billing, and policy/CRM date contradictions are read from current source records. Injecting a claim or date mismatch changes the next brief without changing code. Curated note/opportunity signals require accessible evidence resolving to that same client's records.

## Running and signing in

Run the API and Vite client using their existing README commands. Vite proxies `/auth` as well as the account, portfolio, action, feedback, copilot, and audit endpoints.

| Synthetic account | Workspace |
| --- | --- |
| `jordan.davis@meridian.example` | Producer, five owned clients |
| `priya.nair@meridian.example` | Producer, five owned clients with document restrictions |
| `morgan.hayes@meridian.example` | Regional leader, nine Midwest clients |

All three synthetic passwords are `MeridianDemo!2026`. Credentials are displayed in a collapsed demo-account panel on sign-in; choosing an account fills the form and still requires credential verification.

Normal sessions expire after eight hours and use a browser-session cookie. Remember-me sessions last 30 days. `COOKIE_SECURE=1` enables HTTPS-only cookies, `CORS_ORIGINS` configures permitted origins, and `DEMO_AUTH_ENABLED=0` disables automatic creation of synthetic credentials on a fresh database. Existing provisioned credentials are preserved. `MERIDIAN_API_TARGET` overrides Vite's backend target for isolated verification.

## Validation

- Backend: `.\meridian-api\.venv\Scripts\python.exe -m unittest discover -s meridian-api/tests -v`.
- Frontend: `npm.cmd run build` and `npm.cmd run lint` in `meridian-ui`.
- Optional browser check: requires the Python Playwright package and Edge; run `python meridian-ui/tests/browser_smoke.py --url http://127.0.0.1:5174 --screenshot docs/validation/regional-dashboard.png` against an **isolated seeded API**. The test creates a review task and logs in as all three synthetic users.

Verification covered password rejection, session restore/logout/expiry, CSRF enforcement, login throttling, producer separation, region/resource denial, spoofed identities, filtered totals, task assignment/decisions, feedback references, new source claims/conflicts, real citations, desktop/mobile rendering, and brief navigation. Browser screenshots are in `docs/validation`.

## Remaining scope

The assistant is explicitly rule-based; no external AI model is invoked and model tokens/cost are zero. Curated opportunity/note confidence remains seeded rather than learned. Corrections are saved for human review and do not modify source policy/claim records. The login is local credential authentication; corporate SSO, password reset/provisioning, a full AI agent, and broader hackathon deliverables are separate work.
