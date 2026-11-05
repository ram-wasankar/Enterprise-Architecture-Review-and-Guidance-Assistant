import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Run the API and Vite together, with shutdown propagated to both children.
const localPython = resolve(
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const python =
  process.env.REVIEW_PYTHON ||
  (existsSync(localPython) ? localPython : "python3");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    { stdio: "inherit" },
  ),
  spawn(
    npm,
    [
      "--prefix",
      "frontend",
      "run",
      "dev",
      "--",
      "--port",
      process.env.PORT || "3000",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
