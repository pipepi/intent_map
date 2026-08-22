import assert from "node:assert/strict";
import test from "node:test";
import { applyRelationPatch } from "../pip-editor/relation/index.ts";
import { NodeTypePluginRegistry } from "../pip-editor/relation-host/activation/node-type-registry.ts";
import { assertJsonValue } from "../pip-editor/relation-host/contracts/json-validation.ts";
import { buildScenePluginSuite, SCENE_BUSINESS_IDS } from "../pip-editor-io/scene/suite.ts";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const byPredicate = (node, name) => node.relations.filter(({ predicate }) => predicate.nodeId === `scene.predicate.${name}`);

async function installed() {
  const suite = await buildScenePluginSuite();
  const registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(suite.support.nodeType);
  await registry.install(suite.nodeType);
  return { suite, registry };
}

test("Scene collection opens with one world and no projection roots", async () => {
  const { suite } = await installed(), { graph, manifest } = suite.nodeMap;
  assert.deepEqual(manifest.rootNodeIds, []);
  assert.deepEqual(suite.nodeMap.workspace.views.projections, {});
  assert.deepEqual(suite.nodeMap.workspace.initialSelection, []);
  assert.equal(SCENE_BUSINESS_IDS.length, 21);
  const scene = graph.nodes["scene.today"];
  assert.equal(byPredicate(scene, "contains").length, 21);
  for (const id of ["scene.view.quadrant", "scene.view.tube"]) {
    const view = graph.nodes[id];
    assert.equal(view.relations.find(({ predicate }) => predicate.nodeId === "relation.core.type").object.target.nodeId, "relation.projection.type.instance");
    assert.equal(view.relations.find(({ predicate }) => predicate.nodeId === "relation.projection.predicate.observes").object.target.nodeId, scene.id);
    assert.equal(byPredicate(view, "selection").length, 0);
  }
  const members = SCENE_BUSINESS_IDS.map((id) => graph.nodes[id]);
  assert.equal(members.filter((node) => byPredicate(node, "type")[0].object.target.nodeId === "scene.type.event").length, 13);
  assert.equal(members.filter((node) => byPredicate(node, "type")[0].object.target.nodeId !== "scene.type.event").length, 8);
  assert.deepEqual(byPredicate(graph.nodes["scene.buy-btc"], "time")[0].object.value, { start: 10, end: 10.6 });
  assert.equal(byPredicate(graph.nodes["scene.deliver-breakfast"], "target").length, 2);
});

test("quadrant and tube project the same world with independent view state", async () => {
  const { suite, registry } = await installed(), graph = suite.nodeMap.graph;
  const projections = registry.projections(), quadrant = projections.find(({ id }) => id === "scene.quadrant"), tube = projections.find(({ id }) => id === "scene.tube");
  const input = (node, selection) => ({ workspaceId: "workspace.scene", rootNodeIds: suite.nodeMap.manifest.rootNodeIds, workspaceView: {}, graph, node, selection });
  const quadrantData = quadrant.project(input(graph.nodes["scene.view.quadrant"], ["scene.deliver-breakfast"]));
  const tubeData = tube.project(input(graph.nodes["scene.view.tube"], ["scene.buy-btc"]));
  assert.deepEqual(quadrantData.counts, { entities: 8, events: 13, relations: 36 });
  assert.equal(tubeData.counts.events, 13);
  assert.equal(quadrantData.mode, "quadrant"); assert.equal(tubeData.mode, "tube");
  assert.equal(quadrantData.selectedId, "scene.deliver-breakfast"); assert.equal(tubeData.selectedId, "scene.buy-btc");
  assert.ok(quadrantData.axes); assert.equal(tubeData.axes, null);
  const projectionType = registry.types().find(({ name }) => name === "projection-instance");
  const eventType = registry.types().find(({ name }) => name === "event");
  assert.match(projectionType.label(graph.nodes["scene.view.quadrant"], graph), /小明的今天/);
  assert.match(projectionType.label(graph.nodes["scene.view.tube"], graph), /小明的今天/);
  assert.equal(eventType.label(graph.nodes["scene.take-chicken-home"], graph), "小明把烤鸡带回家");
});

test("Scene projections remain JSON when a new view has no selection", async () => {
  const { suite, registry } = await installed(), graph = suite.nodeMap.graph;
  for (const projection of registry.projections().filter(({ id }) => id.startsWith("scene."))) {
    const view = graph.nodes[projection.id.endsWith("quadrant") ? "scene.view.quadrant" : "scene.view.tube"];
    const data = projection.project({ workspaceId: "workspace.scene", rootNodeIds: [], workspaceView: {}, graph, node: view, selection: [] });
    assert.doesNotThrow(() => assertJsonValue(data)); assert.equal(data.selectedId, null);
  }
});

test("Scene selection is an ephemeral scoped request while commands mutate camera and world position", async () => {
  const { suite, registry } = await installed();
  const commands = registry.commands(); let graph = suite.nodeMap.graph;
  assert.equal(commands.has("scene.select-instance"), false);
  assert.match(suite.element.entrySource, /kind:\s*["']select["']/);
  assert.match(suite.element.entrySource, /scopeId/);
  graph = applyRelationPatch(graph, await commands.get("scene.update-camera")({ viewId: "scene.view.quadrant", camera: { zRotation: 90 } }, graph)).graph;
  graph = applyRelationPatch(graph, await commands.get("scene.move-entity")({ viewId: "scene.view.quadrant", nodeId: "scene.xiaoming", screenX: 120, screenY: 380 }, graph)).graph;
  const position = byPredicate(graph.nodes["scene.xiaoming"], "position")[0].object.value;
  assert.equal(position.manual, true); assert.ok(position.sector >= 0 && position.depth >= 0);
  assert.throws(() => commands.get("scene.move-entity")({
    viewId: "scene.view.tube", nodeId: "scene.xiaoming", screenX: 144, screenY: 144,
  }, graph), /not draggable/);
  const projections = registry.projections();
  const data = (id, view) => projections.find((item) => item.id === id).project({ workspaceId: "w", rootNodeIds: suite.nodeMap.manifest.rootNodeIds, workspaceView: {}, selection: [], graph, node: graph.nodes[view] });
  assert.equal(data("scene.quadrant", "scene.view.quadrant").entities.find(({ id }) => id === "scene.xiaoming").surface.y, position.sector);
  assert.notDeepEqual(data("scene.tube", "scene.view.tube").entities.find(({ id }) => id === "scene.xiaoming").surface, { y: .32, z: .18 });
});

test("Scene A4 creators open persistent quadrant and tube projection roots", async () => {
  const { suite, registry } = await installed(), creators = registry.creators();
  assert.deepEqual(creators.map(({ id }) => id), ["scene.create-quadrant", "scene.create-tube"]);
  const context = { workspaceId: "workspace.scene", graph: suite.nodeMap.graph, rootNodeIds: suite.nodeMap.manifest.rootNodeIds, worldPosition: { x: 400, y: 300 } };
  const result = await creators[0].create(context);
  assert.equal(result.patch, undefined);
  assert.deepEqual(result.addRootNodeIds, ["scene.view.quadrant"]);
  assert.equal(result.preferredProjection.projectionId, "scene.view.quadrant");
  assert.deepEqual(byPredicate(suite.nodeMap.graph.nodes["scene.view.quadrant"], "camera")[0].object.value, { zRotation: 135, yAxisLength: 300, zAxisLength: 300, xZoom: 1, xPan: 0 });
});
