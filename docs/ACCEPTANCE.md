# Acceptance checks

Run `pytest -q`, `npm --prefix frontend test`, and `npm --prefix frontend run build` from the repository root after installation.

| Scenario | Expected behavior | Automated coverage |
| --- | --- | --- |
| Two applicable retention rules disagree | Conflict retains both source IDs; no silent winner | Backend graph + React acceptance |
| Telemetry evidence omitted | Missing-evidence finding even when prose claims coverage | Backend graph + React acceptance |
| Inventory relation omitted in design | Flag dependency with source record | Backend graph |
| Referenced component absent | Flag unresolved design and inventory references | Backend graph |
| Source file unavailable | Failed review with sanitized, actionable error | Backend job lifecycle |
| Connection lost during polling | Show interruption; reconnect to the same job | React acceptance |
| User cancels pending/running review | Cancel task; do not publish partial report | Backend + React acceptance |
| No applicable standards | Coverage gap, never an approval | Backend graph |
| Known-good declarations | Pass only the loaded declaration checks | Backend graph |
| User opens a citation | Show exact excerpt and revision in dialog | React acceptance |
| Keyboard operation | Tab reaches fields; Ctrl/Cmd + Enter submits | React acceptance |
| MCP boundary | Real subprocess reads sources; only read tools exposed | Backend integration |
| Optional model unavailable | Retain computed report and expose trace note | Backend job lifecycle |

Manual browser check: run the example, inspect the retention conflict, open a citation, filter the findings, open the evidence register, and export a report. Resize the viewport to check narrow layouts. Native dialog behavior, actual screen-reader announcements, and hosted-provider output need environment-specific checks; jsdom does not replace those.

No model quality or production performance benchmark is claimed here. The fixtures are small and intentional, so the suite tests behavior rather than pretending to measure real-world architecture judgment.
