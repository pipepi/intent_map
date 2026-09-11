import assert from "node:assert/strict";
import test from "node:test";

import {
  PIP_WORKSPACE_INDEX_PATH,
  assertWorkspaceResourceIndex,
  createWorkspaceResourceIndex,
  readWorkspaceResourceIndex,
  verifyWorkspaceResources,
  workspaceResourceIndexAsset,
} from "../pip-editor/pip-package/workspace/resource-index.ts";
import {
  MemoryWorkspaceResourceStore,
  openWorkspaceResourceSession,
} from "../pip-editor/pip-package/workspace/resource-store.ts";

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

test("opens the split workspace lazily and verifies only a focused resource", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  const store = new MemoryWorkspaceResourceStore(resources);
  const session = openWorkspaceResourceSession(
    { assets: [workspaceResourceIndexAsset(index)] },
    store,
  );

  assert.equal(store.readCount, 0);
  assert.deepEqual(session.list(), index.resources);
  assert.equal((await session.read("backend/main.rs")).mediaType, "text/plain; charset=utf-8");
  assert.equal(store.readCount, 1);

  await store.write({ ...resources[1], bytes: new TextEncoder().encode("changed") });
  await assert.rejects(() => session.read("backend/main.rs"), /byte length changed/);
  await assert.rejects(() => session.read("not-indexed.txt"), /not indexed/);
});

test("resource edits update the small intent index without bundling the files", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  const store = new MemoryWorkspaceResourceStore(resources);
  const session = openWorkspaceResourceSession(
    { assets: [workspaceResourceIndexAsset(index)] },
    store,
  );

  await session.write({
    path: "api/openapi.json",
    mediaType: "application/json",
    bytes: new TextEncoder().encode("{}"),
  });
  assert.equal(session.dirty, true);
  assert.deepEqual(session.list().map((entry) => entry.path), [
    "api/openapi.json",
    "backend/main.rs",
    "ui/images/logo.bin",
  ]);
  assert.deepEqual((await session.read("api/openapi.json")).bytes, new TextEncoder().encode("{}"));

  await session.remove("ui/images/logo.bin");
  assert.equal(session.entry("ui/images/logo.bin"), undefined);
  session.markSaved();
  assert.equal(session.dirty, false);
});
