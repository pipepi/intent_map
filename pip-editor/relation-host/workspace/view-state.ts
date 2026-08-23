import type { JsonValue } from "../../relation/index.ts";
import type { ProjectionExecutionViewState, WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import { exportedNavigation } from "../projection/projection-navigation.ts";

export type SystemWorkspaceWindow = { id: string; type: "plugin-manager"; frame: WorkspaceWindowFrame };
export type FreeLayoutWorkspaceViews = {
  kind: "free-layout";
  world: { width: number; height: number };
  camera: { scale: number; x: number; y: number };
  projections: Record<string, WorkspaceWindowFrame>;
  systemWindows: Record<string, SystemWorkspaceWindow>;
  activeWindowId?: string;
  frontWindowId?: string;
};

const DEFAULT_WORLD = { width: 2600, height: 1600 };
const DEFAULT_CAMERA = { scale: 1, x: 0, y: 0 };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export const defaultFrame = (index = 0): WorkspaceWindowFrame => ({
  x: 80 + index % 2 * 1240, y: 80 + Math.floor(index / 2) * 800, width: 1120, height: 720, resizeMode: "simple", contentScale: 1,
  execution: { flowLayerVisible: true, followActiveEvent: false },
});

export const normalizeExecutionView = (value: unknown): ProjectionExecutionViewState => {
  const item = record(value);
  return {
    ...(typeof item?.sessionId === "string" ? { sessionId: item.sessionId } : {}),
    ...(typeof item?.lineageId === "string" ? { lineageId: item.lineageId } : {}),
    ...(Number.isInteger(item?.generation) ? { generation: Number(item?.generation) } : {}),
    ...(Number.isInteger(item?.traceCursor) ? { traceCursor: Number(item?.traceCursor) } : {}),
    flowLayerVisible: item?.flowLayerVisible !== false,
    followActiveEvent: item?.followActiveEvent === true,
  };
};

export const panWindowContent = (frame: WorkspaceWindowFrame, delta: WorkspacePoint): WorkspaceWindowFrame => {
  const current = frame.contentOffset ?? { x: 0, y: 0 };
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return { ...frame, contentOffset: { x: clamp(current.x - delta.x, frame.width), y: clamp(current.y - delta.y, frame.height) } };
};

/** Keeps the world coordinate under the pointer fixed while an A3 spatial surface changes scale. */
export const zoomWindowContentAt = (frame: WorkspaceWindowFrame, point: WorkspacePoint, previousScale: number, nextScale: number): WorkspaceWindowFrame => {
  if (!(previousScale > 0) || !(nextScale > 0)) return frame;
  const offset = frame.contentOffset ?? { x: 0, y: 0 }, ratio = nextScale / previousScale;
  return { ...frame, contentOffset: {
    x: point.x - (point.x - offset.x) * ratio,
    y: point.y - (point.y - offset.y) * ratio,
  } };
};

export function assertWorkspaceFrame(value: unknown, world = DEFAULT_WORLD): asserts value is WorkspaceWindowFrame {
  const item = record(value);
  if (!item || !finite(item.x) || !finite(item.y) || !finite(item.width) || !finite(item.height) || !["simple", "full"].includes(String(item.resizeMode))) {
    throw new Error("Workspace window frame is invalid");
  }
  if (item.width < 560 || item.height < 420 || item.width > 1800 || item.height > 1200) throw new Error("Workspace window size is outside supported bounds");
  if (item.contentScale !== undefined && (!finite(item.contentScale) || item.contentScale < .5 || item.contentScale > 2)) throw new Error("Workspace content scale is outside supported bounds");
  const offset = item.contentOffset === undefined ? undefined : record(item.contentOffset);
  if (item.contentOffset !== undefined && (!offset || !finite(offset.x) || !finite(offset.y))) throw new Error("Workspace content offset is invalid");
  if (item.navigation !== undefined) {
    const navigation = record(item.navigation), entries = navigation?.entries, origin = navigation?.semanticOrigin === undefined ? undefined : record(navigation.semanticOrigin);
    if (!navigation || !Array.isArray(entries) || !entries.length || !Number.isInteger(navigation.index) || Number(navigation.index) < 0 || Number(navigation.index) >= entries.length || !finite(navigation.semanticScale)) {
      throw new Error("Workspace projection navigation is invalid");
    }
    if (navigation.semanticOrigin !== undefined && (!origin || !finite(origin.x) || !finite(origin.y))) throw new Error("Workspace projection semantic origin is invalid");
    if (navigation.semanticTargetProjectionId !== undefined && typeof navigation.semanticTargetProjectionId !== "string") throw new Error("Workspace projection semantic target is invalid");
  }
  if (item.execution !== undefined) {
    const execution = record(item.execution);
    if (!execution || typeof execution.flowLayerVisible !== "boolean" || typeof execution.followActiveEvent !== "boolean") throw new Error("Workspace execution view is invalid");
  }
  if (item.x + item.width > world.width || item.y + item.height > world.height) throw new Error("Workspace window is outside the world");
}

export function normalizeFreeLayout(value: JsonValue, rootNodeIds: string[]): FreeLayoutWorkspaceViews {
  const source = record(value), free = source?.kind === "free-layout";
  const worldValue = free ? record(source.world) : undefined;
  const world = worldValue && finite(worldValue.width) && finite(worldValue.height) && worldValue.width >= 560 && worldValue.height >= 420 ? { width: worldValue.width, height: worldValue.height } : { ...DEFAULT_WORLD };
  const cameraValue = free ? record(source.camera) : undefined;
  const camera = cameraValue && finite(cameraValue.scale) && finite(cameraValue.x) && finite(cameraValue.y)
    // Camera translation is intentionally unbounded so the world origin can move away from the viewport's top-left corner.
    ? { scale: Math.min(2, Math.max(.5, cameraValue.scale)), x: cameraValue.x, y: cameraValue.y } : { ...DEFAULT_CAMERA };
  const projectionValue = free ? record(source.projections) : undefined;
  const projections: Record<string, WorkspaceWindowFrame> = {};
  rootNodeIds.forEach((id, index) => {
    const candidate = projectionValue?.[id];
    try {
      assertWorkspaceFrame(candidate, world);
      const frame = structuredClone(candidate as WorkspaceWindowFrame); frame.execution = normalizeExecutionView(frame.execution); projections[id] = frame;
    }
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
  const frontWindowId = typeof source?.frontWindowId === "string" && (projections[source.frontWindowId] || systemWindows[source.frontWindowId])
    ? source.frontWindowId : activeWindowId;
  return { kind: "free-layout", world, camera, projections, systemWindows, activeWindowId, frontWindowId };
}

export const exportedWorkspaceViews = (value: JsonValue): JsonValue => {
  const source = record(structuredClone(value));
  if (source) {
    source.systemWindows = {};
    const projections = record(source.projections);
    for (const frame of Object.values(projections ?? {})) {
      const item = record(frame), navigation = item?.navigation;
      if (navigation && typeof navigation === "object") item!.navigation = exportedNavigation(navigation as import("../contracts/package-types.ts").ProjectionNavigationState);
      if (item?.execution) item.execution = { flowLayerVisible: normalizeExecutionView(item.execution).flowLayerVisible, followActiveEvent: false };
    }
    if (typeof source.activeWindowId === "string" && !projections?.[source.activeWindowId]) delete source.activeWindowId;
    if (typeof source.frontWindowId === "string" && !projections?.[source.frontWindowId]) delete source.frontWindowId;
  }
  return (source ?? value) as JsonValue;
};

export const withSystemWindows = (value: JsonValue, systemWindows: Record<string, SystemWorkspaceWindow>, activeWindowId?: string, frontWindowId?: string): JsonValue => {
  const source = record(structuredClone(value)) ?? {};
  source.systemWindows = structuredClone(systemWindows);
  if (activeWindowId) source.activeWindowId = activeWindowId;
  else delete source.activeWindowId;
  if (frontWindowId) source.frontWindowId = frontWindowId;
  else delete source.frontWindowId;
  return source as JsonValue;
};

export const preserveSystemWindows = (value: JsonValue, previous: JsonValue, previousRootNodeIds: string[]): JsonValue => {
  const local = normalizeFreeLayout(previous, previousRootNodeIds);
  const activeWindowId = local.activeWindowId && local.systemWindows[local.activeWindowId] ? local.activeWindowId : undefined;
  const frontWindowId = local.frontWindowId && local.systemWindows[local.frontWindowId] ? local.frontWindowId : undefined;
  return withSystemWindows(value, local.systemWindows, activeWindowId, frontWindowId);
};

export const screenToWorld = (point: WorkspacePoint, views: FreeLayoutWorkspaceViews): WorkspacePoint => ({
  x: (point.x - views.camera.x) / views.camera.scale,
  y: (point.y - views.camera.y) / views.camera.scale,
});
