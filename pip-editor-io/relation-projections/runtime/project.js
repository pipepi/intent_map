import { P, definitionId, isProjection, nameOf, observed, relationsBy, targetBy, targetOf } from "./selectors.js";
import { projectFlow } from "../flow/project.js";
import { flowInputs, flowOutputs, portMeta } from "../flow/selectors.js";

const objectValue = (relation, graph) => relation.object.kind === "const" ? relation.object.value
  : relation.object.kind === "ref" ? { nodeId: relation.object.target.nodeId, label: nameOf(graph.nodes[relation.object.target.nodeId]) }
    : { op: relation.object.op, args: relation.object.args.length };

export function projectProperties({ projectionNode, observedNode, context, graph }) {
  return {
    kind: "properties", projectionNodeId: projectionNode.id, observedNodeId: observedNode.id,
    compact: context.kind === "self-embedded", label: nameOf(observedNode),
    relations: observedNode.relations.filter(({ id }) => id !== "identity").map((relation) => ({
      id: relation.id, predicate: relation.predicate.nodeId, value: objectValue(relation, graph),
    })),
    flow: {
      inputs: flowInputs(observedNode).map((relation) => ({ ...portMeta(relation), nodeId: observedNode.id })),
      outputs: flowOutputs(observedNode).map((relation) => ({ ...portMeta(relation), nodeId: observedNode.id })),
    },
  };
}

const childrenData = (projectionNode, observedNode, graph) => {
  const items = relationsBy(projectionNode, P.presents).flatMap((relation) => {
    const projectionRef = targetOf(relation), childProjection = graph.nodes[projectionRef?.nodeId];
    const child = childProjection && observed(childProjection, graph);
    const nested = relation.relations.find((item) => item.predicate.nodeId === P.frame);
    const frame = nested?.object.kind === "const" ? nested.object.value : undefined;
    return childProjection && child && frame ? [{ projectionNodeId: childProjection.id, observedNodeId: child.id, parentProjectionNodeId: projectionNode.id, frame }] : [];
  });
  const childPredicates = new Set(Object.values(graph.nodes).filter((node) => isProjection(node) && definitionId(node) === "relation.projection.definition.contains")
    .map((node) => targetBy(node, P.childPredicate)?.nodeId).filter(Boolean));
  const parentIds = new Set();
  for (const node of Object.values(graph.nodes)) {
    if (isProjection(node)) continue;
    for (const relation of node.relations) if (childPredicates.has(relation.predicate.nodeId) && relation.object.kind === "ref") parentIds.add(relation.object.target.nodeId);
  }
  const candidates = Object.values(graph.nodes).filter((node) => isProjection(node) && definitionId(node) === "relation.projection.definition.properties")
    .flatMap((node) => {
      const child = observed(node, graph);
      return child && child.id !== observedNode.id && !parentIds.has(child.id) && !items.some((item) => item.observedNodeId === child.id)
        ? [{ projectionNodeId: node.id, observedNodeId: child.id, label: nameOf(child) }] : [];
    });
  return { kind: "children", projectionNodeId: projectionNode.id, observedNodeId: observedNode.id, label: nameOf(observedNode), items, candidates, flow: projectFlow(observedNode, graph, items) };
}

export function projectChildren({ projectionNode, observedNode, graph }) { return childrenData(projectionNode, observedNode, graph); }
export function projectFlowChildren({ projectionNode, observedNode, graph }) { return { ...childrenData(projectionNode, observedNode, graph), flowOnly: true }; }

export const projectionTarget = (projection, predicate, graph) => graph.nodes[targetBy(projection, predicate)?.nodeId];
