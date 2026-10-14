# meridianbroker

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

The API now requires a session for business endpoints. Sign in through the UI or `POST /auth/login` before calling `/accounts` or `/portfolio`. Security tables are migrated automatically without resetting existing client data.

See [regional dashboard implementation](../docs/regional-dashboard-implementation.md) for demo credentials, API contracts, access rules, configuration, and verification.

Run backend regressions:
```powershell
python -m unittest discover -s tests -v
```
