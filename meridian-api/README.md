# meridianbroker

The latest [AI integration report](../docs/hub-refresh-and-ai.md) documents automatic client
preparation, persisted background jobs, source/permission-aware cache isolation, bounded provider
calls and verified fallback behavior. Database resets are opt-in (`RESET_DB_ON_START=1`);
normal startup preserves existing business records and real provider audit history.
Every backend start or reload clears generated briefs and generation jobs; brief
versions restart at 1. AI output is reused only within that backend session.
Source seed scripts contain no generated briefs or fabricated generation audit
entries. Historical scenario examples are isolated in `sql/fixtures/` and are
never loaded automatically. Existing databases receive the same generated-state
cleanup on their next startup, including removal of known legacy fixture audit IDs.

## Accounts API

This backend service runs on FastAPI and uses Python's built-in `sqlite3` database engine, managed with **`uv`**.

### Setup & Run with `uv` (Recommended)

1. Navigate to the API directory:
```powershell
cd meridian-api
```

2. Sync dependencies:
```powershell
uv sync
```

3. (Optional) Initialize/reset database:
The database (`meridian.db`) is automatically created and seeded on first run if it doesn't exist. You can also re-initialize it manually:
```powershell
uv run python init_db.py
```

4. Start the API server:
```powershell
uv run uvicorn main:app --reload
```

---

### Alternative: Standard Python & pip

```powershell
cd meridian-api
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

- **API Endpoint:** `http://127.0.0.1:8000/accounts`
- **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`

---

### Linting & Formatting with Ruff

Check linting:
```powershell
uv run ruff check .
```

Auto-fix linting issues:
```powershell
uv run ruff check . --fix
```

Format code:
```powershell
uv run ruff format .
```

Check formatting:
```powershell
uv run ruff format --check .
```

### Authenticated workspaces

Account review workflows reuse the session and CSRF token:

- `POST /accounts/{id}/copilot` accepts `{question}` and returns `{answer, evidence_citations, mode: "source_based", as_of_date}`. This is targeted source retrieval, not an LLM conversation. It reads only the selected client's permitted sources and does not incur remote model usage.
- `GET /accounts/{id}/actions` returns `{actions: [...]}` for the current user's review requests.
- `POST /accounts/{id}/actions` accepts `{action_type, title, description}`; action types are `draft_followup`, `review_task`, and `referral`. New requests have status `pending_approval`.
- `POST /accounts/{id}/actions/{action_id}/approve` accepts `{approved: true|false}`. A decision is recorded once; changed source records require a fresh request before approval. Approval never sends a message or changes policy data.
- `POST /accounts/{id}/feedback` accepts `{suggestion, decision, correction?}` with decision `accepted`, `rejected`, or `corrected`. Corrected feedback requires a correction. Feedback records human assessment, not independently verified model accuracy.

Workflow tables are created lazily after authorization and persist separately from generation-session resets. Requests and decisions are owner scoped and create security audit events. Suggested-action descriptions and feedback are limited to 12,000 characters; questions to 2,000.

Token costs are public list estimates rather than enterprise gateway invoices. Telemetry includes `cost_known` and `cost_basis`; an unpriced model is explicitly unknown, and no remote usage is labeled `no_remote_usage`. Gemini prices follow [Google's pricing reference](https://ai.google.dev/gemini-api/docs/pricing); Flash-Lite uses $0.10 input/$0.40 output per million tokens.

The API now requires a session for business endpoints. Sign in through the UI or `POST /auth/login` before calling `/accounts` or `/portfolio`. Security tables are migrated automatically without resetting existing client data.

See [regional dashboard implementation](../docs/regional-dashboard-implementation.md) for demo credentials, API contracts, access rules, configuration, and verification.

Run backend regressions:
```powershell
python -m unittest discover -s tests -v
```
