import { kindRange, project } from "./geometry.js";
import { kindOf, projectionId, relationBy, scalar, sceneMembers } from "./selectors.js";

const put = (graph, nodeId, relation) => ({ schemaVersion: 1, baseRevision: graph.revision, operations: [{ op: "put-relation", nodeId, relation }] });
const requireNode = (graph, id) => {
  const node = graph.nodes[id];
  if (!node) throw new Error(`Unknown Scene node ${id}`);
  return node;
};
export function updateCamera(input, graph) {
  const view = requireNode(graph, input.viewId), current = relationBy(view, "camera");
  if (!current || current.object.kind !== "const" || !input.camera || typeof input.camera !== "object") throw new Error("Invalid Scene camera update");
  return put(graph, view.id, { ...current, object: { kind: "const", value: { ...current.object.value, ...input.camera } } });
}
export function moveEntity(input, graph) {
  const view = requireNode(graph, input.viewId), entity = requireNode(graph, input.nodeId);
  const camera = scalar(view, "camera"), position = relationBy(entity, "position");
  if (projectionId(view) !== "scene.projection.quadrant" || !position || kindOf(entity) === "event" || camera?.zRotation !== 90) {
    throw new Error("Scene entity is not draggable in this projection");
  }
  const members = sceneMembers(view, graph), entities = members.filter((node) => kindOf(node) !== "event");
  const origin = project({ x: 0, y: 0, z: 0 }, "quadrant", "surface", camera), range = kindRange(entity, entities);
  const margin = (range.end - range.start) * 0.04;
  const sector = Math.max(range.start + margin, Math.min(range.end - margin, (origin.y - input.screenY) / camera.yAxisLength));
  const depth = Math.max(0, Math.min(1, (input.screenX - origin.x) / camera.zAxisLength));
  return put(graph, entity.id, { ...position, object: { kind: "const", value: { sector, depth, manual: true } } });
}
