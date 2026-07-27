import assert from "node:assert/strict";
import test from "node:test";

import {
  deepCopyIntentSubtree,
  renameIntentNodeId,
  updateIntentPortSchema,
  validatePortConnection,
} from "../app/runtime/authoring.ts";
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

test("accepts only compatible visual pipeline endpoints", () => {
  assert.equal(
    validatePortConnection(
      { id: "out", name: "out", type: "string", channel: "data" },
      { id: "in", name: "in", type: "any", channel: "data" },
    ).ok,
    true,
  );
  assert.match(
    validatePortConnection(
      { id: "out", name: "out", type: "string", channel: "event" },
      { id: "in", name: "in", type: "string", channel: "data" },
    ).error,
    /通道不兼容/,
  );
  assert.match(
    validatePortConnection(
      { id: "out", name: "out", type: "string", channel: "data" },
      { id: "in", name: "in", type: "number", channel: "data" },
    ).error,
    /类型不兼容/,
  );
});

test("renames node and port ids atomically across references", () => {
  const root = structuredClone(createSampleBusinessRoot());
  const source = root.children[0];
  const target = root.children[1];
  target.inputs[0].binding = {
    kind: "ref",
    nodeId: source.id,
    portId: source.outputs[0].id,
  };

  const renamedNode = renameIntentNodeId(root, source.id, "renamed_flow");
  assert.equal(renamedNode.ok, true);
  assert.equal(renamedNode.value.children[0].id, "renamed_flow");
  assert.equal(
    renamedNode.value.children[1].inputs[0].binding.nodeId,
    "renamed_flow",
  );

  const output = renamedNode.value.children[0].outputs[0];
  const renamedPort = updateIntentPortSchema(
    renamedNode.value,
    "renamed_flow",
    "outputs",
    output.id,
    { ...output, id: "renamed_output", channel: "event" },
  );
  assert.equal(renamedPort.ok, true);
  assert.equal(
    renamedPort.value.children[1].inputs[0].binding.portId,
    "renamed_output",
  );
});

test("blocks invalid schema changes and deleting referenced ports", () => {
  const root = structuredClone(createSampleBusinessRoot());
  const source = root.children[0];
  const target = root.children[1];
  target.inputs[0].binding = {
    kind: "ref",
    nodeId: source.id,
    portId: source.outputs[0].id,
  };

  assert.equal(renameIntentNodeId(root, source.id, "").ok, false);
  assert.equal(
    updateIntentPortSchema(
      root,
      source.id,
      "outputs",
      source.outputs[0].id,
      null,
    ).ok,
    false,
  );
});
