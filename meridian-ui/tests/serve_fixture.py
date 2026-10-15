"""Isolated browser-test API. Never opens the user's database or calls an LLM gateway."""

import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "meridian-api"))

with tempfile.TemporaryDirectory(prefix="meridian-ui-validation-") as directory:
    os.environ["SQLITE_DB_PATH"] = str(Path(directory) / "fixture.db")
    os.environ["RESET_DB_ON_START"] = "0"
    import main
    from agent import ClientIntelligenceAgent

    def unavailable_provider(*_args, **_kwargs):
        # Make real queued/running progress observable without external network calls.
        time.sleep(1)
        raise RuntimeError("Remote generation disabled for isolated browser verification")

    with patch.object(
        ClientIntelligenceAgent,
        "_call_model",
        side_effect=unavailable_provider,
    ):
        uvicorn.run(main.app, host="127.0.0.1", port=8011)
