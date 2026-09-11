import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { P, definitionId, isProjection, nameOf, observed, pipsBy, targetBy, targetOf } from "./selectors.js";
import { projectFlow } from "../flow/project.js";
import { flowInputs, flowOutputs, portMeta } from "../flow/selectors.js";

const objectValue = (pip, graph) => !pip.predicate_value ? null : pip.predicate_value.value.kind === "const" ? pip.predicate_value.value.value
  : pip.predicate_value.value.kind === "ref" ? { nodeId: pip.predicate_value.value.target.node_id, label: nameOf(graphNodes(graph)[pip.predicate_value.value.target.node_id]) }
    : { op: pip.predicate_value.value.op, args: pip.predicate_value.value.args.length };

export function projectProperties({ projectionNode, observedNode, context, graph }) {
  return {
    kind: "properties", projectionNodeId: projectionNode.id, observedNodeId: observedNode.id,
    compact: context.kind === "self-embedded", label: nameOf(observedNode),
    pips: observedNode.pips.filter(({ id, predicate_value }) => id !== "identity" && predicate_value).map((pip) => ({
      id: pip.id, predicate: pip.predicate_value?.predicate.node_id, value: objectValue(pip, graph),
    })),
    flow: {
      inputs: flowInputs(observedNode).map((pip) => ({ ...portMeta(pip), nodeId: observedNode.id })),
      outputs: flowOutputs(observedNode).map((pip) => ({ ...portMeta(pip), nodeId: observedNode.id })),
    },
  };
}

const childrenData = (projectionNode, observedNode, graph) => {
  const items = pipsBy(projectionNode, P.presents).flatMap((pip) => {
    const projectionRef = targetOf(pip), childProjection = graphNodes(graph)[projectionRef?.node_id];
    const child = childProjection && observed(childProjection, graph);
    const nested = pip.pips.find((item) => item.predicate_value?.predicate.node_id === P.frame);
    const frame = nested?.predicate_value?.value.kind === "const" ? nested.predicate_value.value.value : undefined;
    return childProjection && child && frame ? [{ projectionNodeId: childProjection.id, observedNodeId: child.id, parentProjectionNodeId: projectionNode.id, frame }] : [];
  });
  const childPredicates = new Set(Object.values(graphNodes(graph)).filter((node) => isProjection(node) && definitionId(node) === "pip.projection.definition.contains")
    .map((node) => targetBy(node, P.childPredicate)?.node_id).filter(Boolean));
  const parentIds = new Set();
  for (const node of Object.values(graphNodes(graph))) {
    if (isProjection(node)) continue;
    for (const pip of node.pips) if (childPredicates.has(pip.predicate_value?.predicate.node_id) && pip.predicate_value.value.kind === "ref") parentIds.add(pip.predicate_value.value.target.node_id);
  }
  const candidates = Object.values(graphNodes(graph)).filter((node) => isProjection(node) && definitionId(node) === "pip.projection.definition.properties")
    .flatMap((node) => {
      const child = observed(node, graph);
      return child && child.id !== observedNode.id && !parentIds.has(child.id) && !items.some((item) => item.observedNodeId === child.id)
        ? [{ projectionNodeId: node.id, observedNodeId: child.id, label: nameOf(child) }] : [];
    });
  return { kind: "children", projectionNodeId: projectionNode.id, observedNodeId: observedNode.id, label: nameOf(observedNode), items, candidates, flow: projectFlow(observedNode, graph, items) };
};
export function projectChildren({ projectionNode, observedNode, graph }) { return childrenData(projectionNode, observedNode, graph); }
export function projectFlowChildren({ projectionNode, observedNode, graph }) { return { ...childrenData(projectionNode, observedNode, graph), flowOnly: true }; }

export const projectionTarget = (projection, predicate, graph) => graphNodes(graph)[targetBy(projection, predicate)?.node_id];
