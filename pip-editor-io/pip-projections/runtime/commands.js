import { PipForkLevel } from "../../../pip-editor/pip/types.ts";
import { graphNodes, graphRevision } from "../../../pip-editor/pip/pip-model.ts";
import { P, observed, targetBy } from "./selectors.js";

const identity = (nodeId) => ({ node_id: nodeId, pip_id: "identity" });
const ref = (id, predicate, nodeId, pips = []) => ({ id, fork_level: PipForkLevel.PIPE, predicate_value: { predicate: identity(predicate), value: { kind: "ref", target: identity(nodeId) } }, pips: pips });
const constant = (id, predicate, value) => ({ id, fork_level: PipForkLevel.PIPE, predicate_value: { predicate: identity(predicate), value: { kind: "const", value } }, pips: [] });
const parentOf = (graph, predicate, childId) => Object.values(graphNodes(graph)).find((node) => node.pips.some((pip) => pip.predicate_value?.predicate.node_id === predicate && pip.predicate_value.value.kind === "ref" && pip.predicate_value.value.target.node_id === childId));

export function attachChild(input, graph) {
  const parentProjection = graphNodes(graph)[input.parentProjectionId], childProjection = graphNodes(graph)[input.childProjectionId];
  const parent = parentProjection && observed(parentProjection, graph), child = childProjection && observed(childProjection, graph);
  const predicate = parentProjection && targetBy(parentProjection, P.childPredicate)?.node_id;
  if (!parent || !child || !predicate || !input.frame) throw new Error("Invalid child projection attachment");
  if (parent.id === child.id || parentOf(graph, predicate, child.id)) throw new Error(`Node ${child.id} already has a parent`);
    let cursor = parent;
    while (cursor) {
        if (cursor.id === child.id)
            throw new Error("Contains attachment would create a cycle");
        cursor = parentOf(graph, predicate, cursor.id);
    }
    const suffix = crypto.randomUUID(), contains = ref(`contains:${suffix}`, predicate, child.id);
    const presents = ref(`presents:${suffix}`, P.presents, childProjection.id, [constant(`frame:${suffix}`, P.frame, input.frame)]);
    return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [
            { op: "put", parent_path: [parent.id], pip: contains },
            { op: "put", parent_path: [parentProjection.id], pip: presents },
        ] };
}
export function detachChild(input, graph) {
    const parentProjection = graphNodes(graph)[input.parentProjectionId], childProjection = graphNodes(graph)[input.childProjectionId];
    const parent = parentProjection && observed(parentProjection, graph), child = childProjection && observed(childProjection, graph);
    const predicate = parentProjection && targetBy(parentProjection, P.childPredicate)?.node_id;
    const contains = parent?.pips.find((pip) => pip.predicate_value?.predicate.node_id === predicate && pip.predicate_value.value.kind === "ref" && pip.predicate_value.value.target.node_id === child?.id);
    const presents = parentProjection?.pips.find((pip) => pip.predicate_value?.predicate.node_id === P.presents && pip.predicate_value.value.kind === "ref" && pip.predicate_value.value.target.node_id === childProjection?.id);
    if (!parent || !contains || !presents)
        throw new Error("Unknown child projection attachment");
    return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [
            { op: "remove", parent_path: [parent.id], pip_id: contains.id },
            { op: "remove", parent_path: [parentProjection.id], pip_id: presents.id },
        ] };
}
export function moveChild(input, graph) {
    const parent_projection = graphNodes(graph)[input.parentProjectionId], parent = parent_projection && observed(parent_projection, graph);
    const frame = input.frame;
    if (!parent || !graphNodes(graph)[input.childProjectionId] || !frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite))
        throw new Error("Invalid child projection frame");
    const presents = parent_projection.pips.find((pip) => pip.predicate_value?.predicate.node_id === P.presents && pip.predicate_value.value.kind === "ref" && pip.predicate_value.value.target.node_id === input.childProjectionId);
    if (!presents)
        throw new Error("Unknown child projection frame");
    const frame_pip = presents.pips.find((pip) => pip.predicate_value?.predicate.node_id === P.frame);
    if (!frame_pip)
        throw new Error(`Projection ${parent_projection.id} presents a child without a frame`);
    return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [{ op: "put", parent_path: [parent_projection.id], pip: {
                    ...presents, pips: presents.pips.map((pip) => pip.id === frame_pip.id ? { ...pip, predicate_value: { ...pip.predicate_value, value: { kind: "const", value: frame } } } : pip),
                } }] };
}
