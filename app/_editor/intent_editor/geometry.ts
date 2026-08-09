import type {
  SceneNode,
  SceneState,
  SurfacePosition,
  ViewMode,
} from "./model";

export type PointYZ = { y: number; z: number };
export type Point3 = PointYZ & { x: number };
export type ScreenPoint = { x: number; y: number };
export type ProjectionSpace = "surface" | "timeline";
export type ManualPositions = Partial<Record<string, PointYZ>>;

export const TIME_START = 7.5;
export const TIME_END = 20;
export const entityKindOrder = ["physical", "person", "virtual"] as const;

function stableOffset(id: string, salt: string): number {
  const value = [...`${id}-${salt}`].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 7);
  return ((Math.abs(value) % 1000) / 999) - 0.5;
}

export function eventReferenceCount(node: SceneNode, state: SceneState): number {
  return Object.values(state.nodes).filter((candidate) =>
    candidate.tag.kind === "event"
    && candidate.relations.some((relation) => relation.targetId === node.tag.id)
  ).length;
}

export function surfacePoint(
  position: SurfacePosition,
  mode: ViewMode,
): PointYZ {
  if (mode === "quadrant") {
    return { y: position.sector, z: position.depth };
  }

  const angle = position.sector * Math.PI * 2 - Math.PI / 2;
  return {
    y: Math.cos(angle) * position.depth,
    z: Math.sin(angle) * position.depth,
  };
}

export function entitySurfacePoint(
  node: SceneNode,
  state: SceneState,
  mode: ViewMode,
  manualPositions?: ManualPositions,
): PointYZ {
  const manual = manualPositions?.[node.tag.id];
  if (manual) return manual;
  const position = node.tag.position!;
  if (mode === "tube") return surfacePoint(position, mode);

  const entities = Object.values(state.nodes).filter((entity) => entity.tag.kind !== "event");
  const total = entities.length;
  const sameKind = entities.filter((entity) => entity.tag.kind === node.tag.kind);
  const maxReferences = Math.max(1, ...entities.map((entity) => eventReferenceCount(entity, state)));
  const maxKindReferences = Math.max(1, ...sameKind.map((entity) => eventReferenceCount(entity, state)));
  const references = eventReferenceCount(node, state);
  const kindOffset = entityKindOrder
    .slice(0, entityKindOrder.indexOf(node.tag.kind as (typeof entityKindOrder)[number]))
    .reduce((sum, kind) => sum + entities.filter((entity) => entity.tag.kind === kind).length, 0);
  const segmentStart = kindOffset / total;
  const segmentLength = sameKind.length / total;
  const relativeY = Math.max(0.08, Math.min(0.92,
    0.12 + (references / maxKindReferences) * 0.76 + stableOffset(node.tag.id, "y") * 0.4,
  ));
  const inverseHeat = 1 - references / maxReferences;
  return {
    y: segmentStart + relativeY * segmentLength,
    z: Math.max(0, Math.min(1, inverseHeat + stableOffset(node.tag.id, "z") * 0.28)),
  };
}

export function entityKindRange(node: SceneNode, state: SceneState): { start: number; end: number } {
  const entities = Object.values(state.nodes).filter((entity) => entity.tag.kind !== "event");
  const sameKind = entities.filter((entity) => entity.tag.kind === node.tag.kind);
  const offset = entityKindOrder
    .slice(0, entityKindOrder.indexOf(node.tag.kind as (typeof entityKindOrder)[number]))
    .reduce((sum, kind) => sum + entities.filter((entity) => entity.tag.kind === kind).length, 0);
  return { start: offset / entities.length, end: (offset + sameKind.length) / entities.length };
}

export function eventCenter(
  event: SceneNode,
  state: SceneState,
  mode: ViewMode,
  manualPositions?: ManualPositions,
): PointYZ | undefined {
  const points = event.relations.flatMap((relation) => {
    const node = state.nodes[relation.targetId];
    const position = node?.tag.position;
    if (!node || node.tag.kind === "event" || !position) return [];
    return [entitySurfacePoint(node, state, mode, manualPositions)];
  });

  if (points.length === 0) return undefined;
  return {
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

export function timeX(hour: number): number {
  return Math.max(0, Math.min(1, (hour - TIME_START) / (TIME_END - TIME_START)));
}

export function project(
  point: Point3,
  mode: ViewMode,
  space: ProjectionSpace = "timeline",
  zRotation = 90,
  yAxisLength = 148,
  zAxisLength = 148,
  xZoom = 1,
  xPan = 0,
): ScreenPoint {
  const origin = mode === "tube"
    ? { x: space === "surface" ? 130 : 320, y: 285 }
    : { x: space === "surface" ? 70 : 250, y: 445 };
  const zScale = mode === "tube" ? 104 : zAxisLength;
  const yScale = mode === "tube" ? 104 : yAxisLength;
  const timeScale = space === "timeline" ? 500 : 0;
  const rotation = (zRotation * Math.PI) / 180;
  const zHorizontal = zRotation === 0 ? 1 : Math.sin(rotation);
  const zDepth = zRotation === 0 ? 0 : Math.cos(rotation);
  const viewedX = (point.x - 0.5) * xZoom + 0.5;
  const round = (value: number) => Math.round(value * 100) / 100;

  if (space === "surface") {
    return {
      x: round(origin.x + point.z * zScale * zHorizontal),
      y: round(origin.y - point.y * yScale + point.z * zScale * 0.34 * zDepth),
    };
  }

  return {
    x: round(origin.x + viewedX * timeScale + xPan + point.z * zScale * 0.62 * zHorizontal),
    y: round(origin.y - point.y * yScale + point.z * zScale * 0.34 * zDepth),
  };
}

export function surfaceOutline(
  mode: ViewMode,
  x: number,
  space: ProjectionSpace = "timeline",
  zRotation = 90,
  yAxisLength = 148,
  zAxisLength = 148,
  xZoom = 1,
  xPan = 0,
): ScreenPoint[] {
  const source =
    mode === "tube"
      ? Array.from({ length: 49 }, (_, index) => {
          const angle = (index / 48) * Math.PI * 2;
          return { y: Math.cos(angle), z: Math.sin(angle) };
        })
      : [
          { y: 0, z: 0 },
          { y: 1, z: 0 },
          { y: 1, z: 1 },
          { y: 0, z: 1 },
          { y: 0, z: 0 },
        ];

  return source.map((point) => project({ x, ...point }, mode, space, zRotation, yAxisLength, zAxisLength, xZoom, xPan));
}

export function pointsAttribute(points: ScreenPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function formatHour(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
