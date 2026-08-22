import assert from "node:assert/strict";
import test from "node:test";
import { applyRelationPatch } from "../pip-editor/relation/index.ts";
import { NodeTypePluginRegistry } from "../pip-editor/relation-host/activation/node-type-registry.ts";
import { buildScenePluginSuite, SCENE_BUSINESS_IDS } from "../pip-editor-plugins/scene/suite.ts";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const byPredicate = (node, name) => node.relations.filter(({ predicate }) => predicate.nodeId === `scene.predicate.${name}`);

async function installed() {
  const suite = await buildScenePluginSuite();
  const registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(suite.nodeType);
  return { suite, registry };
}

test("Scene collection has one world and two same-type projection roots", async () => {
  const { suite } = await installed(), { graph, manifest } = suite.collection;
  assert.deepEqual(manifest.rootNodeIds, ["scene.view.quadrant", "scene.view.tube"]);
  assert.equal(SCENE_BUSINESS_IDS.length, 21);
  const scene = graph.nodes["scene.today"];
  assert.equal(byPredicate(scene, "contains").length, 21);
  for (const id of manifest.rootNodeIds) {
    const view = graph.nodes[id];
    assert.equal(byPredicate(view, "type")[0].object.target.nodeId, "scene.type.projection-instance");
    assert.equal(byPredicate(view, "observes")[0].object.target.nodeId, scene.id);
  }
  const members = SCENE_BUSINESS_IDS.map((id) => graph.nodes[id]);
  assert.equal(members.filter((node) => byPredicate(node, "type")[0].object.target.nodeId === "scene.type.event").length, 13);
  assert.equal(members.filter((node) => byPredicate(node, "type")[0].object.target.nodeId !== "scene.type.event").length, 8);
  assert.deepEqual(byPredicate(graph.nodes["scene.buy-btc"], "time")[0].object.value, { start: 10, end: 10.6 });
  assert.equal(byPredicate(graph.nodes["scene.deliver-breakfast"], "target").length, 2);
});

test("quadrant and tube project the same world with independent view state", async () => {
  const { suite, registry } = await installed(), graph = suite.collection.graph;
  const projections = registry.projections(), quadrant = projections.find(({ id }) => id === "scene.quadrant"), tube = projections.find(({ id }) => id === "scene.tube");
  const input = (node) => ({ workspaceId: "workspace.scene", rootNodeIds: suite.collection.manifest.rootNodeIds, graph, node });
  const quadrantData = quadrant.project(input(graph.nodes["scene.view.quadrant"]));
  const tubeData = tube.project(input(graph.nodes["scene.view.tube"]));
  assert.deepEqual(quadrantData.counts, { entities: 8, events: 13, relations: 36 });
  assert.equal(tubeData.counts.events, 13);
  assert.equal(quadrantData.mode, "quadrant"); assert.equal(tubeData.mode, "tube");
  assert.equal(quadrantData.selectedId, "scene.deliver-breakfast"); assert.equal(tubeData.selectedId, "scene.deliver-breakfast");
  assert.ok(quadrantData.axes); assert.equal(tubeData.axes, null);
});

test("Scene commands isolate selection and camera but move shared world position", async () => {
  const { suite, registry } = await installed();
  const commands = registry.commands(); let graph = suite.collection.graph;
  graph = applyRelationPatch(graph, await commands.get("scene.select-instance")({ viewId: "scene.view.quadrant", nodeId: "scene.buy-btc" }, graph)).graph;
  assert.equal(byPredicate(graph.nodes["scene.view.quadrant"], "selection")[0].object.target.nodeId, "scene.buy-btc");
  assert.equal(byPredicate(graph.nodes["scene.view.tube"], "selection")[0].object.target.nodeId, "scene.deliver-breakfast");
  graph = applyRelationPatch(graph, await commands.get("scene.update-camera")({ viewId: "scene.view.quadrant", camera: { zRotation: 90 } }, graph)).graph;
  graph = applyRelationPatch(graph, await commands.get("scene.move-entity")({ viewId: "scene.view.quadrant", nodeId: "scene.xiaoming", screenX: 120, screenY: 380 }, graph)).graph;
  const position = byPredicate(graph.nodes["scene.xiaoming"], "position")[0].object.value;
  assert.equal(position.manual, true); assert.ok(position.sector >= 0 && position.depth >= 0);
  assert.throws(() => commands.get("scene.move-entity")({
    viewId: "scene.view.tube", nodeId: "scene.xiaoming", screenX: 144, screenY: 144,
  }, graph), /not draggable/);
  const projections = registry.projections();
  const data = (id, view) => projections.find((item) => item.id === id).project({ workspaceId: "w", rootNodeIds: suite.collection.manifest.rootNodeIds, graph, node: graph.nodes[view] });
  assert.equal(data("scene.quadrant", "scene.view.quadrant").entities.find(({ id }) => id === "scene.xiaoming").surface.y, position.sector);
  assert.notDeepEqual(data("scene.tube", "scene.view.tube").entities.find(({ id }) => id === "scene.xiaoming").surface, { y: .32, z: .18 });
});
