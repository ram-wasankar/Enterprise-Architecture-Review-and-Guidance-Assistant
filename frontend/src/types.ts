export type Component = {
  id: string;
  name: string;
  kind: string;
  dependencies: string[];
  controls: Record<string, string>;
};
export type Design = {
  title: string;
  description: string;
  components: Component[];
};
export type Citation = {
  id: string;
  source: string;
  excerpt: string;
  revision: string;
};
export type Finding = {
  id: string;
  category: "violation" | "conflict" | "evidence_gap" | "dependency";
  severity: string;
  component: string;
  title: string;
  detail: string;
  action: string;
  citations: string[];
};
export type Report = {
  title: string;
  verdict: string;
  summary: string;
  findings: Finding[];
  citations: Citation[];
  checked_controls: number;
  exported_at: string;
  trace: string[];
  synthesis: string | null;
};
export type Job = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  report: Report | null;
  error: string | null;
};
