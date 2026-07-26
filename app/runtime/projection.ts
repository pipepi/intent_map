import type {
  IntentNode,
  NodeProjectionLayout,
  ScopeAddress,
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
