export const P = Object.freeze({
  observes: "relation.projection.predicate.observes", uses: "relation.projection.predicate.uses",
  divesInto: "relation.projection.predicate.dives-into", presents: "relation.projection.predicate.presents",
  childPredicate: "relation.projection.predicate.child-predicate", frame: "relation.projection.predicate.frame",
});
export const relationBy = (node, predicate) => node?.relations.find((relation) => relation.predicate.nodeId === predicate);
export const relationsBy = (node, predicate) => node?.relations.filter((relation) => relation.predicate.nodeId === predicate) ?? [];
export const targetOf = (relation) => relation?.object.kind === "ref" ? relation.object.target : undefined;
export const targetBy = (node, predicate) => targetOf(relationBy(node, predicate));
export const valueBy = (node, predicate) => {
  const object = relationBy(node, predicate)?.object;
  return object?.kind === "const" ? object.value : undefined;
};
export const observed = (projection, graph) => graph.nodes[targetBy(projection, P.observes)?.nodeId];
export const definitionId = (projection) => targetBy(projection, P.uses)?.nodeId;
export const nameOf = (node) => {
  const relation = node?.relations.find(({ id, predicate }) => id === "name" || predicate.nodeId.endsWith(".name"));
  return String(relation?.object.kind === "const" ? relation.object.value : node?.id ?? "unknown");
};
export const isProjection = (node) => targetBy(node, "relation.core.type")?.nodeId === "relation.projection.type.instance";
