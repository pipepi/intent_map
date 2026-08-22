import {
  KIND_COLORS, KIND_NAMES, KIND_ORDER, entitySurfacePoint, eventCenter,
  eventReferenceCount, formatHour, kindRange, project, timeX,
} from "./geometry.js";
import {
  kindOf, nameOf, projectionId, roleRelations, scalar, sceneMembers,
} from "./selectors.js";

const pointKey = (point) => `${point.x},${point.y}`;
export function projectScene(mode, view, graph, selection = []) {
  const members = sceneMembers(view, graph);
  const entities = members.filter((node) => kindOf(node) !== "event");
  const events = members.filter((node) => kindOf(node) === "event");
  const camera = scalar(view, "camera") ?? {};
  const selected = selection[0];
  const angle = mode === "quadrant" ? camera.zRotation : 90;
  const effectiveCamera = { ...camera, zRotation: angle };
  const surfaceById = new Map(entities.map((node) => [node.id, entitySurfacePoint(node, entities, events, mode)]));
  const entityData = entities.map((node) => {
    const surface = surfaceById.get(node.id), kind = kindOf(node);
    return {
      id: node.id, name: nameOf(graph, node.id), kind, color: KIND_COLORS[kind], surface,
      point: project({ x: 0, ...surface }, mode, "surface", effectiveCamera),
      references: eventReferenceCount(node, events), selected: selected === node.id,
    };
  });
  const eventData = events.map((node) => {
    const center = eventCenter(node, graph, surfaceById), time = scalar(node, "time");
    const start = center && project({ x: timeX(time.start), ...center }, mode, "timeline", effectiveCamera);
    const end = center && project({ x: timeX(time.end ?? time.start), ...center }, mode, "timeline", effectiveCamera);
    const roles = roleRelations(node).map(({ role, ref }) => ({ role, nodeId: ref.nodeId, name: nameOf(graph, ref.nodeId), kind: kindOf(graph.nodes[ref.nodeId]) }));
    return {
      id: node.id, name: nameOf(graph, node.id), time, center, start, end, roles,
      color: roles.some(({ kind }) => kind === "virtual") ? KIND_COLORS.virtual : "#7c9cff",
      selected: selected === node.id, related: roles.some(({ nodeId }) => nodeId === selected),
    };
  }).sort((left, right) => left.time.start - right.time.start);
  const selectedEvent = eventData.find(({ id }) => id === selected);
  const selectedEntity = entityData.find(({ id }) => id === selected);
  for (const entity of entityData) {
    entity.related = Boolean(selectedEvent?.roles.some(({ nodeId }) => nodeId === entity.id)
      || selectedEntity && events.some((event) => event.id === selected && roleRelations(event).some(({ ref }) => ref.nodeId === entity.id)));
  }
  const relationLines = eventData.flatMap((event) => event.roles.flatMap(({ nodeId }) => {
    const entity = entityData.find(({ id }) => id === nodeId);
    if (!entity || !event.start) return [];
    const active = event.id === selected || nodeId === selected;
    const distance = Math.hypot(entity.point.x - event.start.x, entity.point.y - event.start.y);
    const ratio = active ? 1 : Math.min(1, 32 / Math.max(distance, 1));
    return [{
      id: `${event.id}:${nodeId}`, active, from: event.start,
      to: { x: event.start.x + (entity.point.x - event.start.x) * ratio, y: event.start.y + (entity.point.y - event.start.y) * ratio },
    }];
  }));
  const entityLines = entityData.flatMap((entity) => roleRelations(graph.nodes[entity.id]).flatMap(({ ref }) => {
    const target = entityData.find(({ id }) => id === ref.nodeId);
    if (!target || (selected !== entity.id && selected !== target.id && !selectedEvent)) return [];
    return [{ id: `${entity.id}:${target.id}`, from: entity.point, to: target.point }];
  }));
  const axes = mode === "quadrant" ? quadrantAxes(entities, events, entityData, effectiveCamera) : null;
  const selectedNode = graph.nodes[selected];
  const inspector = selectedNode ? {
    id: selectedNode.id, name: nameOf(graph, selectedNode.id), kind: kindOf(selectedNode),
    time: scalar(selectedNode, "time") ?? null,
    position: scalar(selectedNode, "position") ?? null,
    relations: roleRelations(selectedNode).map(({ role, ref }) => ({ role, nodeId: ref.nodeId, name: nameOf(graph, ref.nodeId), kind: kindOf(graph.nodes[ref.nodeId]) })),
  } : null;
  return {
    mode, viewId: view.id, projectionId: projectionId(view), camera, selectedId: selected ?? null,
    counts: { entities: entities.length, events: events.length, relations: members.reduce((sum, node) => sum + roleRelations(node).length, 0) },
    editable: mode === "quadrant" && camera.zRotation === 90, entities: entityData, events: eventData,
    relationLines, entityLines, axes, inspector,
    timeline: [8, 11, 14, 17, 20].map((hour) => ({ hour, label: formatHour(hour), point: project({ x: timeX(hour), y: 0, z: 0 }, mode, "timeline", effectiveCamera) })),
    debug: { surfaceKeys: entityData.map(({ point }) => pointKey(point)) },
  };
}

function quadrantAxes(entities, events, entityData, camera) {
  const total = entities.length;
  const segments = KIND_ORDER.map((kind) => {
    const sample = entities.find((node) => kindOf(node) === kind), range = sample ? kindRange(sample, entities) : { start: 0, end: 0 };
    return { kind, name: KIND_NAMES[kind], color: KIND_COLORS[kind], count: entities.filter((node) => kindOf(node) === kind).length, ...range };
  });
  const maxReferences = Math.max(1, ...entities.map((node) => eventReferenceCount(node, events)));
  return {
    total, origin: project({ x: 0, y: 0, z: 0 }, "quadrant", "surface", camera),
    zEnd: project({ x: 0, y: 0, z: 1 }, "quadrant", "surface", camera), segments,
    referenceTicks: [...new Set(entityData.map(({ references }) => references))].sort((a, b) => b - a)
      .map((references) => ({ references, point: project({ x: 0, y: 0, z: 1 - references / maxReferences }, "quadrant", "surface", camera) })),
  };
}
