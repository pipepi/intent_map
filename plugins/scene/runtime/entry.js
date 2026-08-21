import { moveEntity, selectInstance, updateCamera } from "./commands.js";
import { languageProvider } from "./language.js";
import { projectScene } from "./project.js";
import { isSceneType, projectionId, relationBy, sceneMembers, target, typeId } from "./selectors.js";

const typeIds = ["scene", "projection-instance", "person", "physical", "virtual", "event"].map((kind) => `scene.type.${kind}`);
function validate(graph) {
  for (const node of Object.values(graph.nodes)) {
    if (typeId(node) === "scene.type.event") {
      for (const role of ["subject", "source", "target", "object"]) {
        for (const relation of node.relations.filter((item) => item.predicate.nodeId === `scene.predicate.${role}`)) {
          if (relation.object.kind !== "ref") throw new Error(`Scene ${role} must reference a RelationNode`);
        }
      }
    }
    if (isSceneType(node, "projection-instance")) {
      const scene = graph.nodes[target(node, "observes")?.nodeId];
      const projection = projectionId(node), selection = target(node, "selection")?.nodeId;
      if (!isSceneType(scene, "scene")) throw new Error(`Scene projection ${node.id} must observe a Scene`);
      if (!["scene.projection.quadrant", "scene.projection.tube"].includes(projection)) throw new Error(`Scene projection ${node.id} is unsupported`);
      if (!relationBy(node, "camera")) throw new Error(`Scene projection ${node.id} has no camera`);
      if (selection && !sceneMembers(node, graph).some(({ id }) => id === selection)) throw new Error(`Scene projection ${node.id} selects an external node`);
    }
  }
}

export default function register(host) {
  const releases = [];
  for (const nodeId of typeIds) releases.push(host.registerType({
    type: { nodeId, relationId: "identity" }, name: nodeId.split(".").at(-1),
    matches(node) { return typeId(node) === nodeId; },
  }));
  releases.push(host.registerProjection({
    id: "scene.quadrant", purpose: "workspace",
    matches(node) { return isSceneType(node, "projection-instance") && projectionId(node) === "scene.projection.quadrant"; },
    project({ node, graph }) { return projectScene("quadrant", node, graph); },
    element: { pluginId: "official.scene-elements", elementId: "quadrant" },
  }));
  releases.push(host.registerProjection({
    id: "scene.tube", purpose: "workspace",
    matches(node) { return isSceneType(node, "projection-instance") && projectionId(node) === "scene.projection.tube"; },
    project({ node, graph }) { return projectScene("tube", node, graph); },
    element: { pluginId: "official.scene-elements", elementId: "tube" },
  }));
  releases.push(host.registerValidator(validate));
  releases.push(host.registerCommand("scene.update-camera", updateCamera));
  releases.push(host.registerCommand("scene.select-instance", selectInstance));
  releases.push(host.registerCommand("scene.move-entity", moveEntity));
  releases.push(host.registerLanguageProvider(languageProvider));
  return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
