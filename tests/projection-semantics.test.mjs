import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NodeTypePluginRegistry } from "../pip-editor/relation-host/activation/node-type-registry.ts";
import { assertProjectionRegistration, normalizeProjectionRegistration } from "../pip-editor/relation-host/projection/projection-context.ts";
import { resolveNodePresentation } from "../pip-editor/relation-host/projection/resolve-presentation.ts";
import { initialNavigation, navigateProjection, replaceCurrentProjection } from "../pip-editor/relation-host/projection/projection-navigation.ts";
import { forwardRoute, navigationForRoot } from "../pip-editor/relation-host/projection/projection-routes.ts";
import { applySemanticScale, semanticProgress } from "../pip-editor/relation-host/projection/semantic-zoom.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { screenToElementLocal, screenToFlowWorld } from "../pip-editor-io/relation-projections/elements/flow-geometry.js";
import { moveChild } from "../pip-editor-io/relation-projections/runtime/commands.js";
import { canCancelFlowSession, liveFlowNodeIds } from "../pip-editor-io/relation-projections/elements/flow-runtime-state.js";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const relation = (node, predicate) => node.relations.find((item) => item.predicate.nodeId === predicate);
const relations = (node, predicate) => node.relations.filter((item) => item.predicate.nodeId === predicate);

async function fixture() {
  const suite = await buildScenePluginSuite(), registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(suite.support.nodeType); await registry.install(suite.nodeType);
  return { suite, registry, graph: suite.nodeMap.graph };
}

test("projection capabilities normalize legacy contexts into scope and surfaces", () => {
  const base = { id: "test", definition: { nodeId: "test.definition", relationId: "identity" }, matches: () => true, element: { pluginId: "p", elementId: "e" } };
  assert.deepEqual(normalizeProjectionRegistration({ ...base, contexts: ["self-workspace", "self-embedded"] }), {
    ...base, scope: "self", surfaces: ["workspace", "embedded"], contexts: ["self-workspace", "self-embedded"],
  });
  assert.deepEqual(normalizeProjectionRegistration({ ...base, contexts: ["children-workspace"] }).scope, "children");
  assert.doesNotThrow(() => assertProjectionRegistration({ ...base, scope: "self", surfaces: ["workspace", "embedded"] }));
  assert.doesNotThrow(() => assertProjectionRegistration({ ...base, scope: "children", surfaces: ["workspace"] }));
  assert.throws(() => assertProjectionRegistration({ ...base, contexts: ["self-embedded"] }), /self-workspace/);
  assert.throws(() => assertProjectionRegistration({ ...base, contexts: ["children-workspace", "self-embedded"] }), /cannot combine/);
  assert.throws(() => assertProjectionRegistration({ ...base, scope: "children", surfaces: ["workspace", "embedded"] }), /children scope/);
  assert.throws(() => assertProjectionRegistration({ ...base, scope: "self", surfaces: ["embedded"] }), /workspace before embedded/);
  assert.throws(() => assertProjectionRegistration({ ...base, scope: "self", surfaces: ["workspace"], contexts: ["children-workspace"] }), /conflicting/);
  assert.doesNotThrow(() => assertProjectionRegistration({ ...base, scope: "self", surfaces: ["workspace"], zoomViewport: { top: 36, right: 0, bottom: 0, left: 0 } }));
  assert.throws(() => assertProjectionRegistration({ ...base, scope: "self", surfaces: ["workspace"], zoomViewport: { top: -1, right: 0, bottom: 0, left: 0 } }), /zoom viewport/);
});

test("Scene A5 contains a persistent complete projection bundle", async () => {
  const { graph, registry } = await fixture();
  const projectionNodes = Object.values(graph.nodes).filter((node) => relation(node, "relation.core.type")?.object.target?.nodeId === "relation.projection.type.instance");
  assert.equal(projectionNodes.length, 46);
  const internal = graph.nodes["scene.view.children:scene.today"];
  assert.equal(relations(internal, "relation.projection.predicate.presents").length, 21);
  assert.equal(relation(graph.nodes["scene.view.quadrant"], "relation.projection.predicate.dives-into").object.target.nodeId, internal.id);
  assert.equal(relation(graph.nodes["scene.view.tube"], "relation.projection.predicate.dives-into").object.target.nodeId, internal.id);
  registry.validators().forEach((validate) => assert.doesNotThrow(() => validate(graph)));
});

test("explicit projection instances resolve by uses and enforce their context", async () => {
  const { graph, registry } = await fixture(), node = graph.nodes["scene.view.properties:scene.xiaoming"];
  const elements = { resolve: (_pluginId, elementId) => ({ id: elementId, tag: `test-${elementId}`, purpose: "projection" }) };
  const embedded = resolveNodePresentation(node, graph, elements, registry, "workspace", { workspaceId: "w", rootNodeIds: [], workspaceView: {}, selection: [], projectionContext: { kind: "self-embedded", parentProjectionNodeId: "scene.view.children:scene.today", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } } });
  assert.equal(embedded.projection.id, "relation.properties"); assert.equal(embedded.projectionData.compact, true);
  assert.deepEqual([embedded.context.scope, embedded.context.surface, embedded.context.kind], ["self", "embedded", "self-embedded"]);
  const invalid = resolveNodePresentation(graph.nodes["scene.view.children:scene.today"], graph, elements, registry, "workspace", { workspaceId: "w", rootNodeIds: [], workspaceView: {}, selection: [], projectionContext: { kind: "self-embedded", parentProjectionNodeId: "x", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } } });
  assert.match(invalid.error, /does not support self-embedded/);
});

test("semantic routes recurse self → children → child self without creating nodes", async () => {
  const { graph, registry } = await fixture(), before = Object.keys(graph.nodes).length;
  let navigation = navigationForRoot("scene.view.quadrant", graph, registry);
  const internal = forwardRoute(navigation, graph, registry);
  navigation = applySemanticScale(navigation, 1.7, internal);
  assert.equal(navigation.entries[navigation.index].projectionNodeId, "scene.view.children:scene.today");
  const child = forwardRoute(navigation, graph, registry, "scene.view.properties:scene.xiaoming");
  navigation = applySemanticScale(navigation, 1.7, child);
  assert.equal(navigation.entries[navigation.index].projectionNodeId, "scene.view.properties:scene.xiaoming");
  const childInternal = forwardRoute(navigation, graph, registry);
  assert.equal(childInternal.projectionNodeId, "scene.view.children:scene.xiaoming");
  navigation = applySemanticScale(navigation, .6);
  assert.equal(navigation.entries[navigation.index].projectionNodeId, "scene.view.children:scene.today");
  assert.equal(Object.keys(graph.nodes).length, before); assert.equal(graph.revision, 0);
  assert.equal(semanticProgress(1.4), 0); assert.equal(semanticProgress(1.7), 1); assert.equal(semanticProgress(.6), 1);
});

test("self projections without an explicit dives-into relation do not infer a child level", async () => {
  const { graph, registry } = await fixture(), isolated = structuredClone(graph);
  isolated.nodes["scene.view.quadrant"].relations = isolated.nodes["scene.view.quadrant"].relations
    .filter((item) => item.predicate.nodeId !== "relation.projection.predicate.dives-into");
  assert.equal(forwardRoute(navigationForRoot("scene.view.quadrant", isolated, registry), isolated, registry), undefined);
});

test("switching sibling observations does not create a semantic zoom level", () => {
  const self = { projectionNodeId: "self", observedNodeId: "node", scope: "self" };
  const children = { projectionNodeId: "children", observedNodeId: "node", scope: "children" };
  const flow = { projectionNodeId: "flow", observedNodeId: "node", scope: "children" };
  const entered = navigateProjection(initialNavigation(self), children);
  const switched = replaceCurrentProjection(entered, flow);
  assert.deepEqual(switched.entries, [self, flow]);
  assert.equal(switched.index, 1); assert.equal(switched.semanticScale, 1);
});

test("linking an ancestor as a child is rejected before a patch is returned", async () => {
  const { graph, registry } = await fixture(), command = registry.commands().get("relation.attach-child-projection");
  assert.throws(() => command({ parentProjectionId: "scene.view.children:scene.xiaoming", childProjectionId: "scene.view.properties:scene.today", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } }, graph), /cycle/);
});

test("projection panning and ordinary zoom move A3 spatial surfaces instead of the A2 semantic shell", async () => {
  const [semantic, containsStyles, containsElement, sceneStyles] = await Promise.all([
    readFile("pip-editor/relation-host/projection/semantic-projection.tsx", "utf8"),
    readFile("pip-editor-io/relation-projections/elements/styles.js", "utf8"),
    readFile("pip-editor-io/relation-projections/elements/contains-element.js", "utf8"),
    readFile("pip-editor-io/scene/elements/styles.js", "utf8"),
  ]);
  assert.doesNotMatch(semantic, /translate\(\$\{contentOffset\.x\}/);
  assert.match(semantic, /--projection-pan-x/);
  assert.match(semantic, /--projection-zoom/);
  assert.match(containsElement, /data-projection-surface/);
  assert.match(containsElement, /visible = data\.flowOnly === true/);
  assert.match(containsElement, /if \(data\.flowOnly\).*bindFlow/);
  assert.match(await readFile("pip-editor-io/scene/elements/render.js", "utf8"), /canvasViewport" data-projection-surface/);
  assert.match(containsStyles, /\.world\{[^}]*--projection-pan-x[^}]*--projection-zoom/);
  assert.doesNotMatch(containsStyles, /::slotted\(article\).*--projection-pan-x/);
  assert.match(containsElement, /\(x - panX\) \/ zoom - 160/);
  assert.match(sceneStyles, /\.canvas\{transform:translate\(var\(--projection-pan-x[^}]*scale\(var\(--projection-zoom/);
  assert.match(containsStyles, /\.surface\{[^}]*background-image/);
  assert.doesNotMatch(containsStyles, /\.world\{[^}]*background-image/);
  assert.match(containsStyles, /:host\{[^}]*overflow:clip/);
  assert.match(containsElement, /this\.scrollTop = 0/);
});

test("fixed Flow boundary ports are converted into the panned and zoomed world coordinate system", () => {
  assert.deepEqual(screenToFlowWorld({ x: 44, y: 92 }, { panX: -156, panY: -108, zoom: 2 }), { x: 100, y: 100 });
  assert.deepEqual(screenToFlowWorld({ x: 44, y: 92 }, { panX: 0, panY: 0, zoom: 1 }), { x: 44, y: 92 });
  assert.deepEqual(screenToElementLocal(
    { x: 36, y: 228 },
    { left: -146, top: 87.5, width: 1022, height: 821.25 },
    { width: 1120, height: 900 },
  ), { x: 199.45205479452056, y: 153.97260273972603 });
});

test("dragging a child updates only the active children projection frame", async () => {
  const { nodeMap: { graph } } = await buildIntentPluginSuite(), frame = { x: -120, y: 360, width: 320, height: 220, resizeMode: "simple" };
  const patch = moveChild({ parentProjectionId: "intent.view.children:intent.application-root", childProjectionId: "intent.view.properties:intent.document-loader", frame }, graph);
  assert.equal(patch.operations.length, 1);
  assert.equal(patch.operations[0].nodeId, "intent.view.children:intent.application-root");
  assert.deepEqual(patch.operations[0].relation.relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.frame").object.value, frame);
});

test("Flow animation follows only the latest event of an active session", () => {
  const trace = [{ nodeId: "loader", kind: "running" }, { nodeId: "loader", kind: "success" }, { nodeId: "action", kind: "running" }];
  assert.deepEqual([...liveFlowNodeIds({ status: "running", trace })], ["action"]);
  assert.deepEqual([...liveFlowNodeIds({ status: "cancelled", trace })], []);
  assert.equal(canCancelFlowSession({ status: "completed" }), false);
  assert.equal(canCancelFlowSession({ status: "draining" }), true);
});

test("ending a partial semantic pinch preserves its chosen scale", async () => {
  const canvas = await readFile("pip-editor/relation-host/view/workspace-canvas.tsx", "utf8");
  const settle = canvas.slice(canvas.indexOf("const finishGesture"), canvas.indexOf("const scale = gesture.scale"));
  assert.match(settle, /semanticGestures\.current\.delete/);
  assert.doesNotMatch(settle, /semanticScale:\s*1/);
  assert.match(settle, /if \(previous\?\.switched\) \{ finishGesture\(\); return; \}/);
  assert.equal(applySemanticScale({ entries: [{ projectionNodeId: "p", observedNodeId: "n", scope: "self" }], index: 0, semanticScale: 1 }, 1.3).semanticScale, 1.3);
});

test("semantic transition preserves the pre-rendered target across route promotion", async () => {
  const semantic = await readFile("pip-editor/relation-host/projection/semantic-projection.tsx", "utf8");
  assert.match(semantic, /key=\{entry\.projectionNodeId\}/);
  assert.match(semantic, /transitionActive \? 1 - progress : 1/);
  assert.match(semantic, /transitionActive = Boolean\(transition\)/);
  assert.match(semantic, /data-embedded-projection/);
  assert.match(semantic, /mix\(geometry\.scaleX, 1, progress\)/);
  assert.match(semantic, /const sourceTransform = "scale\(1\)"/);
  assert.match(semantic, /transformOrigin: geometry/);
  assert.match(semantic, /semanticOrigin\.x.*semanticOrigin\.y/);
  assert.match(semantic, /semanticTargetProjectionId/);
  assert.match(semantic, /semanticScale > 1\.4/);
  assert.match(semantic, /transitionActive \? progress : 0/);
});

test("semantic crossfade progress starts continuously at its render thresholds", () => {
  assert.equal(semanticProgress(1.4), 0);
  assert.ok(semanticProgress(1.4001) > 0);
  assert.ok(Math.abs(semanticProgress(1.55) - .5) < 1e-9);
  assert.equal(semanticProgress(.75), 0);
  assert.ok(semanticProgress(.7499) > 0);
  assert.ok(Math.abs(semanticProgress(.675) - .5) < 1e-9);
});
