import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
export const P = Object.freeze({
  observes: "pip.projection.predicate.observes", uses: "pip.projection.predicate.uses",
  divesInto: "pip.projection.predicate.dives-into", presents: "pip.projection.predicate.presents",
  childPredicate: "pip.projection.predicate.child-predicate", frame: "pip.projection.predicate.frame",
});
export const pipBy = (node, predicate) => node?.pips.find((pip) => pip.predicate_value?.predicate.node_id === predicate);
export const pipsBy = (node, predicate) => node?.pips.filter((pip) => pip.predicate_value?.predicate.node_id === predicate) ?? [];
export const targetOf = (pip) => pip?.predicate_value?.value.kind === "ref" ? pip.predicate_value.value.target : undefined;
export const targetBy = (node, predicate) => targetOf(pipBy(node, predicate));
export const valueBy = (node, predicate) => {
  const object = pipBy(node, predicate)?.predicate_value?.value;
  return object?.kind === "const" ? object.value : undefined;
};
export const observed = (projection, graph) => graphNodes(graph)[targetBy(projection, P.observes)?.node_id];
export const definitionId = (projection) => targetBy(projection, P.uses)?.node_id;
export const nameOf = (node) => {
  const pip = node?.pips.find(({ id, predicate_value }) => id === "name" || predicate_value?.predicate.node_id.endsWith(".name"));
  return String(pip?.predicate_value?.value.kind === "const" ? pip.predicate_value.value.value : node?.id ?? "unknown");
};
export const isProjection = (node) => targetBy(node, "pip.core.type")?.node_id === "pip.projection.type.instance";
