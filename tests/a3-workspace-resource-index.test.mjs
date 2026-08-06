import assert from "node:assert/strict";
import test from "node:test";

import {
  PIP_WORKSPACE_INDEX_PATH,
  assertWorkspaceResourceIndex,
  createWorkspaceResourceIndex,
  readWorkspaceResourceIndex,
  verifyWorkspaceResources,
  workspaceResourceIndexAsset,
} from "../a3/workspace/resource-index.ts";

const resources = [
  {
    path: "ui/images/logo.bin",
    mediaType: "application/octet-stream",
    bytes: new Uint8Array([3, 2, 1]),
  },
  {
    path: "backend/main.rs",
    mediaType: "text/plain; charset=utf-8",
    bytes: new TextEncoder().encode("fn main() {}\n"),
  },
];

test("creates a deterministic external resource index without bundling resource bytes", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  assert.deepEqual(index.resources.map((entry) => entry.path), [
    "backend/main.rs",
    "ui/images/logo.bin",
  ]);
  assert.equal(index.resources[0].byteLength, "13");
  assert.match(index.resources[0].sha256, /^[a-f0-9]{64}$/);

  const asset = workspaceResourceIndexAsset(index);
  assert.equal(asset.path, PIP_WORKSPACE_INDEX_PATH);
  assert.ok(asset.bytes.byteLength < resources.reduce((sum, resource) => sum + resource.bytes.byteLength, 0) + 512);
  assert.deepEqual(readWorkspaceResourceIndex({ assets: [asset] }), index);
});

test("rejects unsafe, duplicate, unsorted, missing, and changed resources", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  await verifyWorkspaceResources(index, [...resources].reverse());
  await assert.rejects(
    () => verifyWorkspaceResources(index, [{ ...resources[0], bytes: new Uint8Array([9]) }, resources[1]]),
    /do not match/,
  );
  assert.throws(
    () => assertWorkspaceResourceIndex({
      ...index,
      resources: [index.resources[1], index.resources[0]],
    }),
    /sorted/,
  );
  assert.throws(
    () => assertWorkspaceResourceIndex({
      ...index,
      resources: [{ ...index.resources[0], path: "../secret" }],
    }),
    /Unsafe/,
  );
});
