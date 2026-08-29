const identity = (node_id) => ({ nodeId: node_id, relationId: "identity" });

export const constant = (id, predicate, value) => ({
  id, predicate: identity(predicate), object: { kind: "const", value }, relations: [],
});

export const reference = (id, predicate, node_id, relations = []) => ({
  id, predicate: identity(predicate), object: { kind: "ref", target: identity(node_id) }, relations,
});

export const stable_key = (value) => encodeURIComponent(String(value ?? "unknown"));
export const fact_id = (terminal_id, kind, key) => `${terminal_id}:fact:${kind}:${stable_key(key)}`;
export const projection_id = (fact_node_id, style) => `${fact_node_id}:projection:${style}`;

export function fact_node(terminal_id, kind, key, value, links = []) {
  const node_id = fact_id(terminal_id, kind, key);
  return { id: node_id, relations: [
    constant("identity", "relation.core.identity", node_id),
    reference("type", "relation.core.type", `spot.terminal.type.${kind}`),
    constant("value", "spot.terminal.predicate.fact-value", value),
    ...links.map(({ role, target }) => reference(role, `spot.terminal.predicate.${role}`, target)),
  ] };
}

export function projection_node(node_id, kind, style, dives_into) {
  const id = projection_id(node_id, style);
  return { id, relations: [
    constant("identity", "relation.core.identity", id),
    reference("type", "relation.core.type", "relation.projection.type.instance"),
    reference("observes", "relation.projection.predicate.observes", node_id),
    reference("uses", "relation.projection.predicate.uses", `spot.terminal.projection.${kind}-${style}`),
    ...(dives_into ? [reference("dives-into", "relation.projection.predicate.dives-into", dives_into)] : []),
  ] };
}
