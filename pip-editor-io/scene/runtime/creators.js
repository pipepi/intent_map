import { isSceneType } from "./selectors.js";

const identity = (nodeId) => ({ nodeId, relationId: "identity" });
const ref = (id, predicate, nodeId) => ({ id, predicate: identity(`scene.predicate.${predicate}`), object: { kind: "ref", target: identity(nodeId) }, relations: [] });
const constant = (id, predicate, value) => ({ id, predicate: identity(`scene.predicate.${predicate}`), object: { kind: "const", value }, relations: [] });
const camera = (mode) => mode === "quadrant" ? { zRotation: 135, yAxisLength: 200, zAxisLength: 200, xZoom: 1, xPan: 0 } : { xZoom: 1, xPan: 0 };

const createProjection = (mode) => ({
  id: `scene.create-${mode}`,
  label: mode === "quadrant" ? "象限视图" : "管道视图",
  description: `创建观察同一 Scene 的${mode === "quadrant" ? "空间象限" : "时间管道"}投影`,
  category: "Scene 投影",
  icon: mode === "quadrant" ? "⌗" : "⌁",
  accepts({ graph }) { return Object.values(graph.nodes).some((node) => isSceneType(node, "scene")); },
  create(context) {
    const scene = Object.values(context.graph.nodes).find((node) => isSceneType(node, "scene"));
    if (!scene) throw new Error("Scene creator requires a scene.type.scene node");
    const suffix = crypto.randomUUID(), id = `scene.view.${mode}.${suffix}`;
    const node = { id, relations: [
      ref("type", "type", "scene.type.projection-instance"), ref("observes", "observes", scene.id),
      ref("projection", "projection", `scene.projection.${mode}`), constant("camera", "camera", camera(mode)),
    ] };
    return {
      patch: { schemaVersion: 1, baseRevision: context.graph.revision, operations: [{ op: "put-node", node }] },
      addRootNodeIds: [id], preferredProjection: { projectionId: id, width: 1120, height: 720 },
    };
  },
});

export const sceneCreators = [createProjection("quadrant"), createProjection("tube")];
