import { P, observed, targetBy } from "./selectors.js";

const identity = (nodeId) => ({ nodeId, relationId: "identity" });
const ref = (id, predicate, nodeId, relations = []) => ({ id, predicate: identity(predicate), object: { kind: "ref", target: identity(nodeId) }, relations });
const constant = (id, predicate, value) => ({ id, predicate: identity(predicate), object: { kind: "const", value }, relations: [] });
const parentOf = (graph, predicate, childId) => Object.values(graph.nodes).find((node) => node.relations.some((relation) => relation.predicate.nodeId === predicate && relation.object.kind === "ref" && relation.object.target.nodeId === childId));

export function attachChild(input, graph) {
  const parentProjection = graph.nodes[input.parentProjectionId], childProjection = graph.nodes[input.childProjectionId];
  const parent = parentProjection && observed(parentProjection, graph), child = childProjection && observed(childProjection, graph);
  const predicate = parentProjection && targetBy(parentProjection, P.childPredicate)?.nodeId;
  if (!parent || !child || !predicate || !input.frame) throw new Error("Invalid child projection attachment");
  if (parent.id === child.id || parentOf(graph, predicate, child.id)) throw new Error(`Node ${child.id} already has a parent`);
  let cursor = parent;
  while (cursor) { if (cursor.id === child.id) throw new Error("Contains attachment would create a cycle"); cursor = parentOf(graph, predicate, cursor.id); }
  const suffix = crypto.randomUUID(), contains = ref(`contains:${suffix}`, predicate, child.id);
  const presents = ref(`presents:${suffix}`, P.presents, childProjection.id, [constant(`frame:${suffix}`, P.frame, input.frame)]);
  return { schemaVersion: 1, baseRevision: graph.revision, operations: [
    { op: "put-relation", nodeId: parent.id, relation: contains },
    { op: "put-relation", nodeId: parentProjection.id, relation: presents },
  ] };
}

export function detachChild(input, graph) {
  const parentProjection = graph.nodes[input.parentProjectionId], childProjection = graph.nodes[input.childProjectionId];
  const parent = parentProjection && observed(parentProjection, graph), child = childProjection && observed(childProjection, graph);
  const predicate = parentProjection && targetBy(parentProjection, P.childPredicate)?.nodeId;
  const contains = parent?.relations.find((relation) => relation.predicate.nodeId === predicate && relation.object.kind === "ref" && relation.object.target.nodeId === child?.id);
  const presents = parentProjection?.relations.find((relation) => relation.predicate.nodeId === P.presents && relation.object.kind === "ref" && relation.object.target.nodeId === childProjection?.id);
  if (!parent || !contains || !presents) throw new Error("Unknown child projection attachment");
  return { schemaVersion: 1, baseRevision: graph.revision, operations: [
    { op: "remove-relation", nodeId: parent.id, relationId: contains.id },
    { op: "remove-relation", nodeId: parentProjection.id, relationId: presents.id },
  ] };
}

export function moveChild(input, graph) {
  const parent_projection = graph.nodes[input.parentProjectionId], parent = parent_projection && observed(parent_projection, graph);
  const frame = input.frame;
  if (!parent || !graph.nodes[input.childProjectionId] || !frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)) throw new Error("Invalid child projection frame");
  const presents = parent_projection.relations.find((relation) => relation.predicate.nodeId === P.presents && relation.object.kind === "ref" && relation.object.target.nodeId === input.childProjectionId);
  if (!presents) throw new Error("Unknown child projection frame");
  const frame_relation = presents.relations.find((relation) => relation.predicate.nodeId === P.frame);
  if (!frame_relation) throw new Error(`Projection ${parent_projection.id} presents a child without a frame`);
  return { schemaVersion: 1, baseRevision: graph.revision, operations: [{ op: "put-relation", nodeId: parent_projection.id, relation: {
    ...presents, relations: presents.relations.map((relation) => relation.id === frame_relation.id ? { ...relation, object: { kind: "const", value: frame } } : relation),
  } }] };
}
