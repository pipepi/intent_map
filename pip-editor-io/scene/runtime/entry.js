import { moveEntity, updateCamera } from "./commands.js";
import { languageProvider } from "./language.js";
import { projectScene } from "./project.js";
import { isSceneType, nameOf, projectionId, relationBy, observedScene, typeId } from "./selectors.js";
import { sceneCreators } from "./creators.js";

const typeIds = ["scene", "person", "physical", "virtual", "event"].map((kind) => `scene.type.${kind}`);
function validate(graph) {
  for (const node of Object.values(graph.nodes)) {
    if (typeId(node) === "scene.type.event") {
      for (const role of ["subject", "source", "target", "object"]) {
        for (const relation of node.relations.filter((item) => item.predicate.nodeId === `scene.predicate.${role}`)) {
          if (relation.object.kind !== "ref") throw new Error(`Scene ${role} must reference a RelationNode`);
        }
      }
    }
    if (["scene.projection.quadrant", "scene.projection.tube"].includes(projectionId(node))) {
      const scene = observedScene(node, graph), projection = projectionId(node);
      if (!isSceneType(scene, "scene")) throw new Error(`Scene projection ${node.id} must observe a Scene`);
      if (!["scene.projection.quadrant", "scene.projection.tube"].includes(projection)) throw new Error(`Scene projection ${node.id} is unsupported`);
      if (!relationBy(node, "camera")) throw new Error(`Scene projection ${node.id} has no camera`);
    }
  }
}

export default function register(host) {
  const releases = [];
  for (const nodeId of typeIds) releases.push(host.registerType({
    type: { nodeId, relationId: "identity" }, name: nodeId.split(".").at(-1),
    matches(node) { return typeId(node) === nodeId; },
    label(node, graph) {
      return nameOf(graph, node.id);
    },
  }));
  releases.push(host.registerProjection({
    id: "scene.quadrant", name: "单象限", icon: "⌗", definition: { nodeId: "scene.projection.quadrant", relationId: "identity" }, scope: "self", surfaces: ["workspace"],
    matches(node) { return projectionId(node) === "scene.projection.quadrant"; },
    project({ node, graph, selection }) { return projectScene("quadrant", node, graph, selection); },
    element: { pluginId: "official.scene-elements", elementId: "quadrant" },
  }));
  releases.push(host.registerProjection({
    id: "scene.tube", name: "管道", icon: "⌁", definition: { nodeId: "scene.projection.tube", relationId: "identity" }, scope: "self", surfaces: ["workspace"],
    matches(node) { return projectionId(node) === "scene.projection.tube"; },
    project({ node, graph, selection }) { return projectScene("tube", node, graph, selection); },
    element: { pluginId: "official.scene-elements", elementId: "tube" },
  }));
  releases.push(host.registerValidator(validate));
  releases.push(host.registerCommand("scene.update-camera", updateCamera));
  releases.push(host.registerCommand("scene.move-entity", moveEntity));
  releases.push(host.registerLanguageProvider(languageProvider));
  for (const creator of sceneCreators) releases.push(host.registerCreator(creator));
  return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
