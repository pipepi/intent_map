/** Resolves one purpose-scoped projection and computes JSON presentation data from a graph snapshot. */
import type { JsonValue, RelationGraph, RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import { assertJsonValue } from "../contracts/json-validation.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";

export function resolveNodePresentation(
  node: RelationNode,
  graph: RelationGraph,
  elements: ElementPluginRegistry,
  nodeTypes: NodeTypePluginRegistry,
  purpose: "node" | "workspace" = "node",
  projectionInput?: { workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; selection: string[] },
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
        rootNodeIds: projectionInput?.rootNodeIds ?? [],
        workspaceView: projectionInput?.workspaceView ?? null,
        selection: projectionInput?.selection ?? [], graph, node,
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
