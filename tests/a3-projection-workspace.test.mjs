import assert from "node:assert/strict";
import test from "node:test";

import { createA3CustomNodeExtension } from "../a3/core/custom-nodes.ts";
import {
  a3ProjectionIndexResource,
  a3ProjectionSourceSha256,
} from "../a3/projection/projection-index.ts";
import { openA3ProjectionWorkspace } from "../a3/projection/projection-workspace.ts";
import { createWorkspaceResourceIndex } from "../a3/workspace/resource-index.ts";
import {
  MemoryWorkspaceResourceStore,
  WorkspaceResourceSession,
} from "../a3/workspace/resource-store.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const fixture = async (materialization = "mixed") => {
  const root = createSampleBusinessRoot();
  const source = root.children[0];
  source.extension = createA3CustomNodeExtension({
    kind: "software-flow/1",
    capability: "software-authoring/1",
    settings: { intent: "Order flow" },
  });
  const projected = {
    path: "frontend/order.tsx",
    mediaType: "text/plain; charset=utf-8",
    bytes: new TextEncoder().encode("export const Order = () => null;\n"),
  };
  const projection = {
    projectionId: "order-ui",
    kind: "ui-projection/1",
    sourceNodeId: source.id,
    sourceSha256: await a3ProjectionSourceSha256(source),
    capability: "software-authoring/1",
    materialization,
    resourcePaths: [projected.path],
  };
  const projectionIndex = a3ProjectionIndexResource({ schemaVersion: 1, projections: [projection] });
  const allResources = [projectionIndex, projected];
  const store = new MemoryWorkspaceResourceStore(allResources);
  const resources = new WorkspaceResourceSession(
    await createWorkspaceResourceIndex(allResources),
    store,
  );
  return { root, projected, projection, store, resources };
};

test("a3 projection workspace opens its small index and reads content only on focus", async () => {
  const { root, projected, store, resources } = await fixture();
  const workspace = await openA3ProjectionWorkspace(root, resources);
  assert.equal(store.readCount, 1, "opening reads only the projection index resource");
  assert.deepEqual(await workspace.audit(), []);
  assert.equal(store.readCount, 1, "auditing uses metadata and inner intent only");
  assert.deepEqual(await workspace.readResource("order-ui", projected.path), projected);
  assert.equal(store.readCount, 2);
  await assert.rejects(
    () => workspace.readResource("order-ui", "frontend/unowned.tsx"),
    /not owned/,
  );
});

test("a3 projection workspace detaches metadata without deleting ordinary resources", async () => {
  const { root, projected, resources } = await fixture();
  const workspace = await openA3ProjectionWorkspace(root, resources);
  const detached = workspace.detach("order-ui");
  assert.deepEqual(detached.resourcePaths, [projected.path]);
  assert.ok(resources.entry(projected.path), "detach leaves the external file under user control");
  await workspace.save();
  assert.equal(workspace.dirty, false);
  assert.ok(resources.entry(projected.path));
});

test("a3 projection reset requires confirmation before including manual content", async () => {
  const mixed = await fixture("mixed");
  const workspace = await openA3ProjectionWorkspace(mixed.root, mixed.resources);
  assert.throws(() => workspace.planReset("order-ui"), /explicit confirmation/);
  assert.deepEqual(workspace.planReset("order-ui", { allowManualContent: true }), {
    projectionId: "order-ui",
    resourcePaths: [mixed.projected.path],
    includesManualContent: true,
  });

  const generated = await fixture("generated");
  const generatedWorkspace = await openA3ProjectionWorkspace(generated.root, generated.resources);
  assert.equal(generatedWorkspace.planReset("order-ui").includesManualContent, false);
});

test("a3 projection workspace starts empty and persists an explicit projection", async () => {
  const root = createSampleBusinessRoot();
  const store = new MemoryWorkspaceResourceStore();
  const resources = new WorkspaceResourceSession(
    await createWorkspaceResourceIndex([]),
    store,
  );
  const workspace = await openA3ProjectionWorkspace(root, resources);
  assert.deepEqual(workspace.list(), []);
  const source = root.children[0];
  workspace.upsert({
    projectionId: "manual-notes",
    kind: "notes-projection/1",
    sourceNodeId: source.id,
    sourceSha256: await a3ProjectionSourceSha256(source),
    capability: "software-authoring/1",
    materialization: "manual",
    resourcePaths: [],
  });
  await workspace.save();
  assert.ok(resources.entry("a3/projections/index.json"));
});

test("a3 projection workspace edits one owned resource and preserves ordinary files on detach", async () => {
  const { root, projected, resources } = await fixture("generated");
  const workspace = await openA3ProjectionWorkspace(root, resources);
  const changed = {
    ...projected,
    bytes: new TextEncoder().encode("export const Order = () => 'manual';\n"),
  };
  await workspace.writeResource("order-ui", changed);
  assert.equal(workspace.projection("order-ui").materialization, "mixed");
  assert.deepEqual((await resources.read(projected.path)).bytes, changed.bytes);

  workspace.detachResource("order-ui", projected.path);
  assert.deepEqual(workspace.projection("order-ui").resourcePaths, []);
  assert.ok(resources.entry(projected.path), "detach does not delete the user resource");
});

test("a3 projection workspace requires explicit attachment and rejects ownership conflicts", async () => {
  const { root, projection, resources } = await fixture();
  const workspace = await openA3ProjectionWorkspace(root, resources);
  workspace.upsert({
    ...projection,
    projectionId: "second-ui",
    resourcePaths: [],
  });
  const newResource = {
    path: "frontend/extra.tsx",
    mediaType: "text/plain; charset=utf-8",
    bytes: new TextEncoder().encode("export const Extra = true;\n"),
  };
  await assert.rejects(
    () => workspace.writeResource("second-ui", newResource),
    /explicitly attached/,
  );
  await workspace.writeResource("second-ui", newResource, { attach: true });
  await assert.rejects(
    () => workspace.writeResource("order-ui", newResource),
    /already owned by second-ui/,
  );
});
