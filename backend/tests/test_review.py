import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.graph import review_graph
from app.mcp_server import load_snapshot
from app.models import Design

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def design():
    return Design.model_validate_json((ROOT / 'data/design.json').read_text())


async def test_conflicting_guidance_is_never_silently_resolved(design):
    report = (await review_graph.ainvoke({'design': design, 'snapshot': load_snapshot()}))['report']
    conflict = next(f for f in report.findings if f.category == 'conflict')
    assert conflict.citations == ['DATA-01', 'DATA-02']
    assert '30-days' in conflict.detail and '90-days' in conflict.detail
    assert report.verdict == 'changes_required'
    assert all(set(f.citations) <= {c.id for c in report.citations} for f in report.findings)


async def test_missing_evidence_is_not_inferred_from_prose(design):
    design.description = 'Everything is OIDC and OpenTelemetry, trust me.'
    report = (await review_graph.ainvoke({'design': design, 'snapshot': load_snapshot()}))['report']
    gap = next(f for f in report.findings if f.id == 'checkout-api:telemetry')
    assert gap.category == 'evidence_gap' and gap.citations == ['OPS-01']


async def test_dependency_reconciliation(design):
    report = (await review_graph.ainvoke({'design': design, 'snapshot': load_snapshot()}))['report']
    ids = {f.id for f in report.findings}
    assert {'checkout-api:omitted:identity-service', 'checkout-api:missing:event-gateway', 'checkout-api:unknown:event-gateway', 'orders-db:owner'} <= ids


async def test_empty_standards_never_means_approved(design):
    snapshot = load_snapshot().model_copy(update={'standards': []})
    report = (await review_graph.ainvoke({'design': design, 'snapshot': snapshot}))['report']
    assert len([f for f in report.findings if f.id.endswith(':coverage')]) == 2
    assert report.verdict != 'checks_passed'


async def test_clean_declarations_pass_loaded_checks():
    design = Design(title='Identity service', description='An identity service with all required controls declared.', components=[{'id':'identity-service','name':'Identity','kind':'service','controls':{'authentication':'oidc','telemetry':'opentelemetry'}}])
    report = (await review_graph.ainvoke({'design':design,'snapshot':load_snapshot()}))['report']
    assert report.verdict == 'checks_passed'
    assert report.checked_controls == 2 and report.findings == []


def test_duplicate_ids_are_rejected(design):
    data = design.model_dump()
    data['components'].append(data['components'][0])
    with pytest.raises(ValidationError):
        Design.model_validate(data)


def test_validation_and_unknown_job():
    with TestClient(main.app) as client:
        assert client.post('/api/reviews', json={'title':'x'}).status_code == 422
        assert client.get('/api/reviews/unknown').status_code == 404
        assert client.delete('/api/reviews/unknown').status_code == 404
        assert client.post('/api/reviews', content='x'*256001).status_code == 413


async def test_interrupted_request_can_be_cancelled(monkeypatch, design):
    started = asyncio.Event()
    stopped = asyncio.Event()
    async def slow_evidence():
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()
    monkeypatch.setattr(main, 'read_evidence', slow_evidence)
    async with main.lifespan(main.app):
        job = await main.create_review(design)
        await asyncio.wait_for(started.wait(), 2)
        result = await main.cancel_review(job.id)
        assert stopped.is_set()
        assert result.status == 'cancelled' and result.report is None
        assert job.id not in main.app.state.tasks
        assert (await main.cancel_review(job.id)).status == 'cancelled'


async def test_cancel_before_task_starts(design):
    async with main.lifespan(main.app):
        job = await main.create_review(design)
        assert (await main.cancel_review(job.id)).status == 'cancelled'


async def test_source_failure_is_explicit(monkeypatch, design):
    async def broken():
        raise OSError('private source path must not leak')
    monkeypatch.setattr(main, 'read_evidence', broken)
    async with main.lifespan(main.app):
        job = await main.create_review(design)
        await main.app.state.tasks[job.id]
        assert job.status == 'failed' and job.report is None
        assert 'private source path' not in job.error


async def test_real_mcp_roundtrip():
    from app.evidence import read_evidence
    snapshot = await read_evidence()
    assert len(snapshot.standards) == 5
    assert snapshot.inventory[0].id == 'checkout-api'


async def test_mcp_only_exposes_read_tools():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    import sys
    async with stdio_client(StdioServerParameters(command=sys.executable,args=['-m','app.mcp_server'])) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            assert {t.name for t in tools} == {'read_standards','read_inventory'}
            assert all(t.annotations.readOnlyHint and not t.annotations.destructiveHint for t in tools)
            assert (await session.call_tool('delete_application',{})).isError


async def test_completed_job_is_not_cancelled(monkeypatch, design):
    async def evidence():
        return load_snapshot()
    monkeypatch.setattr(main, 'read_evidence', evidence)
    async with main.lifespan(main.app):
        job = await main.create_review(design)
        await main.app.state.tasks[job.id]
        assert (await main.cancel_review(job.id)).status == 'completed'
        assert job.report is not None


async def test_optional_model_failure_preserves_review(monkeypatch, design):
    async def evidence():
        return load_snapshot()
    async def broken_model(report):
        raise ValueError('unsupported citation')
    monkeypatch.setattr(main, 'read_evidence', evidence)
    monkeypatch.setattr(main, 'synthesize', broken_model)
    async with main.lifespan(main.app):
        job = await main.create_review(design)
        await main.app.state.tasks[job.id]
        assert job.status == 'completed'
        assert job.report.synthesis is None
        assert 'unavailable' in job.report.trace[-1]


def test_end_to_end_api_review(design):
    import time
    with TestClient(main.app) as client:
        response = client.post('/api/reviews', json=design.model_dump())
        assert response.status_code == 202
        job_id = response.json()['id']
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            body = client.get(f'/api/reviews/{job_id}').json()
            if body['status'] in {'completed','failed'}:
                break
            time.sleep(.02)
        assert body['status'] == 'completed', body
        assert body['report']['verdict'] == 'changes_required'
        assert len(body['report']['findings']) == 7
        assert client.get('/').status_code == 200
