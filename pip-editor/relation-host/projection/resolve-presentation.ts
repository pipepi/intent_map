/** Resolves explicit projection instances first and keeps the purpose ABI as a compatibility path. */
import type { JsonValue, RelationGraph, RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ProjectionContext, RelationProjection, ResolvedNodeType } from "../contracts/package-types.ts";
import { assertJsonValue } from "../contracts/json-validation.ts";
import { assertProjectionContext } from "./projection-context.ts";
import { observedNode, projectionForInstance } from "./projection-instance.ts";

type ProjectionInput = { workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; selection: string[]; projectionContext?: ProjectionContext };

export function resolveNodePresentation(
  node: RelationNode, graph: RelationGraph, elements: ElementPluginRegistry, nodeTypes: NodeTypePluginRegistry,
  purpose: "node" | "workspace" = "node", input?: ProjectionInput,
) {
  const explicit = projectionForInstance(node, nodeTypes.projections());
  if (explicit) return resolveExplicit(node, explicit, graph, elements, nodeTypes, input);
  const matches: RelationProjection[] = [];
  for (const candidate of nodeTypes.projections()) {
    if (candidate.definition || candidate.purpose !== purpose) continue;
    try { if (candidate.matches(node, graph)) matches.push(candidate); }
    catch (error) { return failed(node, error instanceof Error ? error.message : `Projection ${candidate.id} matching failed`); }
  }
  if (matches.length > 1) return failed(node, `Ambiguous ${purpose} projections: ${matches.map(({ id }) => id).join(", ")}`);
  const projection = matches[0], type = nodeTypes.types().find((candidate) => candidate.matches?.(node, graph));
  const elementRef = projection?.element ?? (purpose === "node" ? type?.element : undefined);
  return project(projection, node, node, graph, elements, type, elementRef, input, { kind: "self-workspace" });
}

function resolveExplicit(
  projectionNode: RelationNode, projection: RelationProjection, graph: RelationGraph,
  elements: ElementPluginRegistry, nodeTypes: NodeTypePluginRegistry, input?: ProjectionInput,
) {
  const observed = observedNode(projectionNode, graph);
  if (!observed) return { ...failed(projectionNode, `Projection ${projectionNode.id} observes a missing RelationNode`), projection };
  const context = input?.projectionContext ?? { kind: "self-workspace" as const };
  try { assertProjectionContext(projection, context); }
  catch (error) { return { ...failed(projectionNode, error instanceof Error ? error.message : "Projection context is invalid"), projection }; }
  const type = nodeTypes.types().find((candidate) => candidate.matches?.(observed, graph));
  return project(projection, projectionNode, observed, graph, elements, type, projection.element, input, context);
}

const failed = (node: RelationNode, error: string) => ({
  type: undefined, projection: undefined, observed: node, context: { kind: "self-workspace" as const },
  projectionData: undefined, declaration: undefined, error,
});

function project(
  projection: RelationProjection | undefined, projectionNode: RelationNode, observed: RelationNode, graph: RelationGraph,
  elements: ElementPluginRegistry, type: ResolvedNodeType | undefined, elementRef: { pluginId: string; elementId: string } | undefined,
  input: ProjectionInput | undefined, context: ProjectionContext,
) {
  let projectionData: JsonValue | undefined;
  if (projection?.project) try {
    projectionData = projection.project({
      workspaceId: input?.workspaceId ?? "unknown", rootNodeIds: input?.rootNodeIds ?? [], workspaceView: input?.workspaceView ?? null,
      selection: input?.selection ?? [], graph, node: projectionNode, projectionNode, observedNode: observed, context,
    });
    assertJsonValue(projectionData, `Projection ${projection.id} data`); projectionData = structuredClone(projectionData);
  } catch (error) { return { type, projection, observed, context, projectionData: undefined, declaration: undefined, error: error instanceof Error ? error.message : `Projection ${projection.id} failed` }; }
  return { type, projection, observed, context, projectionData, declaration: elementRef ? elements.resolve(elementRef.pluginId, elementRef.elementId) : undefined };
}
