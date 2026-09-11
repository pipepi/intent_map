import { graphNodes } from "../../pip/pip-model.ts";
import type { Pip } from "../../pip/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ProjectionNavigationState, ProjectionRouteEntry } from "../contracts/package-types.ts";
import { currentRoute, initialNavigation } from "./projection-navigation.ts";
import { PROJECTION, observationScope, observedNode, presentedProjections, projectionForInstance, targetByPredicate } from "./projection-instance.ts";

export function routeForProjection(projectionNodeId: string, graph: Pip, nodeTypes: NodeTypePluginRegistry, enteredFrom?: ProjectionRouteEntry["enteredFrom"]): ProjectionRouteEntry | undefined {
  const node = graphNodes(graph)[projectionNodeId], observed = node && observedNode(node, graph), definition = node && projectionForInstance(node, nodeTypes.projections());
  if (!node || !observed || !definition) return;
  return { projectionNodeId, observedNodeId: observed.id, scope: observationScope(definition), enteredFrom };
}

export function navigationForRoot(rootNodeId: string, graph: Pip, nodeTypes: NodeTypePluginRegistry, current?: ProjectionNavigationState) {
  if (current?.entries.length && current.index < current.entries.length) return current;
  const route = routeForProjection(rootNodeId, graph, nodeTypes);
  return route ? initialNavigation(route) : undefined;
}

export function forwardRoute(state: ProjectionNavigationState, graph: Pip, nodeTypes: NodeTypePluginRegistry, focusedProjectionId?: string, selectedNodeId?: string) {
  const route = currentRoute(state), node = graphNodes(graph)[route.projectionNodeId]; if (!node) return;
  if (route.scope === "self") {
    const target = targetByPredicate(node, PROJECTION.divesInto)?.node_id;
    return target ? routeForProjection(target, graph, nodeTypes) : undefined;
  }
  const items = presentedProjections(node, graph);
  const item = items.find(({ projectionNodeId }) => projectionNodeId === focusedProjectionId)
    ?? items.find(({ observedNodeId }) => observedNodeId === selectedNodeId);
  return item && routeForProjection(item.projectionNodeId, graph, nodeTypes, {
    parentInternalProjectionId: node.id, childProjectionId: item.projectionNodeId,
  });
}

export function projectionOptions(observedNodeId: string, graph: Pip, nodeTypes: NodeTypePluginRegistry) {
  return Object.values(graphNodes(graph)).flatMap((node) => {
    const observed = observedNode(node, graph), projection = projectionForInstance(node, nodeTypes.projections());
    if (observed?.id !== observedNodeId || !projection) return [];
    return projection.surfaces?.includes("workspace")
      ? [{ projectionNodeId: node.id, scope: observationScope(projection), label: `${projection.icon ? `${projection.icon} ` : ""}${projection.name ?? projection.id}` }]
            : [];
    });
}
