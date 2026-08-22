import { kindOf, roleRelations, scalar } from "./selectors.js";

export const TIME_START = 7.5;
export const TIME_END = 20;
export const KIND_ORDER = ["physical", "person", "virtual"];
export const KIND_NAMES = { physical: "实物", person: "人物", virtual: "虚拟物" };
export const KIND_COLORS = { physical: "#ffb45e", person: "#7c9cff", virtual: "#b88cff" };
const stableOffset = (id, salt) => {
  const value = [...`${id}-${salt}`].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 7);
  return ((Math.abs(value) % 1000) / 999) - 0.5;
};
export const eventReferenceCount = (node, events) => events.filter((event) =>
  roleRelations(event).some(({ ref }) => ref.nodeId === node.id)).length;
export const kindRange = (node, entities) => {
  const kind = kindOf(node);
  const same = entities.filter((item) => kindOf(item) === kind);
  const offset = KIND_ORDER.slice(0, KIND_ORDER.indexOf(kind))
    .reduce((sum, item) => sum + entities.filter((entity) => kindOf(entity) === item).length, 0);
  return { start: offset / entities.length, end: (offset + same.length) / entities.length };
};
export const surfacePoint = (position, mode) => {
  if (mode === "quadrant") return { y: position.sector, z: position.depth };
  const angle = position.sector * Math.PI * 2 - Math.PI / 2;
  return { y: Math.cos(angle) * position.depth, z: Math.sin(angle) * position.depth };
};
export const entitySurfacePoint = (node, entities, events, mode) => {
  const position = scalar(node, "position");
  if (mode === "tube" || position?.manual) return surfacePoint(position, mode);
  const same = entities.filter((entity) => kindOf(entity) === kindOf(node));
  const maxReferences = Math.max(1, ...entities.map((entity) => eventReferenceCount(entity, events)));
  const maxKindReferences = Math.max(1, ...same.map((entity) => eventReferenceCount(entity, events)));
  const references = eventReferenceCount(node, events);
  const range = kindRange(node, entities);
  const relativeY = Math.max(0.08, Math.min(0.92, 0.12 + (references / maxKindReferences) * 0.76 + stableOffset(node.id, "y") * 0.4));
  return {
    y: range.start + relativeY * (range.end - range.start),
    z: Math.max(0, Math.min(1, 1 - references / maxReferences + stableOffset(node.id, "z") * 0.28)),
  };
};
export const eventCenter = (event, graph, pointById) => {
  const points = roleRelations(event).map(({ ref }) => pointById.get(ref.nodeId)).filter(Boolean);
  if (!points.length) return undefined;
  return { y: points.reduce((sum, point) => sum + point.y, 0) / points.length, z: points.reduce((sum, point) => sum + point.z, 0) / points.length };
};
export const timeX = (hour) => Math.max(0, Math.min(1, (hour - TIME_START) / (TIME_END - TIME_START)));
export const project = (point, mode, space = "timeline", camera = {}) => {
  const { zRotation = 90, yAxisLength = 300, zAxisLength = 300, xZoom = 1, xPan = 0 } = camera;
  const origin = mode === "tube" ? { x: space === "surface" ? 130 : 320, y: 285 } : { x: space === "surface" ? 70 : 250, y: 445 };
  const zScale = mode === "tube" ? 104 : zAxisLength, yScale = mode === "tube" ? 104 : yAxisLength;
  const rotation = zRotation * Math.PI / 180, viewedX = (point.x - 0.5) * xZoom + 0.5;
  const round = (value) => Math.round(value * 100) / 100;
  return space === "surface"
    ? { x: round(origin.x + point.z * zScale * Math.sin(rotation)), y: round(origin.y - point.y * yScale + point.z * zScale * 0.34 * Math.cos(rotation)) }
    : { x: round(origin.x + viewedX * 500 + xPan + point.z * zScale * 0.62 * Math.sin(rotation)), y: round(origin.y - point.y * yScale + point.z * zScale * 0.34 * Math.cos(rotation)) };
};
export const formatHour = (hour) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
