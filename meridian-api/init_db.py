import gc
import os
import sqlite3
import time
from pathlib import Path

from auth import initialize_security

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("SQLITE_DB_PATH", BASE_DIR / "meridian.db"))
SQL_FILE = BASE_DIR / "sql" / "meridian_schema_and_seed_sqlite.sql"


def init_database(
    db_path: Path = DB_PATH,
    sql_file: Path = SQL_FILE,
    force_recreate: bool = True,
) -> None:
    """Initialize and populate the SQLite database with fresh synthetic data.

    If force_recreate is True and db_path exists, remove the existing database file(s)
    to ensure a pristine synthetic state on every start.
    """
    if not sql_file.exists():
        raise FileNotFoundError(f"SQL file not found at: {sql_file}")

    if force_recreate and db_path.exists():
        print(f"Checking database at: {db_path} - removing existing database for fresh start...")
        gc.collect()
        for p in (db_path, Path(f"{db_path}-wal"), Path(f"{db_path}-shm")):
            if p.exists():
                deleted = False
                for _ in range(3):
                    try:
                        p.unlink()
                        print(f"Removed old database file: {p}")
                        deleted = True
                        break
                    except Exception:
                        time.sleep(0.08)
                        gc.collect()
                if not deleted:
                    print(
                        f"Warning: could not delete {p}, will overwrite tables via schema script."
                    )

    print(f"Creating new database with synthetic data at: {db_path}")
    with sqlite3.connect(db_path) as conn:
        with open(sql_file, encoding="utf-8") as f:
            sql_script = f.read()
        conn.executescript(sql_script)
        initialize_security(conn)

    print("Database creation with synthetic data completed successfully.")


if __name__ == "__main__":
    init_database(force_recreate=True)
