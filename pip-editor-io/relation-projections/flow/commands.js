import { FLOW, flowInputs, flowOutputs } from "./selectors.js";

const object = (input) => input && typeof input === "object" && !Array.isArray(input) ? input : {};
const bindingRelation = (targetRelationId, sourceNodeId, sourceRelationId) => ({
  id: `binding:${targetRelationId}`, predicate: { nodeId: FLOW.binding, relationId: "identity" },
  object: { kind: "ref", target: { nodeId: sourceNodeId, relationId: sourceRelationId } }, relations: [],
});

export function connectFlow(input, graph) {
  const value = object(input), node = graph.nodes[value.targetNodeId], relation = node?.relations.find((item) => item.id === value.targetRelationId);
  if (!node || !relation || ![...flowInputs(node), ...flowOutputs(node)].includes(relation)) throw new Error("Flow target must be a consumer input or composite output port");
  const source = graph.nodes[value.sourceNodeId]?.relations.find((item) => item.id === value.sourceRelationId);
  if (!source) throw new Error("Flow source port does not exist");
  return { schemaVersion: 1, baseRevision: graph.revision, operations: [{ op: "put-relation", nodeId: node.id, relation: {
    ...relation, relations: [...relation.relations.filter((item) => item.predicate.nodeId !== FLOW.binding), bindingRelation(relation.id, value.sourceNodeId, value.sourceRelationId)],
  } }] };
}

export function disconnectFlow(input, graph) {
  const value = object(input), node = graph.nodes[value.targetNodeId], relation = node?.relations.find((item) => item.id === value.targetRelationId);
  if (!node || !relation || ![...flowInputs(node), ...flowOutputs(node)].includes(relation)) throw new Error("Flow target must be a consumer input or composite output port");
  return { schemaVersion: 1, baseRevision: graph.revision, operations: [{ op: "put-relation", nodeId: node.id, relation: {
    ...relation, relations: relation.relations.filter((item) => item.predicate.nodeId !== FLOW.binding),
  } }] };
}
