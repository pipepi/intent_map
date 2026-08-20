import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodePresentation } from "../app/_editor/plugin-editor/node-presentation.ts";
import { createCoreRelationGraph } from "../app/relation/model.ts";

test("node presentation reads mutable registries on every resolution", () => {
  const graph = createCoreRelationGraph();
  const node = graph.nodes["relation.core.type"];
  let enabled = false;
  const descriptor = { type: { nodeId: node.id, relationId: "identity" }, name: "Type", matches: () => true, element: { pluginId: "official.elements", elementId: "node" } };
  const declaration = { id: "node", tag: "official-relation-node", purpose: "node" };
  const nodeTypes = { projections: () => [], types: () => enabled ? [descriptor] : [] };
  const elements = { resolve: () => enabled ? declaration : undefined };
  assert.equal(resolveNodePresentation(node, graph, elements, nodeTypes).declaration, undefined);
  enabled = true;
  assert.equal(resolveNodePresentation(node, graph, elements, nodeTypes).declaration.tag, declaration.tag);
  enabled = false;
  assert.equal(resolveNodePresentation(node, graph, elements, nodeTypes).type, undefined);
});
