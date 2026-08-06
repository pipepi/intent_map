import assert from "node:assert/strict";
import test from "node:test";

import {
  a3ExtensionSha256,
  applyA3CustomNodePatch,
} from "../a3/core/custom-node-patches.ts";
import { createA3CustomNodeExtension } from "../a3/core/custom-nodes.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const customNode = {
  kind: "software-flow/1",
  capability: "software-authoring/1",
  settings: { constraint: "idempotent" },
};

test("a3 patch changes only its opaque custom-node extension", async () => {
  const root = createSampleBusinessRoot();
  const target = root.children[0];
  const before = structuredClone(root);
  const result = await applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations: [{
      op: "set",
      nodeId: target.id,
      expectedExtensionSha256: await a3ExtensionSha256(target.extension),
      data: customNode,
    }],
  });
  assert.deepEqual(root, before, "patch must not mutate the a2-owned input tree");
  assert.deepEqual(result.root.children[0].extension, createA3CustomNodeExtension(customNode));
  const withoutExtensions = (value) => JSON.parse(JSON.stringify(value, (key, item) =>
    key === "extension" ? undefined : item));
  assert.deepEqual(withoutExtensions(result.root), withoutExtensions(root));
});

test("a3 patch refuses stale writes and foreign extension replacement", async () => {
  const root = createSampleBusinessRoot();
  const target = root.children[0];
  await assert.rejects(() => applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations: [{
      op: "set",
      nodeId: target.id,
      expectedExtensionSha256: "0".repeat(64),
      data: customNode,
    }],
  }), /extension changed/);

  target.extension = { namespace: "another.extension", schemaVersion: 1, data: null };
  const foreignSha256 = await a3ExtensionSha256(target.extension);
  await assert.rejects(() => applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations: [{
      op: "set",
      nodeId: target.id,
      expectedExtensionSha256: foreignSha256,
      data: customNode,
    }],
  }), /cannot overwrite foreign extension/);
});

test("a3 patch applies atomically and can clear its own extension", async () => {
  const root = createSampleBusinessRoot();
  const first = root.children[0];
  first.extension = createA3CustomNodeExtension(customNode);
  const before = structuredClone(root);
  const firstSha256 = await a3ExtensionSha256(first.extension);
  const emptySha256 = await a3ExtensionSha256(undefined);
  await assert.rejects(() => applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations: [
      {
        op: "clear",
        nodeId: first.id,
        expectedExtensionSha256: firstSha256,
      },
      {
        op: "set",
        nodeId: "zz_missing_node",
        expectedExtensionSha256: emptySha256,
        data: customNode,
      },
    ],
  }), /target does not exist/);
  assert.deepEqual(root, before);

  const cleared = await applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations: [{
      op: "clear",
      nodeId: first.id,
      expectedExtensionSha256: await a3ExtensionSha256(first.extension),
    }],
  });
  assert.equal(cleared.root.children[0].extension, undefined);
});

test("a3 patch requires deterministic sorted unique targets", async () => {
  const root = createSampleBusinessRoot();
  const [first, second] = root.children;
  const operation = async (node) => ({
    op: "set",
    nodeId: node.id,
    expectedExtensionSha256: await a3ExtensionSha256(node.extension),
    data: customNode,
  });
  const operations = [await operation(first), await operation(second)];
  await assert.rejects(() => applyA3CustomNodePatch(root, {
    schemaVersion: 1,
    operations,
  }), /sorted and unique/);
});
