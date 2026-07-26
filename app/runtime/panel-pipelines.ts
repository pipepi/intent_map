import type {
  Expression,
  IntentNode,
  PanelInstance,
  SurfaceInstance,
} from "./model";

export type PanelPipelinePoint = {
  x: number;
  y: number;
  boundary?: "left" | "right";
};

export type PanelPipelineEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  sourceSurfaceId?: string;
  source: PanelPipelinePoint;
  targetNodeId: string;
  targetPortId: string;
  targetSurfaceId?: string;
  target: PanelPipelinePoint;
  channel: "data" | "event";
};

const collectReferences = (
  expression?: Expression,
): Array<Extract<Expression, { kind: "ref" }>> => {
  if (!expression) return [];
  if (expression.kind === "ref") return [expression];
  if (expression.kind === "op") {
    return expression.args.flatMap(collectReferences);
  }
  return [];
};

export type NodeBindingEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  channel: "data" | "event";
};

export const deriveNodeBindingEdges = (
  scope: IntentNode,
): NodeBindingEdge[] =>
  (scope.children ?? []).flatMap((targetNode) =>
    targetNode.inputs.flatMap((input) =>
      collectReferences(input.binding)
        .filter((reference) => Boolean(reference.nodeId))
        .map((reference, index) => ({
          id: `${reference.nodeId}:${reference.portId}>${targetNode.id}:${input.id}:${index}`,
          sourceNodeId: reference.nodeId!,
          sourcePortId: reference.portId,
          targetNodeId: targetNode.id,
          targetPortId: input.id,
          channel: input.channel ?? "data",
        })),
    ),
  );

const surfaceCenter = (surface: SurfaceInstance) => ({
  x: surface.frame.x + surface.frame.width / 2,
  y: surface.frame.y + surface.frame.height / 2,
});

const portAnchor = (
  surface: SurfaceInstance,
  side: "input" | "output",
  index: number,
): PanelPipelinePoint => ({
  x:
    side === "input"
      ? surface.frame.x
      : surface.frame.x + surface.frame.width,
  y:
    surface.frame.y +
    Math.min(
      surface.frame.height - 0.025,
      0.055 + Math.max(0, index) * 0.028,
    ),
});

const squaredDistance = (
  left: SurfaceInstance,
  right: SurfaceInstance,
) => {
  const a = surfaceCenter(left);
  const b = surfaceCenter(right);
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
};

const surfacesForNode = (panel: PanelInstance, nodeId: string) =>
  panel.surfaces.filter(
    (surface) =>
      (surface.kind === "feature-panel"
        ? surface.featureNodeId
        : "current_container") === nodeId,
  );

export const derivePanelPipelineEdges = (
  root: IntentNode,
  panel: PanelInstance,
): PanelPipelineEdge[] => {
  const rootNodes = new Map(
    (root.children ?? []).map((node) => [node.id, node]),
  );
  const edges: PanelPipelineEdge[] = [];
  for (const binding of deriveNodeBindingEdges(root)) {
    const sourceNode = rootNodes.get(binding.sourceNodeId);
    const targetNode = rootNodes.get(binding.targetNodeId);
    if (!sourceNode || !targetNode) continue;
    const sourcePortIndex = sourceNode.outputs.findIndex(
      (output) => output.id === binding.sourcePortId,
    );
    const targetPortIndex = targetNode.inputs.findIndex(
      (input) => input.id === binding.targetPortId,
    );
    const sourceSurfaces = surfacesForNode(panel, sourceNode.id);
    const targetSurfaces = surfacesForNode(panel, targetNode.id);
    if (targetSurfaces.length) {
      for (const targetSurface of targetSurfaces) {
        const sourceSurface = sourceSurfaces
          .slice()
          .sort(
            (left, right) =>
              squaredDistance(left, targetSurface) -
                squaredDistance(right, targetSurface) ||
              left.id.localeCompare(right.id),
          )[0];
        edges.push({
          ...binding,
          id: `${binding.id}:${targetSurface.id}`,
          sourceSurfaceId: sourceSurface?.id,
          source: sourceSurface
            ? portAnchor(sourceSurface, "output", sourcePortIndex)
            : {
                x: 0,
                y: surfaceCenter(targetSurface).y,
                boundary: "left",
              },
          targetSurfaceId: targetSurface.id,
          target: portAnchor(targetSurface, "input", targetPortIndex),
        });
      }
      continue;
    }
    for (const sourceSurface of sourceSurfaces) {
      edges.push({
        ...binding,
        id: `${binding.id}:${sourceSurface.id}`,
        sourceSurfaceId: sourceSurface.id,
        source: portAnchor(sourceSurface, "output", sourcePortIndex),
        target: {
          x: 1,
          y: surfaceCenter(sourceSurface).y,
          boundary: "right",
        },
      });
    }
  }
  return edges.sort((left, right) => left.id.localeCompare(right.id));
};
