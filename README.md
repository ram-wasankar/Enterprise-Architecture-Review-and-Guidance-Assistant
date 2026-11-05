# Enterprise Architecture Review and Guidance Assistant

Architecture reviews get messy when the design is in one place, standards are in another, and someone has to remember which applications depend on what. This project puts that conversation in one workspace.

Submit a design, run a review, and follow each finding back to its evidence. Conflicting standards stay visible. Missing controls get called out. If the inventory says a dependency exists but the design leaves it out, that shows up too. No hand-waving.

React + TypeScript on the front, FastAPI on the back, and a LangGraph workflow in between. Standards and normalized LeanIX exports are read through actual MCP tools over stdio. The tools expose reads only.

[Setup](#run-it) · [Architecture](docs/ARCHITECTURE.md) · [Source format](docs/SOURCES.md) · [Acceptance checks](docs/ACCEPTANCE.md)

## What works

- Design submission with a short overview and structured components, dependencies, and controls.
- Cited recommendations, source excerpts, revisions, and an evidence register.
- Explicit handling of contradictory guidance and missing evidence.
- Inventory reconciliation for omitted dependencies, unknown applications, missing owners, and retiring systems.
- Background review jobs with status polling, cancellation, reconnection, and JSON report export.
- Keyboard navigation, a skip link, focus management, accessible source dialogs, and Ctrl/Cmd + Enter to run a review.
- Optional model-written explanation through a chat-completions-compatible endpoint. Computed findings remain the authority.

## Run it

Requires Python 3.11+ and Node 22+.

```bash
git clone https://github.com/ram-wasankar/Enterprise-Architecture-Review-and-Guidance-Assistant.git
cd Enterprise-Architecture-Review-and-Guidance-Assistant
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
pip install --no-deps -e .
npm --prefix frontend ci
npm --prefix frontend run build
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://localhost:8000. FastAPI serves the built React app and the API together. API docs live at `/docs`.

For development, `npm run dev` starts the API and Vite together on ports 8000 and 3000. It uses `.venv` when present, or `REVIEW_PYTHON` if set. You can also run `uvicorn app.main:app --reload` and `npm --prefix frontend run dev` separately. Vite proxies `/api` to port 8000.

Docker works too:

```bash
docker build -t architecture-review .
docker run --rm -p 127.0.0.1:8000:8000 architecture-review
```

The example is deliberately imperfect: an API-key authentication choice, absent telemetry evidence, two conflicting retention rules, an ownerless database, and an event gateway missing from the inventory. Hit **Run review** and inspect the source chips. That's the quickest tour.

## Bring your own evidence

`data/standards.json` and `data/leanix.json` are fictional fixtures. The LeanIX file uses a small normalized application schema, not a claim to support every native export format. Map your export to that schema first; [the source guide](docs/SOURCES.md) shows exactly what it accepts.

Set `REVIEW_DATA_DIR` to an absolute directory containing those two files. Restart after changing source files, and keep them stable while reviews run. This reads exported data; it does not log into LeanIX or modify your workspace.

The default review runs without a model key. To add an explanation, set these environment variables before starting the API:

```bash
export REVIEW_MODEL_URL=https://your-provider.example/v1/chat/completions
export REVIEW_MODEL=your-model
export REVIEW_MODEL_KEY=your-key
```

That optional step sends the report, source excerpts, and component identifiers to your configured endpoint. Use an endpoint approved for your data. Unknown citation IDs are rejected; checking an ID exists does not establish that the model's prose is correct. If the model fails, the computed report still comes back.

## Check it

```bash
pytest -q
npm --prefix frontend test
npm --prefix frontend run build
```

The suite includes a real MCP subprocess round trip and verifies that only the two read tools are exposed. Acceptance tests cover conflicting guidance, missing evidence, interrupted connections, cancellation, keyboard submission, and opening citations.

## A few boundaries

This is a runnable local review tool. Control checks compare declared values against loaded requirements; the overview is context, not a parser for architecture diagrams. Passing those checks is not proof that an implementation is compliant. A human still needs to inspect the implementation evidence.

Jobs live in memory, are capped at 200 records, and disappear on restart. Use one API worker. There is no authentication or tenant isolation yet, so keep it on localhost or behind your own authenticated gateway. A shared deployment needs durable jobs, access control, source versioning, and organization-specific standards before it goes near real reviews.

The useful part is making gaps easy to see and easy to discuss. Fancy prose can wait.
