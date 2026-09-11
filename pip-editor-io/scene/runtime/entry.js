import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { moveEntity, updateCamera } from "./commands.js";
import { languageProvider } from "./language.js";
import { projectScene } from "./project.js";
import { isSceneType, nameOf, projectionId, pipBy, observedScene, typeId } from "./selectors.js";
import { sceneCreators } from "./creators.js";

const typeIds = ["scene", "person", "physical", "virtual", "event"].map((kind) => `scene.type.${kind}`);
function validate(graph) {
    for (const node of Object.values(graphNodes(graph))) {
        if (typeId(node) === "scene.type.event") {
            for (const role of ["subject", "source", "target", "object"]) {
                for (const pip of node.pips.filter((item) => item.predicate_value?.predicate.node_id === `scene.predicate.${role}`)) {
                    if (pip.predicate_value.value.kind !== "ref")
                        throw new Error(`Scene ${role} must reference a Pip`);
                }
            }
        }
        if (["scene.projection.quadrant", "scene.projection.tube"].includes(projectionId(node))) {
            const scene = observedScene(node, graph), projection = projectionId(node);
            if (!isSceneType(scene, "scene"))
                throw new Error(`Scene projection ${node.id} must observe a Scene`);
            if (!["scene.projection.quadrant", "scene.projection.tube"].includes(projection))
                throw new Error(`Scene projection ${node.id} is unsupported`);
            if (!pipBy(node, "camera"))
                throw new Error(`Scene projection ${node.id} has no camera`);
        }
    }
}
export default function register(host) {
    const releases = [];
    for (const nodeId of typeIds)
        releases.push(host.registerType({
            type: { node_id: nodeId, pip_id: "identity" }, name: nodeId.split(".").at(-1),
            matches(node) { return typeId(node) === nodeId; },
            label(node, graph) {
      return nameOf(graph, node.id);
    },
        }));
    releases.push(host.registerProjection({
        id: "scene.quadrant", name: "单象限", icon: "⌗", definition: { node_id: "scene.projection.quadrant", pip_id: "identity" }, scope: "self", surfaces: ["workspace"],
        matches(node) { return projectionId(node) === "scene.projection.quadrant"; },
        project({ node, graph, selection }) { return projectScene("quadrant", node, graph, selection); },
        element: { pluginId: "official.scene-elements", elementId: "quadrant" },
    }));
    releases.push(host.registerProjection({
        id: "scene.tube", name: "管道", icon: "⌁", definition: { node_id: "scene.projection.tube", pip_id: "identity" }, scope: "self", surfaces: ["workspace"],
        matches(node) { return projectionId(node) === "scene.projection.tube"; },
        project({ node, graph, selection }) { return projectScene("tube", node, graph, selection); },
        element: { pluginId: "official.scene-elements", elementId: "tube" },
    }));
    releases.push(host.registerValidator(validate));
    releases.push(host.registerCommand("scene.update-camera", updateCamera));
    releases.push(host.registerCommand("scene.move-entity", moveEntity));
    releases.push(host.registerLanguageProvider(languageProvider));
    for (const creator of sceneCreators)
        releases.push(host.registerCreator(creator));
    return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
