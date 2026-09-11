import { PipForkLevel } from "../../../pip-editor/pip/types.ts";
import { graphNodes, graphRevision } from "../../../pip-editor/pip/pip-model.ts";
import { FLOW, flowInputs, flowOutputs } from "./selectors.js";

const object = (input) => input && typeof input === "object" && !Array.isArray(input) ? input : {};
const bindingPip = (target_pip_id, sourceNodeId, source_pip_id) => ({
  id: `binding:${target_pip_id}`,
    fork_level: PipForkLevel.PIPE,
    predicate_value: { predicate: { node_id: FLOW.binding, pip_id: "identity" }, value: { kind: "ref", target: { node_id: sourceNodeId, pip_id: source_pip_id } } },
    pips: []
});
export function connectFlow(input, graph) {
    const value = object(input), node = graphNodes(graph)[value.targetNodeId], pip = node?.pips.find((item) => item.id === value.target_pip_id);
    if (!node || !pip || ![...flowInputs(node), ...flowOutputs(node)].includes(pip))
        throw new Error("Flow target must be a consumer input or composite output port");
    const source = graphNodes(graph)[value.sourceNodeId]?.pips.find((item) => item.id === value.source_pip_id);
    if (!source)
        throw new Error("Flow source port does not exist");
    return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [{ op: "put", parent_path: [node.id], pip: {
                    ...pip, pips: [...pip.pips.filter((item) => item.predicate_value?.predicate.node_id !== FLOW.binding), bindingPip(pip.id, value.sourceNodeId, value.source_pip_id)],
                } }] };
}
export function disconnectFlow(input, graph) {
    const value = object(input), node = graphNodes(graph)[value.targetNodeId], pip = node?.pips.find((item) => item.id === value.target_pip_id);
    if (!node || !pip || ![...flowInputs(node), ...flowOutputs(node)].includes(pip))
        throw new Error("Flow target must be a consumer input or composite output port");
    return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [{ op: "put", parent_path: [node.id], pip: {
                    ...pip, pips: pip.pips.filter((item) => item.predicate_value?.predicate.node_id !== FLOW.binding),
                } }] };
}
