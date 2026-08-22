import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { decodePip } from "../pip-editor/pip/index.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip/io-policy.ts";
import { readWorkspaceResourceIndex } from "../pip-editor/pip/workspace/resource-index.ts";

const root = path.resolve(import.meta.dirname, "..");

test("workspace split CLI creates a new intent.pip plus ordinary resources", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-split-cli-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, "workspace");
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/split-pip-workspace.mjs"),
    path.join(root, "tests/fixtures/a1_loader_1_0_0_20260726.pip"),
    output,
    "--allow-package-limits",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const intentBytes = new Uint8Array(await readFile(path.join(output, "intent.pip")));
  const intent = await decodePip(intentBytes, { policy: UNLIMITED_PIP_IO_POLICY });
  const index = readWorkspaceResourceIndex(intent);
  assert.ok(index);
  assert.deepEqual(index.resources.map((entry) => entry.path), ["config.json", "index.html"]);
  assert.equal((await stat(path.join(output, "resources/index.html"))).isFile(), true);

  const second = spawnSync(process.execPath, [
    path.join(root, "scripts/split-pip-workspace.mjs"),
    path.join(root, "tests/fixtures/a1_loader_1_0_0_20260726.pip"),
    output,
    "--allow-package-limits",
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(second.status, 0);
});
