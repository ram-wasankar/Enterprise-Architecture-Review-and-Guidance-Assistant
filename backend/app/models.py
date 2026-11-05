from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Component(StrictModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    kind: str = Field(min_length=1, max_length=50)
    dependencies: list[str] = Field(default_factory=list, max_length=100)
    controls: dict[str, str] = Field(default_factory=dict, max_length=50)


class Design(StrictModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=10, max_length=15000)
    components: list[Component] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [c.id for c in self.components]
        if len(ids) != len(set(ids)):
            raise ValueError("Component IDs must be unique")
        return self


class Standard(StrictModel):
    id: str
    title: str
    kinds: list[str]
    control: str
    expected: str
    recommendation: str
    excerpt: str
    revision: str


class InventoryItem(StrictModel):
    id: str
    name: str
    owner: str | None
    lifecycle: Literal["active", "phase-out", "retired"]
    dependencies: list[str]


class Snapshot(StrictModel):
    standards: list[Standard]
    inventory: list[InventoryItem]
    exported_at: str

    @model_validator(mode="after")
    def unique_ids(self):
        for items in (self.standards, self.inventory):
            ids = [x.id for x in items]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate source IDs")
        return self


class Citation(StrictModel):
    id: str
    source: str
    excerpt: str
    revision: str


class Finding(StrictModel):
    id: str
    category: Literal["violation", "conflict", "evidence_gap", "dependency"]
    severity: Literal["high", "medium", "low"]
    component: str
    title: str
    detail: str
    action: str
    citations: list[str]


class Report(StrictModel):
    title: str
    verdict: Literal["changes_required", "needs_evidence", "checks_passed"]
    summary: str
    findings: list[Finding]
    citations: list[Citation]
    checked_controls: int
    exported_at: str
    trace: list[str]
    synthesis: str | None = None


class Job(StrictModel):
    id: str
    status: Literal["queued", "running", "completed", "cancelled", "failed"]
    stage: str
    report: Report | None = None
    error: str | None = None
