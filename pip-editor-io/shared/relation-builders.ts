import {
  createCoreRelationGraph,
  type JsonValue,
  type Relation,
  type RelationGraph,
  type RelationNode,
  type RelationRef,
} from "../../pip-editor/relation/index.ts";

export const CORE_IDENTITY: RelationRef = {
  nodeId: "relation.core.identity",
  relationId: "identity",
};

export const identityRelation = (id: string): Relation => ({
  id: "identity",
  predicate: CORE_IDENTITY,
  object: { kind: "const", value: id },
  relations: [],
});

export const constRelation = (
  id: string,
  predicateNodeId: string,
  value: JsonValue,
  relations: Relation[] = [],
): Relation => ({
  id,
  predicate: { nodeId: predicateNodeId, relationId: "identity" },
  object: { kind: "const", value },
  relations,
});

export const refRelation = (
  id: string,
  predicateNodeId: string,
  nodeId: string,
  relationId = "identity",
  relations: Relation[] = [],
): Relation => ({
  id,
  predicate: { nodeId: predicateNodeId, relationId: "identity" },
  object: { kind: "ref", target: { nodeId, relationId } },
  relations,
});

export const relationNode = (
  id: string,
  relations: Relation[] = [],
): RelationNode => ({ id, relations: [identityRelation(id), ...relations] });

export const ontologyGraph = (nodes: RelationNode[]): RelationGraph => {
  const graph = createCoreRelationGraph();
  for (const node of nodes) graph.nodes[node.id] = node;
  return graph;
};

export const mergeGraphs = (...graphs: RelationGraph[]): RelationGraph => ({
  revision: 0,
  nodes: Object.assign({}, ...graphs.map((graph) => structuredClone(graph.nodes))),
});
