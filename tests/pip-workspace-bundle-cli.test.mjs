import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { unpackWorkspaceBundle } from "../a3/bundle/workspace-bundle.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";

const root = path.resolve(import.meta.dirname, "..");
const run = (script, args) => spawnSync(
  process.execPath,
  [path.join(root, "scripts", script), ...args, "--allow-package-limits"],
  { cwd: root, encoding: "utf8" },
);

test("workspace Bundle CLI emits a versioned reversible PIP without overwriting", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-bundle-cli-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const workspace = path.join(temporary, "workspace");
  const fixture = path.join(root, "tests/fixtures/a1_loader_1_0_0_20260726.pip");
  const split = run("split-pip-workspace.mjs", [fixture, workspace]);
  assert.equal(split.status, 0, split.stderr);

  const output = path.join(temporary, "a1_loader_1_0_0_20260726.pip");
  const bundled = run("bundle-pip-workspace.mjs", [workspace, output]);
  assert.equal(bundled.status, 0, bundled.stderr);
  const unpacked = await unpackWorkspaceBundle(
    new Uint8Array(await readFile(output)),
    { policy: UNLIMITED_PIP_IO_POLICY },
  );
  assert.deepEqual(unpacked.resources.map((resource) => resource.path), ["config.json", "index.html"]);

  const overwrite = run("bundle-pip-workspace.mjs", [workspace, output]);
  assert.notEqual(overwrite.status, 0);
  const wrongName = run("bundle-pip-workspace.mjs", [workspace, path.join(temporary, "wrong.pip")]);
  assert.notEqual(wrongName.status, 0);
});
