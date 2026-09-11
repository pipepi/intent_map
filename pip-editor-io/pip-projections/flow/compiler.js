import { graphNodes, graphRevision } from "../../../pip-editor/pip/pip-model.ts";
import { FLOW, bindingOf, constOf, flowChildren, flowInputs, flowOutputs, nestedBy, portMeta } from "./selectors.js";

const binding = (object) => !object ? undefined : object.kind === "ref" ? { target: object.target }
  : object.kind === "const" ? { value: object.value }
    : { op: object.op, args: object.args.map(binding) };
const ports = (pips, includeBinding) => pips.map((pip) => ({
  ...portMeta(pip), ...(includeBinding && bindingOf(pip) ? { binding: binding(bindingOf(pip)) } : {}),
  ...(constOf(nestedBy(pip, FLOW.delay)) === true ? { delayBoundary: true } : {}),
}));

function ranks(children) {
  const ids = new Set(children.map((item) => item.node.id)), dependencies = new Map(children.map((item) => [item.node.id, new Set()]));
  for (const child of children) for (const input of flowInputs(child.node)) {
    const source = bindingOf(input);
    if (source?.kind === "ref" && ids.has(source.target.node_id) && source.target.node_id !== child.node.id && constOf(nestedBy(input, FLOW.delay)) !== true) dependencies.get(child.node.id).add(source.target.node_id);
  }
  const result = new Map(), pending = new Set(ids); let rank = 0;
  while (pending.size) {
    const ready = [...pending].filter((id) => [...dependencies.get(id)].every((source) => result.has(source))).sort();
    if (!ready.length) throw new Error(`Flow cycle requires a delay boundary: ${[...pending].sort().join(", ")}`);
        ready.forEach((id) => { result.set(id, rank); pending.delete(id); });
        rank += 1;
    }
    return result;
}
function compileScope(node, graph, ancestors = new Set()) {
    if (ancestors.has(node.id))
        throw new Error(`Flow contains cycle reaches ${node.id}`);
    const nextAncestors = new Set(ancestors).add(node.id);
    const children = flowChildren(node).map((ref) => ({ ref, node: graphNodes(graph)[ref.node_id] })).filter((item) => item.node);
    const ranked = ranks(children);
    return {
        nodeId: node.id, inputs: ports(flowInputs(node), false), outputs: ports(flowOutputs(node), true),
        nodes: children.map(({ node }) => {
            const descendants = flowChildren(node);
            return {
                nodeId: node.id, rank: ranked.get(node.id) ?? 0,
                inputs: ports(flowInputs(node), true), outputs: ports(flowOutputs(node), false),
                ...(descendants.length ? { scope: compileScope(node, graph, nextAncestors) } : {}),
            };
        }),
    };
}
export const flowPlanner = {
    id: "pip.flow.planner",
    matches(node) { return flowInputs(node).length > 0 || flowOutputs(node).length > 0 || flowChildren(node).length > 0; },
    compile(node, graph) { return { plannerId: this.id, rootNodeId: node.id, graphRevision: graphRevision(graph), root: compileScope(node, graph) }; },
};
