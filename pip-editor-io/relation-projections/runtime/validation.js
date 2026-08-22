import { P, definitionId, isProjection, observed, relationsBy, targetBy, targetOf } from "./selectors.js";

const supported = new Set(["relation.projection.definition.properties", "relation.projection.definition.contains"]);

export function validateProjectionGraph(graph) {
  const parents = new Map();
  for (const projection of Object.values(graph.nodes).filter(isProjection)) {
    const owner = observed(projection, graph), definition = definitionId(projection);
    if (!owner) throw new Error(`Projection ${projection.id} observes a missing node`);
    if (!supported.has(definition) && !definition?.startsWith("scene.projection.")) throw new Error(`Projection ${projection.id} uses an unsupported definition`);
    if (definition === "relation.projection.definition.properties" && !targetBy(projection, P.divesInto)) throw new Error(`Self projection ${projection.id} has no internal target`);
    if (definition !== "relation.projection.definition.contains") continue;
    const predicate = targetBy(projection, P.childPredicate)?.nodeId;
    if (!predicate) throw new Error(`Children projection ${projection.id} has no child predicate`);
    const children = owner.relations.filter((relation) => relation.predicate.nodeId === predicate).map(targetOf).filter(Boolean);
    const presented = relationsBy(projection, P.presents).map(targetOf).filter(Boolean).map((ref) => observed(graph.nodes[ref.nodeId], graph)?.id);
    if (children.some((ref) => !presented.includes(ref.nodeId)) || presented.some((id) => !children.some((ref) => ref.nodeId === id))) throw new Error(`Projection ${projection.id} does not mirror its direct children`);
    for (const child of children) {
      if (parents.has(child.nodeId) && parents.get(child.nodeId) !== owner.id) throw new Error(`Node ${child.nodeId} has multiple parents`);
      parents.set(child.nodeId, owner.id);
    }
  }
  // A single parent does not prevent A→B→A, so every parent chain is checked separately.
  for (const nodeId of parents.keys()) {
    const seen = new Set([nodeId]); let parent = parents.get(nodeId);
    while (parent) { if (seen.has(parent)) throw new Error(`Contains cycle reaches ${parent}`); seen.add(parent); parent = parents.get(parent); }
  }
}
