import assert from "node:assert/strict";
import test from "node:test";

import { createA3CustomNodeExtension } from "../a3/core/custom-nodes.ts";
import {
  a3ProjectionIndexResource,
  a3ProjectionSourceSha256,
  assertA3ProjectionIndex,
  auditA3ProjectionIndex,
  readA3ProjectionIndexResource,
} from "../a3/projection/projection-index.ts";
import { createWorkspaceResourceIndex } from "../a3/workspace/resource-index.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const resource = {
  path: "ui/order-form.tsx",
  mediaType: "text/plain; charset=utf-8",
  bytes: new TextEncoder().encode("export function OrderForm() {}\n"),
};

const fixture = async () => {
  const root = createSampleBusinessRoot();
  const source = root.children[0];
  source.extension = createA3CustomNodeExtension({
    kind: "software-flow/1",
    capability: "software-authoring/1",
    settings: { intent: "Capture order" },
  });
  const index = {
    schemaVersion: 1,
    projections: [{
      projectionId: "order-ui",
      kind: "ui-projection/1",
      sourceNodeId: source.id,
      sourceSha256: await a3ProjectionSourceSha256(source),
      capability: "software-authoring/1",
      materialization: "mixed",
      resourcePaths: [resource.path],
    }],
  };
  return { root, source, index, resources: await createWorkspaceResourceIndex([resource]) };
};

test("a3 projection index round-trips as an ordinary workspace resource", async () => {
  const { index } = await fixture();
  const encoded = a3ProjectionIndexResource(index);
  assert.equal(encoded.path, "a3/projections/index.json");
  assert.deepEqual(readA3ProjectionIndexResource(encoded), index);
});

test("a3 projection audit reports drift without rejecting the editable index", async () => {
  const { root, source, index, resources } = await fixture();
  assert.deepEqual(await auditA3ProjectionIndex({ index, root, resources }), []);
  source.description = "The user changed the inner intent";
  const diagnostics = await auditA3ProjectionIndex({ index, root, resources });
  assert.deepEqual(diagnostics.map(({ severity, code }) => [severity, code]), [
    ["warning", "stale-source"],
  ]);
  assert.doesNotThrow(() => assertA3ProjectionIndex(index));
});

test("a3 projection audit exposes broken links for reset or manual repair", async () => {
  const { root, index, resources } = await fixture();
  index.projections.push({
    ...index.projections[0],
    projectionId: "second-ui",
    sourceNodeId: "missing-node",
    resourcePaths: [resource.path, "ui/z-missing.tsx"],
  });
  const diagnostics = await auditA3ProjectionIndex({ index, root, resources });
  assert.deepEqual(diagnostics.map(({ code }) => code), [
    "missing-source",
    "resource-owner-conflict",
    "missing-resource",
  ]);
});

test("a3 projection format rejects ambiguous order and unversioned kinds", async () => {
  const { index } = await fixture();
  assert.throws(() => assertA3ProjectionIndex({
    ...index,
    projections: [{ ...index.projections[0], kind: "ui-projection" }],
  }), /Invalid a3 projection entry/);
  assert.throws(() => assertA3ProjectionIndex({
    ...index,
    projections: [
      { ...index.projections[0], projectionId: "z" },
      { ...index.projections[0], projectionId: "a" },
    ],
  }), /sorted and unique/);
});
