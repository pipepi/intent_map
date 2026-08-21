import { createCoreRelationGraph, type JsonValue, type Relation, type RelationGraph, type RelationNode, type RelationRef } from "../app/relation/model.ts";

export const CORE_IDENTITY: RelationRef = { nodeId: "relation.core.identity", relationId: "identity" };
export const identityRelation = (id: string): Relation => ({ id: "identity", predicate: CORE_IDENTITY, object: { kind: "const", value: id }, relations: [] });
export const constRelation = (id: string, predicateNodeId: string, value: JsonValue, relations: Relation[] = []): Relation => ({
  id, predicate: { nodeId: predicateNodeId, relationId: "identity" }, object: { kind: "const", value }, relations,
});
export const refRelation = (id: string, predicateNodeId: string, nodeId: string, relationId = "identity", relations: Relation[] = []): Relation => ({
  id, predicate: { nodeId: predicateNodeId, relationId: "identity" }, object: { kind: "ref", target: { nodeId, relationId } }, relations,
});
export const relationNode = (id: string, relations: Relation[] = []): RelationNode => ({ id, relations: [identityRelation(id), ...relations] });
export const ontologyGraph = (nodes: RelationNode[]): RelationGraph => {
  const graph = createCoreRelationGraph();
  for (const node of nodes) graph.nodes[node.id] = node;
  return graph;
};
export const mergeGraphs = (...graphs: RelationGraph[]): RelationGraph => ({
  revision: 0,
  nodes: Object.assign({}, ...graphs.map((graph) => structuredClone(graph.nodes))),
});

export const baseElementManifest = (id: string, name: string, sourcePaths = ["source/index.js"]) => ({
  format: "intent-element-plugin" as const, schemaVersion: 2 as const, runtimeAbi: "relation-element/2" as const,
  id, name, version: "2.0.0", entry: "entry.mjs" as const, permissions: [], sourcePaths,
  sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64), communityTags: ["external", "source-disclosed"], redistributable: true,
});
export const baseNodeTypeManifest = (id: string, name: string, typeNodeIds: string[], elementId: string, sourcePaths = ["source/index.js"]) => ({
  format: "intent-node-type-plugin" as const, schemaVersion: 2 as const, runtimeAbi: "relation-node-type/2" as const,
  id, name, version: "2.0.0", entry: "entry.mjs" as const, ontology: "ontology.json" as const,
  elementDependencies: [{ id: elementId, version: "2.0.0" }], permissions: [], typeNodeIds,
  sourcePaths, sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64), redistributable: true,
});
