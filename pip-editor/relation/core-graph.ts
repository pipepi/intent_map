/** Input: none. Output: the smallest closed graph that can describe identity, predicates, and types. */
import type { RelationGraph, RelationNode, RelationRef } from "./types.ts";
import { assertRelationGraph } from "./graph-validation.ts";

const bootstrapNode = (id: string, predicate: RelationRef): RelationNode => ({ id, relations: [{ id: "identity", predicate, object: { kind: "const", value: id }, relations: [] }] });
export const createCoreRelationGraph = (): RelationGraph => {
  const identity = { nodeId: "relation.core.identity", relationId: "identity" };
  const graph: RelationGraph = { revision: 0, nodes: {
    "relation.core.identity": bootstrapNode("relation.core.identity", identity),
    "relation.core.predicate": bootstrapNode("relation.core.predicate", identity),
    "relation.core.type": bootstrapNode("relation.core.type", identity),
  } };
  for (const node of Object.values(graph.nodes)) node.relations.push({
    id: "type",
    predicate: { nodeId: "relation.core.type", relationId: "identity" },
    object: { kind: "ref", target: { nodeId: "relation.core.predicate", relationId: "identity" } },
    relations: [],
  });
  assertRelationGraph(graph); return graph;
};
