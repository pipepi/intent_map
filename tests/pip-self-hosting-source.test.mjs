import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  mergeSourceAsset,
  relativeSourcePath,
} from "../scripts/pip-self-hosting-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts/extract-system-sources.mjs");
const run = (destination) => spawnSync(process.execPath, [script, destination], {
  cwd: root,
  encoding: "utf8",
});

test("self-hosting source extraction reconstructs a0 through a2 without overwriting", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-self-source-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  assert.equal(run(first).status, 0);
  assert.equal(run(second).status, 0);
  const receiptPath = path.join(".pip", "self-hosting-source-receipt.json");
  const firstReceipt = await readFile(path.join(first, receiptPath), "utf8");
  const secondReceipt = await readFile(path.join(second, receiptPath), "utf8");
  assert.equal(secondReceipt, firstReceipt);
  const receipt = JSON.parse(firstReceipt);
  assert.equal(receipt.kind, "pip-self-hosting-source/1");
  assert.deepEqual(receipt.packages.map(({ layer }) => layer), ["a0", "a1", "a2"]);
  assert.ok(receipt.sourceFileCount > 0);
  assert.match(receipt.reconstructedSourceTreeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    await readFile(path.join(first, "package.json")),
    await readFile(path.join(root, "package.json")),
  );
  const rejected = run(first);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Source destination already exists/);
});

test("self-hosting source merge rejects unsafe paths and conflicting providers", () => {
  for (const unsafe of ["source/", "source/../escape", "source/a//b", "source/a\\b"]) {
    assert.throws(() => relativeSourcePath(unsafe), /Unsafe source asset path/);
  }
  assert.equal(relativeSourcePath("asset/app.js"), null);
  const merged = new Map();
  mergeSourceAsset(merged, { path: "source/app/a.ts", bytes: Buffer.from("same") }, "a2");
  mergeSourceAsset(merged, { path: "source/app/a.ts", bytes: Buffer.from("same") }, "a3");
  assert.deepEqual(merged.get("app/a.ts").packageIds, ["a2", "a3"]);
  assert.throws(
    () => mergeSourceAsset(
      merged,
      { path: "source/app/a.ts", bytes: Buffer.from("different") },
      "a1",
    ),
    /Conflicting source asset/,
  );
});
