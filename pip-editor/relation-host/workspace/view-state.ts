import type { JsonValue } from "../../relation/index.ts";
import type { WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";

export type SystemWorkspaceWindow = { id: string; type: "plugin-manager"; frame: WorkspaceWindowFrame };
export type FreeLayoutWorkspaceViews = {
  kind: "free-layout";
  world: { width: number; height: number };
  camera: { scale: number; x: number; y: number };
  projections: Record<string, WorkspaceWindowFrame>;
  systemWindows: Record<string, SystemWorkspaceWindow>;
  activeWindowId?: string;
};

const DEFAULT_WORLD = { width: 2600, height: 1600 };
const DEFAULT_CAMERA = { scale: 1, x: 0, y: 0 };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export const defaultFrame = (index = 0): WorkspaceWindowFrame => ({
  x: 80 + index % 2 * 1240, y: 80 + Math.floor(index / 2) * 800, width: 1120, height: 720, resizeMode: "simple", contentScale: 1,
});

export function assertWorkspaceFrame(value: unknown, world = DEFAULT_WORLD): asserts value is WorkspaceWindowFrame {
  const item = record(value);
  if (!item || !finite(item.x) || !finite(item.y) || !finite(item.width) || !finite(item.height) || !["simple", "full"].includes(String(item.resizeMode))) {
    throw new Error("Workspace window frame is invalid");
  }
  if (item.width < 560 || item.height < 420 || item.width > 1800 || item.height > 1200) throw new Error("Workspace window size is outside supported bounds");
  if (item.contentScale !== undefined && (!finite(item.contentScale) || item.contentScale < .5 || item.contentScale > 2)) throw new Error("Workspace content scale is outside supported bounds");
  if (item.x < 0 || item.y < 0 || item.x + item.width > world.width || item.y + item.height > world.height) throw new Error("Workspace window is outside the world");
}

export function normalizeFreeLayout(value: JsonValue, rootNodeIds: string[]): FreeLayoutWorkspaceViews {
  const source = record(value), free = source?.kind === "free-layout";
  const worldValue = free ? record(source.world) : undefined;
  const world = worldValue && finite(worldValue.width) && finite(worldValue.height) && worldValue.width >= 560 && worldValue.height >= 420 ? { width: worldValue.width, height: worldValue.height } : { ...DEFAULT_WORLD };
  const cameraValue = free ? record(source.camera) : undefined;
  const camera = cameraValue && finite(cameraValue.scale) && finite(cameraValue.x) && finite(cameraValue.y)
    ? { scale: Math.min(2, Math.max(.5, cameraValue.scale)), x: Math.min(0, cameraValue.x), y: Math.min(0, cameraValue.y) } : { ...DEFAULT_CAMERA };
  const projectionValue = free ? record(source.projections) : undefined;
  const projections: Record<string, WorkspaceWindowFrame> = {};
  rootNodeIds.forEach((id, index) => {
    const candidate = projectionValue?.[id];
    try { assertWorkspaceFrame(candidate, world); projections[id] = structuredClone(candidate as WorkspaceWindowFrame); }
    catch { projections[id] = defaultFrame(index); }
  });
  const systemWindows: Record<string, SystemWorkspaceWindow> = {};
  const systems = record(source?.systemWindows);
  for (const [id, raw] of Object.entries(systems ?? {})) {
    const item = record(raw);
    try {
      if (item?.type !== "plugin-manager") continue;
      assertWorkspaceFrame(item.frame, world);
      systemWindows[id] = { id, type: "plugin-manager", frame: structuredClone(item.frame as WorkspaceWindowFrame) };
    } catch { continue; }
  }
  const activeWindowId = typeof source?.activeWindowId === "string" && (projections[source.activeWindowId] || systemWindows[source.activeWindowId])
    ? source.activeWindowId : undefined;
  return { kind: "free-layout", world, camera, projections, systemWindows, activeWindowId };
}

export const exportedWorkspaceViews = (value: JsonValue): JsonValue => {
  const source = record(structuredClone(value));
  if (source) {
    source.systemWindows = {};
    const projections = record(source.projections);
    if (typeof source.activeWindowId === "string" && !projections?.[source.activeWindowId]) delete source.activeWindowId;
  }
  return (source ?? value) as JsonValue;
};

export const withSystemWindows = (value: JsonValue, systemWindows: Record<string, SystemWorkspaceWindow>, activeWindowId?: string): JsonValue => {
  const source = record(structuredClone(value)) ?? {};
  source.systemWindows = structuredClone(systemWindows);
  if (activeWindowId) source.activeWindowId = activeWindowId;
  else delete source.activeWindowId;
  return source as JsonValue;
};

export const preserveSystemWindows = (value: JsonValue, previous: JsonValue, previousRootNodeIds: string[]): JsonValue => {
  const local = normalizeFreeLayout(previous, previousRootNodeIds);
  const activeWindowId = local.activeWindowId && local.systemWindows[local.activeWindowId] ? local.activeWindowId : undefined;
  return withSystemWindows(value, local.systemWindows, activeWindowId);
};

export const screenToWorld = (point: WorkspacePoint, views: FreeLayoutWorkspaceViews): WorkspacePoint => ({
  x: (point.x - views.camera.x) / views.camera.scale,
  y: (point.y - views.camera.y) / views.camera.scale,
});
