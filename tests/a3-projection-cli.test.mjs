import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const run = (script, args) => spawnSync(
  process.execPath,
  [path.join(root, "scripts", script), ...args, "--allow-package-limits"],
  { cwd: root, encoding: "utf8" },
);

test("projection audit CLI reports an empty projection workspace without mutation", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-projection-audit-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const workspace = path.join(temporary, "workspace");
  const fixture = path.join(
    root,
    "packages/system/a0/pip-seed/a0_pip_seed_1_0_0_20260806.pip",
  );
  const split = run("split-pip-workspace.mjs", [fixture, workspace]);
  assert.equal(split.status, 0, split.stderr);

  const audit = run("audit-pip-projections.mjs", [workspace]);
  assert.equal(audit.status, 0, audit.stderr);
  const report = JSON.parse(audit.stdout);
  assert.equal(report.workspace, workspace);
  assert.deepEqual(report.projections, []);
  assert.deepEqual(report.diagnostics, []);
});
