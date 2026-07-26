import type {
  ContainerSurface,
  IntentNode,
  NodeProjectionLayout,
  ScopeAddress,
  ScopeProjectionState,
  SurfaceInstance,
} from "./model";

export const PROJECTION_LOD_THRESHOLD = 0.55;

export type {
  NodeProjectionFrame,
  NodeProjectionLayout,
  ScopeProjectionState,
} from "./model";

export const scopeProjectionKey = (
  scope: Pick<ScopeAddress, "domain" | "nodeId">,
) => `${scope.domain}:${scope.nodeId}`;

export const defaultNodeProjectionLayout = (
  node: IntentNode,
): NodeProjectionLayout => ({
  frame: {
    x: node.position.x,
    y: node.position.y,
    width: node.size?.width ?? 320,
    height: node.size?.height ?? 220,
  },
  displayMode: node.displayMode ?? "expanded",
  resizeMode: node.resizeMode ?? "simple",
});

export const nodeProjectionLayout = (
  node: IntentNode,
  projection?: ScopeProjectionState,
): NodeProjectionLayout =>
  projection?.nodeLayouts[node.id] ?? defaultNodeProjectionLayout(node);

export const projectNode = (
  node: IntentNode,
  projection?: ScopeProjectionState,
): IntentNode => {
  const layout = nodeProjectionLayout(node, projection);
  return {
    ...node,
    position: { x: layout.frame.x, y: layout.frame.y },
    size: { width: layout.frame.width, height: layout.frame.height },
    displayMode: layout.displayMode,
    resizeMode: layout.resizeMode,
  };
};

export const projectIntentTree = (
  root: IntentNode,
  businessRootId: string,
  projections: ContainerSurface["projections"],
): IntentNode => {
  const visit = (node: IntentNode, domain: ScopeAddress["domain"]): IntentNode => {
    const nodeDomain =
      domain === "business" || node.id === businessRootId ? "business" : "app";
    const projection = projections[`${nodeDomain}:${node.id}`];
    return {
      ...node,
      children: node.children?.map((child) =>
        visit(projectNode(child, projection), nodeDomain),
      ),
    };
  };
  return visit(root, "app");
};

export const surfaceProjectionNodeId = (
  surface: SurfaceInstance,
): string =>
  surface.kind === "feature-panel"
    ? surface.featureNodeId
    : "current_container";

export const projectionUsesSummary = (
  scale: number,
  options: { active?: boolean; alwaysLive?: boolean } = {},
) =>
  scale < PROJECTION_LOD_THRESHOLD &&
  !options.active &&
  !options.alwaysLive;
