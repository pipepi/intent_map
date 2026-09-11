import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
export const predicateId = (name) => `scene.predicate.${name}`;
export const pipsBy = (node, name) => node?.pips.filter((pip) => pip.predicate_value?.predicate.node_id === predicateId(name)) ?? [];
export const pipBy = (node, name) => pipsBy(node, name)[0];
export const scalar = (node, name) => {
    const object = pipBy(node, name)?.predicate_value?.value;
    return object?.kind === "const" ? object.value : undefined;
};
export const target = (node, name) => {
    const object = pipBy(node, name)?.predicate_value?.value;
    return object?.kind === "ref" ? object.target : undefined;
};
export const targets = (node, name) => pipsBy(node, name)
    .flatMap(({ predicate_value }) => predicate_value?.value.kind === "ref" ? [predicate_value.value.target] : []);
export const typeId = (node) => target(node, "type")?.node_id;
export const kindOf = (node) => typeId(node)?.replace("scene.type.", "");
export const nameOf = (graph, id) => String(scalar(graphNodes(graph)[id], "name") ?? id);
const genericTarget = (node, predicate) => {
    const object = node?.pips.find((pip) => pip.predicate_value?.predicate.node_id === predicate)?.predicate_value?.value;
    return object?.kind === "ref" ? object.target : undefined;
};
export const observedScene = (view, graph) => graphNodes(graph)[genericTarget(view, "pip.projection.predicate.observes")?.node_id];
export const sceneMembers = (view, graph) => {
    const scene = observedScene(view, graph);
    return targets(scene, "contains").map(({ node_id }) => graphNodes(graph)[node_id]).filter(Boolean);
};
export const role_pips = (node) => ["subject", "source", "target", "object"]
  .flatMap((role) => targets(node, role).map((ref) => ({ role, ref })));
export const projectionId = (view) => genericTarget(view, "pip.projection.predicate.uses")?.node_id;
export const isSceneType = (node, name) => typeId(node) === `scene.type.${name}`;
