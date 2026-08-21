import type { JsonValue, RelationGraph, RelationNode } from "../../relation/model.ts";
import type { ElementPluginRegistry } from "./element-runtime";
import { assertJsonValue } from "./json-validation.ts";
import type { NodeTypePluginRegistry } from "./node-type-runtime";

export function resolveNodePresentation(
  node: RelationNode,
  graph: RelationGraph,
  elements: ElementPluginRegistry,
  nodeTypes: NodeTypePluginRegistry,
  purpose: "node" | "workspace" = "node",
  projectionInput?: { workspaceId: string; rootNodeIds: string[] },
) {
  const matches = [];
  for (const candidate of nodeTypes.projections()) {
    if (candidate.purpose !== purpose) continue;
    try {
      if (candidate.matches(node, graph)) matches.push(candidate);
    } catch (error) {
      return { error: error instanceof Error ? error.message : `Projection ${candidate.id} matching failed` };
    }
  }
  if (matches.length > 1) return { error: `Ambiguous ${purpose} projections: ${matches.map(({ id }) => id).join(", ")}` };
  const projection = matches[0];
  const type = nodeTypes.types().find((candidate) => candidate.matches?.(node, graph));
  const elementRef = projection?.element ?? (purpose === "node" ? type?.element : undefined);
  let projectionData: JsonValue | undefined;
  if (projection?.project) {
    try {
      projectionData = projection.project({
        workspaceId: projectionInput?.workspaceId ?? "unknown",
        rootNodeIds: projectionInput?.rootNodeIds ?? [], graph, node,
      });
      assertJsonValue(projectionData, `Projection ${projection.id} data`);
      projectionData = structuredClone(projectionData);
    } catch (error) {
      return { type, projection, error: error instanceof Error ? error.message : `Projection ${projection.id} failed` };
    }
  }
  return {
    type, projection, projectionData,
    declaration: elementRef ? elements.resolve(elementRef.pluginId, elementRef.elementId) : undefined,
  };
}
