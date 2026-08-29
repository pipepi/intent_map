import assert from "node:assert/strict";
import test from "node:test";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { createNodeMapWorkspace } from "../pip-editor/relation-host/packages/node-map-package.ts";
import { exportedWorkspaceViews, normalizeFreeLayout, panWindowContent, preserveSystemWindows, zoomWindowContentAt } from "../pip-editor/relation-host/workspace/view-state.ts";
import { graphFingerprint, WorkspaceSessionStore } from "../pip-editor/relation-host/workspace/workspace-store.ts";

const session = async () => {
  const suite = await buildScenePluginSuite(), base = createNodeMapWorkspace(suite.nodeMap, "workspace.layout");
  base.rootNodeIds = ["scene.view.quadrant", "scene.view.tube"];
  base.views = {
    kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 },
    projections: {
      "scene.view.quadrant": { x: 80, y: 80, width: 1120, height: 720, resizeMode: "simple" },
      "scene.view.tube": { x: 1320, y: 80, width: 1120, height: 720, resizeMode: "simple" },
    }, systemWindows: {},
  };
  base.scopedSelections = { "scene.view.quadrant": [], "scene.view.tube": [] };
  return { suite, workspace: { ...base, undo: [], redo: [], capabilityDiagnostics: [], savedGraphFingerprint: graphFingerprint(base.graph) } };
};

test("projection zoom keeps the world point under the pointer stationary", () => {
  const frame = { x: 0, y: 0, width: 800, height: 600, resizeMode: "simple", contentOffset: { x: 40, y: -20 } };
  const pointer = { x: 300, y: 180 }, zoomed = zoomWindowContentAt(frame, pointer, 1, 1.3);
  const before = { x: (pointer.x - frame.contentOffset.x), y: (pointer.y - frame.contentOffset.y) };
  assert.deepEqual({ x: (pointer.x - zoomed.contentOffset.x) / 1.3, y: (pointer.y - zoomed.contentOffset.y) / 1.3 }, before);
});

test("workspace frame accepts a finite pointer origin for semantic transitions", () => {
  const views = normalizeFreeLayout({ kind: "free-layout", projections: { p: {
    x: 0, y: 0, width: 800, height: 600, resizeMode: "simple",
    navigation: { entries: [{ projectionNodeId: "p", observedNodeId: "n", context: "self-workspace" }], index: 0, semanticScale: 1.55, semanticOrigin: { x: 260, y: 180 } },
  } }, systemWindows: {} }, ["p"]);
  assert.deepEqual(views.projections.p.navigation.semanticOrigin, { x: 260, y: 180 });
  assert.deepEqual(views.projections.p.navigation.entries[0], { projectionNodeId: "p", observedNodeId: "n", scope: "self" });
  assert.equal("context" in exportedWorkspaceViews(views).projections.p.navigation.entries[0], false);
});

test("view-only changes preserve graph revision and history while system windows stay local", async () => {
  const { workspace } = await session(), store = new WorkspaceSessionStore([workspace], () => {});
  store.openPluginManager(workspace.id, { x: 300, y: 240 });
  let current = store.list()[0], views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(current.graph.revision, 0); assert.equal(current.undo.length, 0);
  assert.deepEqual({ x: views.systemWindows["host.plugin-manager"].frame.x, y: views.systemWindows["host.plugin-manager"].frame.y }, { x: 0, y: 0 });
  assert.equal(views.activeWindowId, "host.plugin-manager");
  store.activateWindow(workspace.id, "scene.view.quadrant");
  current = store.list()[0]; views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(views.activeWindowId, "scene.view.quadrant"); assert.equal(views.frontWindowId, "scene.view.quadrant");
  store.updateViews(workspace.id, { ...views, activeWindowId: undefined });
  current = store.list()[0]; views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(views.activeWindowId, undefined); assert.equal(views.frontWindowId, "scene.view.quadrant");
  store.setWindow(workspace.id, "host.plugin-manager", { x: 360, y: 280, width: 700, height: 760, resizeMode: "simple" });
  current = store.list()[0]; views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(views.systemWindows["host.plugin-manager"].frame.resizeMode, "simple");
  store.setWindow(workspace.id, "scene.view.quadrant", { ...views.projections["scene.view.quadrant"], contentScale: 1.4 });
  current = store.list()[0]; views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(views.projections["scene.view.quadrant"].contentScale, 1.4);
  store.setWindow(workspace.id, "scene.view.quadrant", { ...views.projections["scene.view.quadrant"], navigation: {
    entries: [{ projectionNodeId: "scene.view.quadrant", observedNodeId: "scene.today", context: "self-workspace" }], index: 0, semanticScale: 1,
  } });
  current = store.list()[0];
  assert.deepEqual(current.views.projections["scene.view.quadrant"].navigation.entries[0], { projectionNodeId: "scene.view.quadrant", observedNodeId: "scene.today", scope: "self" });
  assert.deepEqual(exportedWorkspaceViews(current.views).systemWindows, {});
  assert.equal(exportedWorkspaceViews(current.views).activeWindowId, undefined);
  assert.equal(exportedWorkspaceViews(current.views).frontWindowId, "scene.view.quadrant");
  assert.equal(current.graph.revision, 0); assert.equal(current.undo.length, 0);
});

test("workspace camera starts at the origin but permits movement beyond the top-left boundary", async () => {
  assert.equal(normalizeFreeLayout({ kind: "free-layout" }, []).camera.scale, 1);
  const { workspace } = await session();
  workspace.views.camera = { scale: 1, x: 36, y: 36 };
  const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
  assert.deepEqual(views.camera, { scale: 1, x: 36, y: 36 });
});

test("projection content pan is independent from the workspace camera", () => {
  const frame = { x: 80, y: 80, width: 1120, height: 720, resizeMode: "simple" };
  const panned = panWindowContent(frame, { x: 45, y: -30 });
  assert.deepEqual(panned.contentOffset, { x: -45, y: 30 });
  assert.deepEqual({ x: panned.x, y: panned.y }, { x: 80, y: 80 });
});

test("creator transaction adds a projection root and undo restores graph roots and views", async () => {
  const { workspace } = await session(), store = new WorkspaceSessionStore([workspace], () => {});
  const initialRootNodeIds = [...workspace.rootNodeIds];
  const source = structuredClone(workspace.graph.nodes["scene.view.quadrant"]); source.id = "scene.view.created";
  const result = {
    patch: { schemaVersion: 1, baseRevision: 0, operations: [{ op: "put-node", node: source }] },
    addRootNodeIds: [source.id], preferredProjection: { projectionId: source.id, width: 1120, height: 720 },
  };
  store.commitCreation(workspace.id, result, { x: 400, y: 300 }, []);
  let current = store.list()[0];
  assert.equal(current.graph.revision, 1); assert.ok(current.rootNodeIds.includes(source.id));
  const createdViews = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.deepEqual({ x: createdViews.projections[source.id].x, y: createdViews.projections[source.id].y }, { x: 0, y: 0 });
  assert.equal(createdViews.activeWindowId, source.id); assert.equal(createdViews.frontWindowId, source.id);
  store.history(workspace.id, "undo", []); current = store.list()[0];
  assert.equal(current.graph.nodes[source.id], undefined); assert.deepEqual(current.rootNodeIds, initialRootNodeIds);
  store.history(workspace.id, "redo", []); current = store.list()[0];
  assert.ok(current.graph.nodes[source.id]); assert.ok(current.rootNodeIds.includes(source.id));
});

test("workspace frame validation rejects invalid geometry without publishing", async () => {
  const { workspace } = await session(); let publishes = 0;
  const store = new WorkspaceSessionStore([workspace], () => { publishes += 1; });
  store.setWindow(workspace.id, "scene.view.quadrant", { x: -320, y: -180, width: 800, height: 600, resizeMode: "simple" });
  assert.deepEqual(normalizeFreeLayout(store.list()[0].views, workspace.rootNodeIds).projections["scene.view.quadrant"], {
    x: -320, y: -180, width: 800, height: 600, resizeMode: "simple", execution: { flowLayerVisible: true, followActiveEvent: false },
  });
  assert.throws(() => store.setWindow(workspace.id, "scene.view.quadrant", { x: 0, y: 0, width: 100, height: 100, resizeMode: "simple" }), /size/);
  assert.throws(() => store.setWindow(workspace.id, "scene.view.quadrant", { x: 2200, y: 0, width: 800, height: 600, resizeMode: "simple" }), /outside/);
  assert.throws(() => store.setWindow(workspace.id, "scene.view.quadrant", { x: 0, y: 0, width: 800, height: 600, resizeMode: "simple", contentScale: 3 }), /content scale/);
  assert.throws(() => store.setWindow(workspace.id, "scene.view.quadrant", { x: 0, y: 0, width: 800, height: 600, resizeMode: "simple", contentOffset: { x: 0, y: "bad" } }), /content offset/);
  assert.equal(publishes, 1); assert.equal(store.list()[0].graph.revision, 0);
});

test("closing a projection root keeps its graph data and makes it creatable again", async () => {
  const { workspace } = await session(), store = new WorkspaceSessionStore([workspace], () => {});
  store.closeProjectionRoot(workspace.id, "scene.view.quadrant");
  const current = store.list()[0];
  assert.ok(current.graph.nodes["scene.view.quadrant"]); assert.ok(!current.rootNodeIds.includes("scene.view.quadrant"));
  assert.equal(normalizeFreeLayout(current.views, current.rootNodeIds).projections["scene.view.quadrant"], undefined);
});

test("system manager overlays a non-free workspace without replacing its domain view kind", async () => {
  const { workspace } = await session(); workspace.views = { kind: "workbench", panels: ["tree", "canvas"] };
  const store = new WorkspaceSessionStore([workspace], () => {});
  store.openPluginManager(workspace.id, { x: 120, y: 100 });
  const views = store.list()[0].views;
  assert.equal(views.kind, "workbench"); assert.ok(views.systemWindows["host.plugin-manager"]);
  const exported = exportedWorkspaceViews(views);
  assert.equal(exported.kind, "workbench"); assert.deepEqual(exported.systemWindows, {});
});

test("reusing a blank tab for A5 preserves its local plugin manager", async () => {
  const previous = normalizeFreeLayout({ kind: "free-layout", systemWindows: {
    "host.plugin-manager": { id: "host.plugin-manager", type: "plugin-manager", frame: { x: 120, y: 100, width: 640, height: 720, resizeMode: "full" } },
  }, activeWindowId: "host.plugin-manager" }, []);
  const next = preserveSystemWindows({ kind: "free-layout", projections: {}, systemWindows: {} }, previous, []);
  const views = normalizeFreeLayout(next, []);
  assert.ok(views.systemWindows["host.plugin-manager"]); assert.equal(views.activeWindowId, "host.plugin-manager"); assert.equal(views.frontWindowId, "host.plugin-manager");
});
