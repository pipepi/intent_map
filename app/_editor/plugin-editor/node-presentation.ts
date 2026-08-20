import type { RelationGraph, RelationNode } from "../../relation/model";
import type { ElementPluginRegistry } from "./element-runtime";
import type { NodeTypePluginRegistry } from "./node-type-runtime";

export function resolveNodePresentation(
  node: RelationNode,
  graph: RelationGraph,
  elements: ElementPluginRegistry,
  nodeTypes: NodeTypePluginRegistry,
) {
  const projection = nodeTypes.projections().find((candidate) => candidate.matches(node, graph));
  const type = nodeTypes.types().find((candidate) => candidate.matches?.(node, graph));
  const elementRef = projection?.element ?? type?.element;
  return {
    type,
    declaration: elementRef ? elements.resolve(elementRef.pluginId, elementRef.elementId) : undefined,
  };
}
