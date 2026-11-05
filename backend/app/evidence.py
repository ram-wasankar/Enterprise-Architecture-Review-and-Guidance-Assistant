import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.models import Snapshot


async def read_evidence() -> Snapshot:
    # Spawn a fixed server, never a command supplied by the design or the browser.
    async with asyncio.timeout(30):
        async with stdio_client(StdioServerParameters(command=sys.executable, args=["-m", "app.mcp_server"])) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                async def call(name):
                    result = await session.call_tool(name, {})
                    if result.isError:
                        raise RuntimeError("Evidence source could not be read")
                    if result.structuredContent is not None:
                        return result.structuredContent
                    return json.loads("".join(c.text for c in result.content if c.type == "text"))

                standards = await call("read_standards")
                inventory = await call("read_inventory")
                return Snapshot(**standards, **inventory)
