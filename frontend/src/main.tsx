import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileCode2,
  GitBranch,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { api } from "./api";
import type { Citation, Design, Job, Report } from "./types";
import "./style.css";

const labels = {
  violation: "Control issues",
  conflict: "Conflicting guidance",
  evidence_gap: "Missing evidence",
  dependency: "Dependencies",
};
const initial: Design = {
  title: "Untitled architecture",
  description: "",
  components: [],
};
export function App() {
  const [design, setDesign] = useState<Design>(initial);
  const [componentText, setComponentText] = useState("[]");
  const [job, setJob] = useState<Job | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"review" | "sources">("review");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);

  const resultRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const runRef = useRef(0);
  const active = !!job && ["queued", "running"].includes(job.status);

  async function loadExample() {
    setError("");
    try {
      const data = await api<Design>("/api/example");
      setDesign(data);
      setComponentText(JSON.stringify(data.components, null, 2));
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void loadExample();
  }, []);
  useEffect(() => {
    if (!active || connectionLost || !job) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await api<Job>(`/api/reviews/${job.id}`, {
          signal: controller.signal,
        });
        setJob(next);
        if (next.status === "completed" && next.report) {
          setReport(next.report);
          setTimeout(() => resultRef.current?.focus(), 0);
        }
        if (next.status === "failed")
          setError(next.error || "Review failed. Try again.");
      } catch (e) {
        if (!controller.signal.aborted) {
          setConnectionLost(true);
          setError(
            `Connection interrupted. ${message(e)} Your review may still be running.`,
          );
        }
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job, active, connectionLost]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        document.getElementById("submit-review")?.click();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (citation) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [citation]);
  function message(e: unknown) {
    return e instanceof Error ? e.message : "Something went wrong.";
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (active || busy) return;
    setError("");
    setConnectionLost(false);
    setBusy(true);
    setReport(null);
    setFilter("all");
    const run = ++runRef.current;
    try {
      const components = JSON.parse(componentText);
      if (!Array.isArray(components) || !components.length)
        throw new Error("Add at least one component to the JSON array.");
      const next = await api<Job>("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ ...design, components }),
      });
      if (run === runRef.current) setJob(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job) return;
    setBusy(true);
    try {
      const next = await api<Job>(`/api/reviews/${job.id}`, {
        method: "DELETE",
      });
      setJob(next);
      setConnectionLost(false);
      setError("");
    } catch (e) {
      setError(`Could not confirm cancellation. ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "architecture-review.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const counts = (category: string) =>
    report?.findings.filter((f) => f.category === category).length || 0;
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Architecture Review home">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <span>
            Architecture<span className="brand-light">Review workspace</span>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          <button
            className={view === "review" ? "nav-item selected" : "nav-item"}
            onClick={() => setView("review")}
          >
            <FileCode2 size={18} />
            Design review
            <ChevronRight size={15} />
          </button>
          <button
            className={view === "sources" ? "nav-item selected" : "nav-item"}
            onClick={() => setView("sources")}
          >
            <BookOpen size={18} />
            Evidence sources
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> Read-only connections
          <p>Your standards and inventory stay in your control.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">EA</div>
          <div>
            Architecture workspace<small>Local demo · v0.1</small>
          </div>
        </div>
      </aside>
      <div className="body">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} />{" "}
            {view === "review" ? "Design review" : "Evidence sources"}
          </span>
          <span className="demo-pill">
            <span className="live-dot" /> Sample environment
          </span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ENTERPRISE ARCHITECTURE</div>
              <h1>
                {view === "review"
                  ? "Better designs start with a review."
                  : "Every recommendation has a source."}
              </h1>
              <p>
                {view === "review"
                  ? "Bring your design, check the evidence, and close the gaps."
                  : "Inspect the standards and application records behind your review."}
              </p>
            </div>
            <span className="heading-icon">
              <ShieldCheck size={30} />
            </span>
          </div>
          {error && (
            <div role="alert" className="error">
              <strong>Something needs your attention</strong>
              <p>{error}</p>
              {connectionLost && (
                <button
                  onClick={() => {
                    setConnectionLost(false);
                    setError("");
                    setJob((j) => (j ? { ...j } : j));
                  }}
                >
                  Reconnect to review
                </button>
              )}
            </div>
          )}
          {view === "review" ? (
            <>
              <div className="workflow">
                <span className="workflow-current">
                  <span>1</span>Describe design
                </span>
                <i />
                <span className={active || report ? "workflow-current" : ""}>
                  <span>2</span>Check evidence
                </span>
                <i />
                <span className={report ? "workflow-current" : ""}>
                  <span>3</span>Review findings
                </span>
              </div>
              <div className="review-grid">
                <section
                  className="panel design-panel"
                  aria-labelledby="design-heading"
                >
                  <div className="panel-title">
                    <div>
                      <span className="tiny-label">01 / INPUT</span>
                      <h2 id="design-heading">Your architecture</h2>
                    </div>
                    <button
                      className="text-button"
                      disabled={active || busy}
                      onClick={loadExample}
                    >
                      <RotateCcw size={14} />
                      Load example
                    </button>
                  </div>
                  <form onSubmit={submit}>
                    <label htmlFor="design-title">Design name</label>
                    <input
                      id="design-title"
                      value={design.title}
                      maxLength={150}
                      minLength={3}
                      required
                      disabled={active}
                      onChange={(e) =>
                        setDesign({ ...design, title: e.target.value })
                      }
                    />
                    <label htmlFor="design-description">
                      Design overview <span>Context for the reviewer</span>
                    </label>
                    <textarea
                      id="design-description"
                      className="description"
                      placeholder="Describe the system, decisions, and constraints…"
                      value={design.description}
                      required
                      minLength={10}
                      maxLength={15000}
                      disabled={active}
                      onChange={(e) =>
                        setDesign({ ...design, description: e.target.value })
                      }
                    />
                    <div className="code-heading">
                      <label htmlFor="components">Components & controls</label>
                      <span className="format-tag">JSON</span>
                    </div>
                    <p className="field-hint" id="component-help">
                      Declare IDs, dependencies, and control values. Omitted
                      controls are flagged as missing evidence.
                    </p>
                    <textarea
                      id="components"
                      className="code-editor"
                      aria-describedby="component-help"
                      spellCheck={false}
                      value={componentText}
                      disabled={active}
                      onChange={(e) => setComponentText(e.target.value)}
                    />
                    <details className="schema-help">
                      <summary>Component format</summary>
                      <pre>
                        {
                          '{ "id": "api", "name": "API", "kind": "service",\n  "dependencies": [],\n  "controls": { "authentication": "oidc" } }'
                        }
                      </pre>
                      <p>
                        Supported sample kinds: service and database. The
                        overview is context; checks use structured control
                        declarations.
                      </p>
                    </details>
                    <div className="form-footer">
                      <span>
                        <ShieldCheck size={14} />
                        Read-only source access
                      </span>
                      <button
                        className="primary"
                        id="submit-review"
                        disabled={active || busy}
                      >
                        {busy ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Play size={14} />
                        )}
                        Run review <kbd>⌘ ↵</kbd>
                      </button>
                    </div>
                  </form>
                </section>
                <div className="right-column">
                  <section className="panel source-panel">
                    <div className="panel-title">
                      <div>
                        <span className="tiny-label">02 / CONTEXT</span>
                        <h2>Connected evidence</h2>
                      </div>
                      <span className="count-pill">2 sources</span>
                    </div>
                    <div className="source-row">
                      <div className="source-icon">
                        <BookOpen size={19} />
                      </div>
                      <div>
                        <strong>Architecture standards</strong>
                        <small>Control requirements & guidance</small>
                      </div>
                      <CheckCircle2 size={17} className="green" />
                    </div>
                    <div className="source-row">
                      <div className="source-icon violet">
                        <GitBranch size={19} />
                      </div>
                      <div>
                        <strong>LeanIX export</strong>
                        <small>Applications & dependencies</small>
                      </div>
                      <CheckCircle2 size={17} className="green" />
                    </div>
                    <div className="source-footer">
                      Sample exports · retrieved over MCP per review
                    </div>
                  </section>
                  <section className="insight-card">
                    <div className="insight-icon">
                      <Layers3 size={22} />
                    </div>
                    <h3>The details make the difference.</h3>
                    <p>
                      A design can look complete and still miss a dependency. We
                      check the connections, the controls, and the evidence
                      behind them.
                    </p>
                    <div>
                      <Check size={14} />
                      Cited recommendations
                    </div>
                    <div>
                      <Check size={14} />
                      Conflicts made visible
                    </div>
                    <div>
                      <Check size={14} />
                      Missing evidence called out
                    </div>
                  </section>
                  <div className="small-note">
                    <CircleDashed size={18} />
                    <p>
                      Built for the review conversation. Final architecture
                      decisions stay with your team.
                    </p>
                  </div>
                </div>
              </div>
              {(active || job?.status === "cancelled") && (
                <div className="status-bar" role="status">
                  {active ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <Square size={17} />
                  )}
                  <div>
                    <strong>{job?.stage}</strong>
                    <small>
                      {active
                        ? "Reading evidence and checking your design."
                        : "No partial report was published. You can run a fresh review."}
                    </small>
                  </div>
                  {active && (
                    <button onClick={cancel} disabled={busy}>
                      Cancel review
                    </button>
                  )}
                </div>
              )}
              {report && (
                <section className="results" aria-labelledby="results-heading">
                  <div className="results-heading">
                    <div>
                      <span className="tiny-label">03 / REVIEW</span>
                      <h2 id="results-heading" tabIndex={-1} ref={resultRef}>
                        The review is in.
                      </h2>
                    </div>
                    <button className="secondary" onClick={download}>
                      <ArrowDownToLine size={15} />
                      Export report
                    </button>
                  </div>
                  <div
                    className={
                      "verdict " +
                      (report.verdict === "checks_passed" ? "passed" : "")
                    }
                  >
                    <ShieldCheck size={24} />
                    <div>
                      <strong>
                        {report.verdict === "checks_passed"
                          ? "Declared controls pass the loaded checks"
                          : report.verdict === "needs_evidence"
                            ? "More evidence needed"
                            : "A few things need a closer look"}
                      </strong>
                      <p>{report.summary}</p>
                    </div>
                  </div>
                  {report.synthesis && (
                    <div className="model-summary">
                      <strong>Optional model explanation</strong>
                      <p>{report.synthesis}</p>
                    </div>
                  )}
                  <div className="stat-grid">
                    {Object.entries(labels).map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={filter === key}
                        className={"stat " + (filter === key ? "chosen" : "")}
                        onClick={() => setFilter(filter === key ? "all" : key)}
                      >
                        <strong>
                          {counts(key).toString().padStart(2, "0")}
                        </strong>
                        <span>
                          {label}
                          <ArrowRight size={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="findings-header">
                    <h3>
                      {filter === "all"
                        ? "All findings"
                        : labels[filter as keyof typeof labels]}
                    </h3>
                    {filter !== "all" && (
                      <button
                        className="text-button"
                        onClick={() => setFilter("all")}
                      >
                        Show all
                      </button>
                    )}
                    <span>
                      {
                        report.findings.filter(
                          (f) => filter === "all" || f.category === filter,
                        ).length
                      }{" "}
                      items
                    </span>
                  </div>
                  <div className="findings">
                    {report.findings
                      .filter((f) => filter === "all" || f.category === filter)
                      .map((f) => (
                        <article className="finding" key={f.id}>
                          <div className={"finding-dot " + f.category} />
                          <div className="finding-body">
                            <div className="finding-meta">
                              <span className={"badge " + f.category}>
                                {labels[f.category]}
                              </span>
                              <code>{f.component}</code>
                              <span>{f.severity} priority</span>
                            </div>
                            <h3>{f.title}</h3>
                            <p>{f.detail}</p>
                            <div className="action">
                              <ArrowRight size={14} />
                              {f.action}
                            </div>
                            <div className="citation-links">
                              {f.citations.length ? (
                                f.citations.map((id) => (
                                  <button
                                    key={id}
                                    onClick={() =>
                                      setCitation(
                                        report.citations.find(
                                          (c) => c.id === id,
                                        ) || null,
                                      )
                                    }
                                  >
                                    <BookOpen size={12} />
                                    {id}
                                  </button>
                                ))
                              ) : (
                                <span>
                                  Source: submitted design / absence in loaded
                                  inventory
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    {report.findings.filter(
                      (f) => filter === "all" || f.category === filter,
                    ).length === 0 && (
                      <div className="empty-results">
                        <CheckCircle2 size={26} />
                        <h3>No findings in this view.</h3>
                        <p>
                          Checks cover the loaded standards and declared control
                          values.
                        </p>
                      </div>
                    )}
                  </div>
                  <details className="trace">
                    <summary>Review trace & source timestamp</summary>
                    <ol>
                      {report.trace.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                    <p>Inventory exported: {report.exported_at}</p>
                  </details>
                </section>
              )}
            </>
          ) : (
            <section className="panel evidence-view">
              <div className="panel-title">
                <h2>Evidence register</h2>
                <span className="count-pill">Read only</span>
              </div>
              {report ? (
                <>
                  {report.citations.map((c) => (
                    <button
                      className="evidence-record"
                      key={c.id}
                      onClick={() => setCitation(c)}
                    >
                      <BookOpen size={18} />
                      <div>
                        <strong>{c.id}</strong>
                        <p>{c.excerpt}</p>
                        <small>
                          {c.source} · {c.revision}
                        </small>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </>
              ) : (
                <div className="empty-results">
                  <BookOpen size={30} />
                  <h3>Evidence appears after a review.</h3>
                  <p>
                    Run a design review to retrieve the current source snapshot.
                  </p>
                  <button className="primary" onClick={() => setView("review")}>
                    <Plus size={15} />
                    Start a review
                  </button>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>Architecture Review</span>
            <span>Evidence first. Better decisions follow.</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        onCancel={() => setCitation(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCitation(null);
        }}
        aria-labelledby="citation-title"
      >
        <div className="dialog-top">
          <span className="tiny-label">SOURCE EVIDENCE</span>
          <button aria-label="Close source" onClick={() => setCitation(null)}>
            <X size={20} />
          </button>
        </div>
        <h2 id="citation-title">{citation?.id}</h2>
        <p className="citation-excerpt">{citation?.excerpt}</p>
        <dl>
          <dt>Source</dt>
          <dd>{citation?.source}</dd>
          <dt>Revision / export</dt>
          <dd>{citation?.revision}</dd>
        </dl>
        <p className="field-hint">
          This excerpt comes from the loaded export. Sample files contain
          fictional standards and applications.
        </p>
      </dialog>
    </div>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
