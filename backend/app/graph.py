from collections import defaultdict
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.models import Citation, Design, Finding, Report, Snapshot


class ReviewState(TypedDict, total=False):
    design: Design
    snapshot: Snapshot
    findings: list[Finding]
    citations: list[Citation]
    checked_controls: int
    trace: list[str]
    report: Report


def review_controls(state: ReviewState):
    snapshot, design = state["snapshot"], state["design"]
    findings, citations, checked = [], [], 0
    for standard in snapshot.standards:
        citations.append(Citation(id=standard.id, source="standards.json", excerpt=standard.excerpt, revision=standard.revision))
    for component in design.components:
        applicable = defaultdict(list)
        for standard in snapshot.standards:
            if component.kind in standard.kinds or "*" in standard.kinds:
                applicable[standard.control].append(standard)
        if not applicable:
            findings.append(Finding(id=f"{component.id}:coverage", category="evidence_gap", severity="medium", component=component.id,
                title="No applicable standards", detail=f"No source standard covers kind '{component.kind}'.", action="Add an approved standard for this component type.", citations=[]))
        for control, standards in applicable.items():
            checked += 1
            expected = {s.expected for s in standards}
            actual = component.controls.get(control)
            refs = [s.id for s in standards]
            if len(expected) > 1:
                category, severity, title = "conflict", "high", f"Conflicting guidance: {control}"
                detail = "Sources disagree: " + "; ".join(f"{s.id} requires {s.expected}" for s in standards) + "."
                action = "Ask the standards owner to resolve the conflict; do not silently choose a source."
            elif not actual:
                category, severity, title = "evidence_gap", "medium", f"Missing evidence: {control}"
                detail = f"The design does not provide {control}; expected {standards[0].expected}."
                action = f"Provide a design assertion for {control} and supporting implementation evidence."
            elif actual.strip().casefold() != standards[0].expected.strip().casefold():
                category, severity, title = "violation", "high", f"Update {control}"
                detail = f"Design declares '{actual}'; the standard requires '{standards[0].expected}'."
                action = standards[0].recommendation
            else:
                continue
            findings.append(Finding(id=f"{component.id}:{control}", category=category, severity=severity, component=component.id,
                title=title, detail=detail, action=action, citations=refs))
    return {"findings": findings, "citations": citations, "checked_controls": checked, "trace": ["Retrieved source exports via MCP", "Compared declared controls with standards"]}


def review_dependencies(state: ReviewState):
    inventory = {i.id: i for i in state["snapshot"].inventory}
    design = {c.id: c for c in state["design"].components}
    findings, citations = list(state["findings"]), list(state["citations"])
    for index, item in enumerate(inventory.values()):
        citations.append(Citation(id=f"inventory:{item.id}", source=f"leanix.json#/applications/{index}",
            excerpt=item.model_dump_json(), revision=state["snapshot"].exported_at))
    for component in design.values():
        item = inventory.get(component.id)
        issues = []
        if not item:
            issues.append(("inventory", "Component absent from inventory", "Confirm the component ID or register it in the source inventory.", []))
        else:
            ref = [f"inventory:{item.id}"]
            if not item.owner:
                issues.append(("owner", "No inventory owner", "Assign an accountable application owner in the inventory.", ref))
            if item.lifecycle != "active":
                issues.append(("lifecycle", f"Inventory lifecycle is {item.lifecycle}", "Confirm a supported replacement or document an approved exception.", ref))
            for dep in sorted(set(item.dependencies) - set(component.dependencies)):
                issues.append((f"omitted:{dep}", f"Inventory dependency omitted: {dep}", "Add this dependency to the design or reconcile the export.", ref))
        for dep in sorted(set(component.dependencies)):
            if dep not in design:
                issues.append((f"missing:{dep}", f"Dependency missing from design: {dep}", "Include the dependency and its controls in the submitted design.", []))
            if dep not in inventory:
                issues.append((f"unknown:{dep}", f"Dependency absent from inventory: {dep}", "Verify this dependency against the application inventory.", []))
        for key, title, action, refs in issues:
            findings.append(Finding(id=f"{component.id}:{key}", category="dependency", severity="medium", component=component.id,
                title=title, detail=f"Dependency check for {component.name}.", action=action, citations=refs))
    return {"findings": findings, "citations": citations, "trace": state["trace"] + ["Reconciled design dependencies with inventory"]}


def finalize(state: ReviewState):
    findings = state["findings"]
    verdict = "changes_required" if any(f.category in {"conflict", "violation", "dependency"} for f in findings) else "needs_evidence" if findings else "checks_passed"
    summary = f"Checked {state['checked_controls']} control groups across {len(state['design'].components)} components. Found {len(findings)} items for review. Checks compare declared values only; implementation evidence still needs human verification."
    trace = state["trace"] + ["Assembled cited review"]
    return {"report": Report(title=state["design"].title, verdict=verdict, summary=summary, findings=findings,
        citations=state["citations"], checked_controls=state["checked_controls"], exported_at=state["snapshot"].exported_at, trace=trace)}


builder = StateGraph(ReviewState)
builder.add_node("controls", review_controls)
builder.add_node("dependencies", review_dependencies)
builder.add_node("report", finalize)
builder.add_edge(START, "controls")
builder.add_edge("controls", "dependencies")
builder.add_edge("dependencies", "report")
builder.add_edge("report", END)
review_graph = builder.compile()
