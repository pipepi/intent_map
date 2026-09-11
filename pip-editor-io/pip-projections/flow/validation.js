import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { FLOW, TRIGGER, bindingOf, constOf, flowChildren, flowInputs, flowOutputs, portMeta, pipBy, targetBy, typeOf } from "./selectors.js";

const triggerTypes = new Set(["manual", "hook", "schedule", "poll", "custom"].map((name) => `pip.trigger.type.${name}`));
const allPorts = (node) => [...flowInputs(node), ...flowOutputs(node)];
export function validateFlowGraph(graph) {
    const parents = new Map();
    for (const node of Object.values(graphNodes(graph)))
        for (const ref of flowChildren(node)) {
            if (!graphNodes(graph)[ref.node_id])
                throw new Error(`Flow child ${ref.node_id} is missing`);
            if (parents.has(ref.node_id) && parents.get(ref.node_id) !== node.id)
                throw new Error(`Flow node ${ref.node_id} has multiple parents`);
            parents.set(ref.node_id, node.id);
        }
    for (const node of Object.values(graphNodes(graph))) {
        const siblings = new Set(flowChildren(graphNodes(graph)[parents.get(node.id)])?.map((ref) => ref.node_id) ?? []);
        const children = new Set(flowChildren(node).map((ref) => ref.node_id));
        for (const port of allPorts(node)) {
            const meta = portMeta(port);
            if (meta.queueCapacity < 1 || meta.queueCapacity > 4096)
                throw new Error(`Port ${node.id}/${port.id} queue capacity is outside 1..4096`);
            const source = bindingOf(port);
            if (source?.kind !== "ref")
                continue;
            const parentId = parents.get(node.id), allowed = source.target.node_id === parentId || siblings.has(source.target.node_id);
            if (!allowed && flowInputs(node).includes(port))
                throw new Error(`Input ${node.id}/${port.id} crosses a container boundary`);
            if (flowOutputs(node).includes(port) && ![node.id, ...children].includes(source.target.node_id))
                throw new Error(`Output ${node.id}/${port.id} crosses a container boundary`);
            if (!graphNodes(graph)[source.target.node_id]?.pips.some((item) => item.id === source.target.pip_id))
                throw new Error(`Binding ${node.id}/${port.id} is dangling`);
        }
    }
    for (const trigger of Object.values(graphNodes(graph)).filter((node) => triggerTypes.has(typeOf(node)))) {
        const target = targetBy(trigger, TRIGGER.target), enabled = constOf(pipBy(trigger, TRIGGER.enabled));
        if (!target || !graphNodes(graph)[target.node_id])
            throw new Error(`Trigger ${trigger.id} has no valid target`);
        if (enabled !== undefined && typeof enabled !== "boolean")
            throw new Error(`Trigger ${trigger.id} enabled must be boolean`);
        const targetParent = parents.get(target.node_id), publicEntry = constOf(pipBy(graphNodes(graph)[target.node_id], FLOW.publicEntry));
        if (targetParent && publicEntry !== true)
            throw new Error(`Trigger ${trigger.id} targets a private child node`);
    }
    flowPlannerCheck(graph);
}
function flowPlannerCheck(graph) {
    for (const start of Object.values(graphNodes(graph))) {
        const seen = new Set([start.id]);
        let at = parentsFor(graph).get(start.id);
        while (at) {
            if (seen.has(at))
                throw new Error(`Flow contains cycle reaches ${at}`);
            seen.add(at);
            at = parentsFor(graph).get(at);
        }
    }
}
function parentsFor(graph) {
    const result = new Map();
    for (const node of Object.values(graphNodes(graph)))
        for (const child of flowChildren(node))
            result.set(child.node_id, node.id);
    return result;
}
