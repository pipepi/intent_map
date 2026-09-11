import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { TRIGGER, bindingOf, flowInputs, flowOutputs, portMeta, targetBy, typeOf } from "./selectors.js";

const triggerKinds = new Set(["manual", "hook", "schedule", "poll", "custom"].map((name) => `pip.trigger.type.${name}`));
const ports = (node) => ({
  inputs: flowInputs(node).map((pip) => ({ ...portMeta(pip), nodeId: node.id })),
  outputs: flowOutputs(node).map((pip) => ({ ...portMeta(pip), nodeId: node.id })),
});
/** Flow data decorates the existing presents/frame tree; it never creates a second layout. */
export function projectFlow(observedNode, graph, items) {
    const childIds = new Set(items.map((item) => item.observedNodeId));
    const children = items.map((item) => ({ ...item, ...ports(graphNodes(graph)[item.observedNodeId]) }));
    const edges = children.flatMap((child) => child.inputs.flatMap((input) => {
        const node = graphNodes(graph)[child.observedNodeId], pip = node?.pips.find((item) => item.id === input.id), source = bindingOf(pip);
        if (source?.kind !== "ref")
            return [];
        if (source.target.node_id !== observedNode.id && !childIds.has(source.target.node_id))
            return [];
        return [{ id: `${child.observedNodeId}:${input.id}`, source: source.target, target: { node_id: child.observedNodeId, pip_id: input.id } }];
    }));
    const outputs = flowOutputs(observedNode).flatMap((pip) => {
        const source = bindingOf(pip);
        return source?.kind === "ref" ? [{ id: `${observedNode.id}:${pip.id}`, source: source.target, target: { node_id: observedNode.id, pip_id: pip.id } }] : [];
    });
    const triggers = Object.values(graphNodes(graph)).filter((node) => triggerKinds.has(typeOf(node)) && targetBy(node, TRIGGER.target)?.node_id === observedNode.id)
        .map((node) => ({ id: node.id, kind: typeOf(node).split(".").at(-1) }));
    return { boundary: ports(observedNode), children, edges: [...edges, ...outputs], triggers };
}
