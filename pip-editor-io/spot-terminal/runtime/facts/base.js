import { PipForkLevel } from "../../../../pip-editor/pip/types.ts";
const identity = (node_id) => ({ node_id: node_id, pip_id: "identity" });

export const constant = (id, predicate, value) => ({
  id,
    fork_level: PipForkLevel.PIPE,
    predicate_value: { predicate: identity(predicate), value: { kind: "const", value } },
    pips: []
});

export const reference = (id, predicate, node_id, pips = []) => ({
  id,
    fork_level: PipForkLevel.PIPE,
    predicate_value: { predicate: identity(predicate), value: { kind: "ref", target: identity(node_id) } },
    pips: pips
});

export const stable_key = (value) => encodeURIComponent(String(value ?? "unknown"));
export const fact_id = (terminal_id, kind, key) => `${terminal_id}:fact:${kind}:${stable_key(key)}`;
export const projection_id = (fact_node_id, style) => `${fact_node_id}:projection:${style}`;
export function fact_node(terminal_id, kind, key, value, links = []) {
    const node_id = fact_id(terminal_id, kind, key);
    return { id: node_id, fork_level: PipForkLevel.NODE, pips: [
            constant("identity", "pip.core.identity", node_id),
            reference("type", "pip.core.type", `spot.terminal.type.${kind}`),
            constant("value", "spot.terminal.predicate.fact-value", value),
            ...links.map(({ role, target }) => reference(role, `spot.terminal.predicate.${role}`, target)),
        ] };
}
export function projection_node(node_id, kind, style, dives_into) {
    const id = projection_id(node_id, style);
    return { id, fork_level: PipForkLevel.NODE, pips: [
            constant("identity", "pip.core.identity", id),
            reference("type", "pip.core.type", "pip.projection.type.instance"),
            reference("observes", "pip.projection.predicate.observes", node_id),
            reference("uses", "pip.projection.predicate.uses", `spot.terminal.projection.${kind}-${style}`),
            ...(dives_into ? [reference("dives-into", "pip.projection.predicate.dives-into", dives_into)] : []),
        ] };
}
