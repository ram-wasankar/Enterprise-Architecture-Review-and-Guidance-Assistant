"""A local, read-only MCP boundary over normalized source exports."""
import json
import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from app.models import Snapshot

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("REVIEW_DATA_DIR", ROOT / "data"))
server = FastMCP("architecture-evidence")


def load_snapshot() -> Snapshot:
    standards = json.loads((DATA / "standards.json").read_text())
    leanix = json.loads((DATA / "leanix.json").read_text())
    return Snapshot(standards=standards, inventory=leanix["applications"], exported_at=leanix["exported_at"])


@server.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
def read_standards() -> dict:
    """Read approved standards from the configured export; no writes or arbitrary paths."""
    return {"standards": [s.model_dump() for s in load_snapshot().standards]}


@server.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
def read_inventory() -> dict:
    """Read the normalized LeanIX export with its export timestamp."""
    snapshot = load_snapshot()
    return {"inventory": [i.model_dump() for i in snapshot.inventory], "exported_at": snapshot.exported_at}


if __name__ == "__main__":
    server.run(transport="stdio")
