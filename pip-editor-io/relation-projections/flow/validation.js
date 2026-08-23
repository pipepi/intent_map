import { FLOW, TRIGGER, bindingOf, constOf, flowChildren, flowInputs, flowOutputs, portMeta, relationBy, targetBy, typeOf } from "./selectors.js";

const triggerTypes = new Set(["manual", "hook", "schedule", "poll", "custom"].map((name) => `relation.trigger.type.${name}`));
const allPorts = (node) => [...flowInputs(node), ...flowOutputs(node)];

export function validateFlowGraph(graph) {
  const parents = new Map();
  for (const node of Object.values(graph.nodes)) for (const ref of flowChildren(node)) {
    if (!graph.nodes[ref.nodeId]) throw new Error(`Flow child ${ref.nodeId} is missing`);
    if (parents.has(ref.nodeId) && parents.get(ref.nodeId) !== node.id) throw new Error(`Flow node ${ref.nodeId} has multiple parents`);
    parents.set(ref.nodeId, node.id);
  }
  for (const node of Object.values(graph.nodes)) {
    const siblings = new Set(flowChildren(graph.nodes[parents.get(node.id)])?.map((ref) => ref.nodeId) ?? []);
    const children = new Set(flowChildren(node).map((ref) => ref.nodeId));
    for (const port of allPorts(node)) {
      const meta = portMeta(port);
      if (meta.queueCapacity < 1 || meta.queueCapacity > 4096) throw new Error(`Port ${node.id}/${port.id} queue capacity is outside 1..4096`);
      const source = bindingOf(port);
      if (source?.kind !== "ref") continue;
      const parentId = parents.get(node.id), allowed = source.target.nodeId === parentId || siblings.has(source.target.nodeId);
      if (!allowed && flowInputs(node).includes(port)) throw new Error(`Input ${node.id}/${port.id} crosses a container boundary`);
      if (flowOutputs(node).includes(port) && ![node.id, ...children].includes(source.target.nodeId)) throw new Error(`Output ${node.id}/${port.id} crosses a container boundary`);
      if (!graph.nodes[source.target.nodeId]?.relations.some((item) => item.id === source.target.relationId)) throw new Error(`Binding ${node.id}/${port.id} is dangling`);
    }
  }
  for (const trigger of Object.values(graph.nodes).filter((node) => triggerTypes.has(typeOf(node)))) {
    const target = targetBy(trigger, TRIGGER.target), enabled = constOf(relationBy(trigger, TRIGGER.enabled));
    if (!target || !graph.nodes[target.nodeId]) throw new Error(`Trigger ${trigger.id} has no valid target`);
    if (enabled !== undefined && typeof enabled !== "boolean") throw new Error(`Trigger ${trigger.id} enabled must be boolean`);
    const targetParent = parents.get(target.nodeId), publicEntry = constOf(relationBy(graph.nodes[target.nodeId], FLOW.publicEntry));
    if (targetParent && publicEntry !== true) throw new Error(`Trigger ${trigger.id} targets a private child node`);
  }
  flowPlannerCheck(graph);
}

function flowPlannerCheck(graph) {
  for (const start of Object.values(graph.nodes)) {
    const seen = new Set([start.id]); let at = parentsFor(graph).get(start.id);
    while (at) { if (seen.has(at)) throw new Error(`Flow contains cycle reaches ${at}`); seen.add(at); at = parentsFor(graph).get(at); }
  }
}
function parentsFor(graph) {
  const result = new Map();
  for (const node of Object.values(graph.nodes)) for (const child of flowChildren(node)) result.set(child.nodeId, node.id);
  return result;
}
