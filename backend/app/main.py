import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.evidence import read_evidence
from app.graph import review_graph
from app.models import Design, Job
from app.synthesis import synthesize

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
MAX_JOBS = 200


@asynccontextmanager
async def lifespan(app):
    app.state.jobs = {}
    app.state.tasks = {}
    app.state.slots = asyncio.Semaphore(4)
    yield
    tasks = list(app.state.tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="Architecture Review API", lifespan=lifespan)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    if request.method == "POST":
        # Enforce a streaming limit too: Content-Length can be missing or forged.
        total, chunks = 0, []
        async for chunk in request.stream():
            total += len(chunk)
            if total > 256_000:
                return JSONResponse({"detail": "Design exceeds 256 KB"}, status_code=413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "single-process", "evidence": "read-only MCP exports"}


@app.get("/api/example")
def example():
    return json.loads((ROOT / "data" / "design.json").read_text())


async def execute(job_id: str, design: Design):
    job = app.state.jobs[job_id]
    try:
        async with app.state.slots:
            job.status, job.stage = "running", "Reading standards and inventory"
            async with asyncio.timeout(60):
                snapshot = await read_evidence()
                job.stage = "Reviewing controls and dependencies"
                state = await review_graph.ainvoke({"design": design, "snapshot": snapshot})
                report = state["report"]
                job.stage = "Preparing report"
                try:
                    report.synthesis = await synthesize(report)
                except Exception:
                    log.warning("Optional synthesis unavailable", exc_info=True)
                    report.trace.append("Optional model explanation unavailable; computed review retained")
                # Cancellation always lands before publication of the report.
                await asyncio.sleep(0)
                job.report, job.status, job.stage = report, "completed", "Review complete"
    except asyncio.CancelledError:
        job.status, job.stage, job.report = "cancelled", "Review cancelled", None
        raise
    except Exception:
        log.exception("Review %s failed", job_id)
        job.status, job.stage, job.error = "failed", "Review stopped", "Evidence could not be loaded or the review timed out. Check source exports and retry."
    finally:
        app.state.tasks.pop(job_id, None)


@app.post("/api/reviews", response_model=Job, status_code=202)
async def create_review(design: Design):
    if sum(j.status in {"queued", "running"} for j in app.state.jobs.values()) >= 12:
        raise HTTPException(429, "Review queue is full. Try again shortly.")
    while len(app.state.jobs) >= MAX_JOBS:
        oldest = next((key for key, j in app.state.jobs.items() if j.status not in {"queued", "running"}), None)
        if oldest is None:
            raise HTTPException(429, "Review queue is full")
        del app.state.jobs[oldest]
    job = Job(id=uuid4().hex, status="queued", stage="Waiting to start")
    app.state.jobs[job.id] = job
    app.state.tasks[job.id] = asyncio.create_task(execute(job.id, design))
    return job


@app.get("/api/reviews/{job_id}", response_model=Job)
def get_review(job_id: str):
    if job_id not in app.state.jobs:
        raise HTTPException(404, "Review not found; it may have expired after a restart.")
    return app.state.jobs[job_id]


@app.delete("/api/reviews/{job_id}", response_model=Job)
async def cancel_review(job_id: str):
    job = get_review(job_id)
    if task := app.state.tasks.get(job_id):
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        # A task cancelled before its first instruction never reaches its handler.
        job.status, job.stage, job.report = "cancelled", "Review cancelled", None
        app.state.tasks.pop(job_id, None)
    return job


if (ROOT / "frontend/dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "frontend/dist", html=True), name="frontend")
