import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main";

const design = {
  title: "Checkout review",
  description: "The commerce checkout design.",
  components: [
    { id: "api", name: "API", kind: "service", dependencies: [], controls: {} },
  ],
};
const report = {
  title: "Checkout review",
  verdict: "changes_required",
  summary: "One conflict found.",
  findings: [
    {
      id: "one",
      category: "conflict",
      severity: "high",
      component: "api",
      title: "Conflicting retention",
      detail: "30 and 90 days.",
      action: "Ask the owner.",
      citations: ["DATA-01", "DATA-02"],
    },
  ],
  citations: [
    {
      id: "DATA-01",
      source: "standards.json",
      excerpt: "Retain 30 days.",
      revision: "v1",
    },
    {
      id: "DATA-02",
      source: "standards.json",
      excerpt: "Retain 90 days.",
      revision: "v2",
    },
  ],
  checked_controls: 1,
  exported_at: "2026-11-04",
  trace: ["Reviewed"],
  synthesis: null,
};
let fetcher: ReturnType<typeof vi.fn>;
function reply(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  });
}
beforeEach(() => {
  fetcher = vi.fn().mockImplementation(() => reply(design));
  vi.stubGlobal("fetch", fetcher);
});
async function ready() {
  render(<App />);
  await screen.findByDisplayValue("Checkout review");
}

describe("review acceptance", () => {
  it("submits with keyboard shortcut and opens cited evidence", async () => {
    await ready();
    fetcher.mockImplementation((path: string) =>
      path === "/api/reviews"
        ? reply({ id: "job", status: "running", stage: "Checking evidence" })
        : reply({ id: "job", status: "completed", stage: "Done", report }),
    );
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await screen.findByText("Conflicting retention");
    await userEvent.click(screen.getByRole("button", { name: "DATA-01" }));
    expect(screen.getByText("Retain 30 days.")).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "Close source" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows missing evidence as a finding", async () => {
    await ready();
    const missing = {
      ...report,
      findings: [
        {
          ...report.findings[0],
          category: "evidence_gap",
          title: "Missing evidence: telemetry",
          citations: [],
        },
      ],
    };
    fetcher.mockImplementation((path: string) =>
      reply(
        path === "/api/reviews"
          ? { id: "job", status: "running", stage: "Checking" }
          : { id: "job", status: "completed", stage: "Done", report: missing },
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /Run review/ }));
    expect(
      await screen.findByText("Missing evidence: telemetry"),
    ).toBeVisible();
  });
  it("shows an interrupted connection and reconnects to the same job", async () => {
    await ready();
    let polls = 0;
    fetcher.mockImplementation((path: string) =>
      path === "/api/reviews"
        ? reply({ id: "same-job", status: "running", stage: "Checking" })
        : ++polls === 1
          ? Promise.reject(new Error("Network offline"))
          : reply({
              id: "same-job",
              status: "completed",
              stage: "Done",
              report,
            }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection interrupted",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reconnect to review" }),
    );
    await screen.findByText("Conflicting retention");
    expect(
      fetcher.mock.calls.filter((c) => c[0] === "/api/reviews"),
    ).toHaveLength(1);
  });
  it("cancels an active review without publishing partial results", async () => {
    await ready();
    fetcher.mockImplementation((_path: string, init: RequestInit) =>
      reply(
        init.method === "DELETE"
          ? { id: "job", status: "cancelled", stage: "Review cancelled" }
          : { id: "job", status: "running", stage: "Reading sources" },
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /Run review/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel review" }),
    );
    expect(await screen.findByText("Review cancelled")).toBeVisible();
    expect(screen.queryByText("The review is in.")).not.toBeInTheDocument();
  });
  it("rejects malformed component JSON before sending it", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Components & controls"), {
      target: { value: "{broken" },
    });
    await userEvent.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(fetcher.mock.calls.some((c) => c[0] === "/api/reviews")).toBe(false);
  });
  it("supports tabbing to the name field", async () => {
    await ready();
    screen.getByRole("button", { name: "Load example" }).focus();
    await userEvent.tab();
    expect(screen.getByLabelText("Design name")).toHaveFocus();
  });
});
