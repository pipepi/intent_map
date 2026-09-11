import { pipStatement, graphNodes, graphRevision } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NodeTypePluginRegistry } from "../pip-editor/pip-host/activation/node-type-registry.ts";
import { assertProjectionRegistration, normalizeProjectionRegistration } from "../pip-editor/pip-host/projection/projection-context.ts";
import { resolveNodePresentation } from "../pip-editor/pip-host/projection/resolve-presentation.ts";
import { initialNavigation, navigateProjection, replaceCurrentProjection } from "../pip-editor/pip-host/projection/projection-navigation.ts";
import { forwardRoute, navigationForRoot } from "../pip-editor/pip-host/projection/projection-routes.ts";
import { projectionFrameAtScale } from "../pip-editor/pip-host/projection/projection-scale.ts";
import { applySemanticScale, semanticProgress } from "../pip-editor/pip-host/projection/semantic-zoom.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { screenToElementLocal, screenToFlowWorld } from "../pip-editor-io/pip-projections/elements/flow-geometry.js";
import { moveChild } from "../pip-editor-io/pip-projections/runtime/commands.js";
import { canCancelFlowSession, liveFlowNodeIds } from "../pip-editor-io/pip-projections/elements/flow-runtime-state.js";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const pip = (node, predicate) => node.pips.find((item) => pipStatement(item).predicate.node_id === predicate);
const pips = (node, predicate) => node.pips.filter((item) => pipStatement(item).predicate.node_id === predicate);
async function fixture() {
  const suite = await buildScenePluginSuite(), registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(suite.support.nodeType); await registry.install(suite.nodeType);
  return { suite, registry, graph: suite.nodeMap.graph };
}
test("projection capabilities normalize legacy contexts into scope and surfaces", () => {
    const base = { id: "test", definition: { node_id: "test.definition", pip_id: "identity" }, matches: () => true, element: { pluginId: "p", elementId: "e" } };
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
    const projectionNodes = Object.values(graphNodes(graph)).filter((node) => pip(node, "pip.core.type")?.predicate_value?.value.target?.node_id === "pip.projection.type.instance");
    assert.equal(projectionNodes.length, 46);
    const internal = graphNodes(graph)["scene.view.children:scene.today"];
    assert.equal(pips(internal, "pip.projection.predicate.presents").length, 21);
    assert.equal(pipStatement(pip(graphNodes(graph)["scene.view.quadrant"], "pip.projection.predicate.dives-into")).value.target.node_id, internal.id);
    assert.equal(pipStatement(pip(graphNodes(graph)["scene.view.tube"], "pip.projection.predicate.dives-into")).value.target.node_id, internal.id);
    registry.validators().forEach((validate) => assert.doesNotThrow(() => validate(graph)));
});
test("explicit projection instances resolve by uses and enforce their context", async () => {
    const { graph, registry } = await fixture(), node = graphNodes(graph)["scene.view.properties:scene.xiaoming"];
    const elements = { resolve: (_pluginId, elementId) => ({ id: elementId, tag: `test-${elementId}`, purpose: "projection" }) };
    const embedded = resolveNodePresentation(node, graph, elements, registry, "workspace", { workspaceId: "w", rootNodeIds: [], workspaceView: {}, selection: [], projectionContext: { kind: "self-embedded", parentProjectionNodeId: "scene.view.children:scene.today", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } } });
    assert.equal(embedded.projection.id, "pip.properties");
    assert.equal(embedded.projectionData.compact, true);
    assert.deepEqual([embedded.context.scope, embedded.context.surface, embedded.context.kind], ["self", "embedded", "self-embedded"]);
    const invalid = resolveNodePresentation(graphNodes(graph)["scene.view.children:scene.today"], graph, elements, registry, "workspace", { workspaceId: "w", rootNodeIds: [], workspaceView: {}, selection: [], projectionContext: { kind: "self-embedded", parentProjectionNodeId: "x", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } } });
    assert.match(invalid.error, /does not support self-embedded/);
});
test("semantic routes recurse self → children → child self without creating nodes", async () => {
    const { graph, registry } = await fixture(), before = Object.keys(graphNodes(graph)).length;
    let navigation = navigationForRoot(
    "scene.view.quadrant",
    graph,
    registry,
  );
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
    assert.equal(Object.keys(graphNodes(graph)).length, before);
    assert.equal(graphRevision(graph), 0);
    assert.equal(semanticProgress(1.4), 0);
    assert.equal(semanticProgress(1.7), 1);
    assert.equal(semanticProgress(.6), 1);
});
test("projection window buttons zoom around the center and preserve semantic routing", async () => {
  const { graph, registry } = await fixture();
  const navigation = navigationForRoot(
    "scene.view.quadrant",
    graph,
    registry,
  );
  const frame = {
    x: 80,
    y: 80,
    width: 1000,
    height: 600,
    resizeMode: "full",
    contentOffset: { x: 0, y: 0 },
    navigation,
  };

  const zoomed = projectionFrameAtScale(
    frame,
    navigation,
    1.2,
    graph,
    registry,
    [],
  );
  assert.equal(zoomed.navigation.semanticScale, 1.2);
  assert.deepEqual(zoomed.contentOffset, { x: -100, y: -60 });

  const advanced = projectionFrameAtScale(
    frame,
    navigation,
    1.7,
    graph,
    registry,
    [],
  );
  assert.equal(advanced.navigation.index, navigation.index + 1);
  assert.equal(advanced.navigation.semanticScale, 1);
  assert.deepEqual(advanced.contentOffset, frame.contentOffset);
});
test("self projections without an explicit dives-into pip do not infer a child level", async () => {
    const { graph, registry } = await fixture(), isolated = structuredClone(graph);
    graphNodes(isolated)["scene.view.quadrant"].pips = graphNodes(isolated)["scene.view.quadrant"].pips
        .filter((item) => pipStatement(item).predicate.node_id !== "pip.projection.predicate.dives-into");
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
  const { graph, registry } = await fixture(), command = registry.commands().get("pip.attach-child-projection");
  assert.throws(() => command({ parentProjectionId: "scene.view.children:scene.xiaoming", childProjectionId: "scene.view.properties:scene.today", frame: { x: 0, y: 0, width: 320, height: 220, resizeMode: "simple" } }, graph), /cycle/);
});
test("projection panning and ordinary zoom move A3 spatial surfaces instead of the A2 semantic shell", async () => {
  const [semantic, containsStyles, containsElement, sceneStyles] = await Promise.all([
    readFile("pip-editor/pip-host/projection/semantic-projection.tsx", "utf8"),
    readFile("pip-editor-io/pip-projections/elements/styles.js", "utf8"),
    readFile("pip-editor-io/pip-projections/elements/contains-element.js", "utf8"),
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
    assert.equal(patch.operations[0].parent_path[0], "intent.view.children:intent.application-root");
    assert.deepEqual(pipStatement(patch.operations[0].pip.pips.find((item) => pipStatement(item).predicate.node_id === "pip.projection.predicate.frame")).value.value, frame);
});
test("Flow animation follows only the latest event of an active session", () => {
  const trace = [{ nodeId: "loader", kind: "running" }, { nodeId: "loader", kind: "success" }, { nodeId: "action", kind: "running" }];
  assert.deepEqual([...liveFlowNodeIds({ status: "running", trace })], ["action"]);
  assert.deepEqual([...liveFlowNodeIds({ status: "cancelled", trace })], []);
  assert.equal(canCancelFlowSession({ status: "completed" }), false);
  assert.equal(canCancelFlowSession({ status: "draining" }), true);
});
test("ending a partial semantic pinch preserves its chosen scale", async () => {
  const canvas = await readFile("pip-editor/pip-host/view/workspace-canvas-wheel.ts", "utf8");
  const settle = canvas.slice(canvas.indexOf("const finishGesture"), canvas.indexOf("const scale = gesture.scale"));
  assert.match(settle, /semanticGestures\.current\.delete/);
  assert.doesNotMatch(settle, /semanticScale:\s*1/);
  assert.match(settle, /if \(previous\?\.switched\) \{\s*finishGesture\(\);\s*return;\s*\}/);
  assert.equal(applySemanticScale({ entries: [{ projectionNodeId: "p", observedNodeId: "n", scope: "self" }], index: 0, semanticScale: 1 }, 1.3).semanticScale, 1.3);
});
test("semantic transition preserves the pre-rendered target across route promotion", async () => {
  const semantic = await readFile("pip-editor/pip-host/projection/semantic-projection.tsx", "utf8");
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
