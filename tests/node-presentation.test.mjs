import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodePresentation } from "../pip-editor/relation-host/projection/resolve-presentation.ts";
import { createCoreRelationGraph } from "../pip-editor/relation/index.ts";

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

test("workspace projections are purpose-scoped, validated and reject ambiguity", () => {
  const graph = createCoreRelationGraph(), node = graph.nodes["relation.core.type"];
  const declaration = { id: "surface", tag: "official-workspace-surface", purpose: "projection" };
  const projection = { id: "workspace.one", purpose: "workspace", matches: () => true, project: () => ({ ready: true }), element: { pluginId: "official.elements", elementId: "surface" } };
  const elements = { resolve: () => declaration };
  const registry = (projections) => ({ projections: () => projections, types: () => [] });
  const resolved = resolveNodePresentation(node, graph, elements, registry([projection]), "workspace", { workspaceId: "w", rootNodeIds: [node.id] });
  assert.equal(resolved.declaration.tag, declaration.tag);
  assert.deepEqual(resolved.projectionData, { ready: true });
  assert.equal(resolveNodePresentation(node, graph, elements, registry([projection]), "node").declaration, undefined);
  assert.match(resolveNodePresentation(node, graph, elements, registry([projection, { ...projection, id: "workspace.two" }]), "workspace").error, /Ambiguous/);
  assert.match(resolveNodePresentation(node, graph, elements, registry([{ ...projection, project: () => ({ invalid: undefined }) }]), "workspace").error, /not JSON/);
});
