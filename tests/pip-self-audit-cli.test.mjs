import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const run = () => spawnSync(
  process.execPath,
  [path.join(root, "scripts/audit-system-sources.mjs")],
  { cwd: root, encoding: "utf8" },
);

test("self audit emits a deterministic clean source receipt for a0 through a3", () => {
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.clean, true);
  assert.deepEqual(report.packages.map(({ layer }) => layer), ["a0", "a1", "a2", "a3"]);
  for (const item of report.packages) {
    assert.equal(item.clean, true, item.packageId);
    assert.match(item.pipSha256, /^[a-f0-9]{64}$/);
    assert.match(item.sourceTreeSha256, /^[a-f0-9]{64}$/);
    assert.ok(item.sourceFileCount > 0);
    assert.deepEqual(item.differences, {
      missingFromPip: [],
      missingFromWorkspace: [],
      changed: [],
    });
  }
});
