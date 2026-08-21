export const predicateId = (name) => `scene.predicate.${name}`;
export const relationsBy = (node, name) => node?.relations.filter((relation) => relation.predicate.nodeId === predicateId(name)) ?? [];
export const relationBy = (node, name) => relationsBy(node, name)[0];
export const scalar = (node, name) => {
  const object = relationBy(node, name)?.object;
  return object?.kind === "const" ? object.value : undefined;
};
export const target = (node, name) => {
  const object = relationBy(node, name)?.object;
  return object?.kind === "ref" ? object.target : undefined;
};
export const targets = (node, name) => relationsBy(node, name)
  .flatMap(({ object }) => object.kind === "ref" ? [object.target] : []);
export const typeId = (node) => target(node, "type")?.nodeId;
export const kindOf = (node) => typeId(node)?.replace("scene.type.", "");
export const nameOf = (graph, id) => String(scalar(graph.nodes[id], "name") ?? id);
export const observedScene = (view, graph) => graph.nodes[target(view, "observes")?.nodeId];
export const sceneMembers = (view, graph) => {
  const scene = observedScene(view, graph);
  return targets(scene, "contains").map(({ nodeId }) => graph.nodes[nodeId]).filter(Boolean);
};
export const roleRelations = (node) => ["subject", "source", "target", "object"]
  .flatMap((role) => targets(node, role).map((ref) => ({ role, ref })));
export const projectionId = (view) => target(view, "projection")?.nodeId;
export const selectedId = (view) => target(view, "selection")?.nodeId;
export const isSceneType = (node, name) => typeId(node) === `scene.type.${name}`;
