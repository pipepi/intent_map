import { TRIGGER, bindingOf, flowInputs, flowOutputs, portMeta, targetBy, typeOf } from "./selectors.js";

const triggerKinds = new Set(["manual", "hook", "schedule", "poll", "custom"].map((name) => `relation.trigger.type.${name}`));
const ports = (node) => ({
  inputs: flowInputs(node).map((relation) => ({ ...portMeta(relation), nodeId: node.id })),
  outputs: flowOutputs(node).map((relation) => ({ ...portMeta(relation), nodeId: node.id })),
});

/** Flow data decorates the existing presents/frame tree; it never creates a second layout. */
export function projectFlow(observedNode, graph, items) {
  const childIds = new Set(items.map((item) => item.observedNodeId));
  const children = items.map((item) => ({ ...item, ...ports(graph.nodes[item.observedNodeId]) }));
  const edges = children.flatMap((child) => child.inputs.flatMap((input) => {
    const node = graph.nodes[child.observedNodeId], relation = node?.relations.find((item) => item.id === input.id), source = bindingOf(relation);
    if (source?.kind !== "ref") return [];
    if (source.target.nodeId !== observedNode.id && !childIds.has(source.target.nodeId)) return [];
    return [{ id: `${child.observedNodeId}:${input.id}`, source: source.target, target: { nodeId: child.observedNodeId, relationId: input.id } }];
  }));
  const outputs = flowOutputs(observedNode).flatMap((relation) => {
    const source = bindingOf(relation); return source?.kind === "ref" ? [{ id: `${observedNode.id}:${relation.id}`, source: source.target, target: { nodeId: observedNode.id, relationId: relation.id } }] : [];
  });
  const triggers = Object.values(graph.nodes).filter((node) => triggerKinds.has(typeOf(node)) && targetBy(node, TRIGGER.target)?.nodeId === observedNode.id)
    .map((node) => ({ id: node.id, kind: typeOf(node).split(".").at(-1) }));
  return { boundary: ports(observedNode), children, edges: [...edges, ...outputs], triggers };
}
