import assert from "node:assert/strict";
import test from "node:test";

import { createA3CustomNodeExtension } from "../a3/core/custom-nodes.ts";
import { applyA3ProjectionProposal } from "../a3/projection/projection-proposals.ts";
import { a3ProjectionSourceSha256 } from "../a3/projection/projection-index.ts";
import {
  A3ProjectionWorkspaceSession,
} from "../a3/projection/projection-workspace.ts";
import { createWorkspaceResourceIndex } from "../a3/workspace/resource-index.ts";
import {
  MemoryWorkspaceResourceStore,
  WorkspaceResourceSession,
} from "../a3/workspace/resource-store.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const bytes = (text) => new TextEncoder().encode(text);

const fixture = async () => {
  const root = createSampleBusinessRoot();
  const source = root.children[0];
  source.extension = createA3CustomNodeExtension({
    kind: "business-flow-scenario/1",
    capability: "software-authoring/1",
    settings: { scenario: "Accept order", outcome: "Order accepted" },
  });
  const store = new MemoryWorkspaceResourceStore();
  const resources = new WorkspaceResourceSession(await createWorkspaceResourceIndex([]), store);
  const workspace = new A3ProjectionWorkspaceSession(root, resources, {
    schemaVersion: 1,
    projections: [],
  });
  return { root, source, store, resources, workspace };
};

const proposal = (sourceNodeId, resources = [{
  path: "docs/order-flow.md",
  mediaType: "text/markdown; charset=utf-8",
  bytes: bytes("# Order flow\n"),
}]) => ({
  schemaVersion: 1,
  projectionId: "order-spec",
  kind: "software-specification/1",
  sourceNodeId,
  capability: "software-authoring/1",
  resources,
});

test("a3 host applies a validated generated projection proposal", async () => {
  const { root, source, resources, workspace } = await fixture();
  const result = await applyA3ProjectionProposal({
    proposal: proposal(source.id),
    root,
    workspace,
  });
  assert.equal(result.projection.sourceSha256, await a3ProjectionSourceSha256(source));
  assert.equal(result.projection.materialization, "generated");
  assert.deepEqual((await resources.read("docs/order-flow.md")).bytes, bytes("# Order flow\n"));
});

test("a3 host protects manual projections and resource ownership", async () => {
  const { root, source, workspace } = await fixture();
  workspace.upsert({
    projectionId: "order-spec",
    kind: "software-specification/1",
    sourceNodeId: source.id,
    sourceSha256: await a3ProjectionSourceSha256(source),
    capability: "software-authoring/1",
    materialization: "mixed",
    resourcePaths: [],
  });
  await assert.rejects(() => applyA3ProjectionProposal({
    proposal: proposal(source.id),
    root,
    workspace,
  }), /explicit confirmation/);

  workspace.upsert({
    ...workspace.projection("order-spec"),
    projectionId: "other-spec",
    materialization: "generated",
    resourcePaths: ["docs/order-flow.md"],
  });
  await assert.rejects(() => applyA3ProjectionProposal({
    proposal: proposal(source.id),
    root,
    workspace,
    allowManualOverwrite: true,
  }), /already owned by other-spec/);
});

test("a3 regeneration leaves removed resources as visible orphans", async () => {
  const { root, source, resources, workspace } = await fixture();
  await applyA3ProjectionProposal({
    proposal: proposal(source.id, [
      { path: "docs/old.md", mediaType: "text/markdown", bytes: bytes("old") },
    ]),
    root,
    workspace,
  });
  const result = await applyA3ProjectionProposal({
    proposal: proposal(source.id),
    root,
    workspace,
  });
  assert.deepEqual(result.orphanedResourcePaths, ["docs/old.md"]);
  assert.ok(resources.entry("docs/old.md"), "regeneration never deletes the old user file");
});

test("a3 host rejects unsorted resources and mismatched source capabilities", async () => {
  const { root, source, workspace } = await fixture();
  await assert.rejects(() => applyA3ProjectionProposal({
    proposal: proposal(source.id, [
      { path: "z.txt", mediaType: "text/plain", bytes: bytes("z") },
      { path: "a.txt", mediaType: "text/plain", bytes: bytes("a") },
    ]),
    root,
    workspace,
  }), /sorted and unique/);
  await assert.rejects(() => applyA3ProjectionProposal({
    proposal: { ...proposal(source.id), capability: "other-authoring/1" },
    root,
    workspace,
  }), /does not match its source/);
});
