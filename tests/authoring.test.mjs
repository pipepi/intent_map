import assert from "node:assert/strict";
import test from "node:test";

import { deepCopyIntentSubtree } from "../app/runtime/authoring.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const flatten = (node) => [
  node,
  ...(node.children ?? []).flatMap(flatten),
];

test("deep copies every descendant and rewrites only internal references", () => {
  const source = structuredClone(createSampleBusinessRoot().children[0]);
  const descendants = flatten(source);
  source.inputs[0].binding = {
    kind: "ref",
    nodeId: "external_node",
    portId: "external_port",
  };
  source.outputs[0].mapping = {
    kind: "ref",
    nodeId: descendants.at(-1).id,
    portId: descendants.at(-1).outputs[0]?.id ?? "leaf_output",
  };

  const result = deepCopyIntentSubtree(source, (id) => `copy_${id}`);
  const copied = flatten(result.root);

  assert.equal(copied.length, descendants.length);
  assert.equal(new Set(copied.map((node) => node.id)).size, copied.length);
  assert.equal(
    copied.some((node) => descendants.some((sourceNode) => sourceNode.id === node.id)),
    false,
  );
  assert.equal(result.root.inputs[0].binding.nodeId, "external_node");
  assert.equal(
    result.root.outputs[0].mapping.nodeId,
    `copy_${descendants.at(-1).id}`,
  );
  result.root.children[0].name = "changed";
  assert.notEqual(result.root.children[0].name, source.children[0].name);
});
