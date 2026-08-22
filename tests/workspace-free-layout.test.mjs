import assert from "node:assert/strict";
import test from "node:test";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { createNodeMapWorkspace } from "../pip-editor/relation-host/packages/node-map-package.ts";
import { exportedWorkspaceViews, normalizeFreeLayout } from "../pip-editor/relation-host/workspace/view-state.ts";
import { graphFingerprint, WorkspaceSessionStore } from "../pip-editor/relation-host/workspace/workspace-store.ts";

const session = async () => {
  const suite = await buildScenePluginSuite(), base = createNodeMapWorkspace(suite.nodeMap, "workspace.layout");
  return { suite, workspace: { ...base, undo: [], redo: [], capabilityDiagnostics: [], savedGraphFingerprint: graphFingerprint(base.graph) } };
};

test("view-only changes preserve graph revision and history while system windows stay local", async () => {
  const { workspace } = await session(), store = new WorkspaceSessionStore([workspace], () => {});
  store.openPluginManager(workspace.id, { x: 300, y: 240 });
  let current = store.list()[0], views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(current.graph.revision, 0); assert.equal(current.undo.length, 0);
  assert.equal(views.systemWindows["host.plugin-manager"].frame.x, 300);
  store.setWindow(workspace.id, "host.plugin-manager", { x: 360, y: 280, width: 700, height: 760, resizeMode: "simple" });
  current = store.list()[0]; views = normalizeFreeLayout(current.views, current.rootNodeIds);
  assert.equal(views.systemWindows["host.plugin-manager"].frame.resizeMode, "simple");
  assert.deepEqual(exportedWorkspaceViews(current.views).systemWindows, {});
  assert.equal(current.graph.revision, 0); assert.equal(current.undo.length, 0);
});

test("creator transaction adds a projection root and undo restores graph roots and views", async () => {
  const { suite, workspace } = await session(), store = new WorkspaceSessionStore([workspace], () => {});
  const source = structuredClone(workspace.graph.nodes["scene.view.quadrant"]); source.id = "scene.view.created";
  const result = {
    patch: { schemaVersion: 1, baseRevision: 0, operations: [{ op: "put-node", node: source }] },
    addRootNodeIds: [source.id], preferredProjection: { projectionId: source.id, width: 1120, height: 720 },
  };
  store.commitCreation(workspace.id, result, { x: 400, y: 300 }, []);
  let current = store.list()[0];
  assert.equal(current.graph.revision, 1); assert.ok(current.rootNodeIds.includes(source.id)); assert.ok(normalizeFreeLayout(current.views, current.rootNodeIds).projections[source.id]);
  store.history(workspace.id, "undo", []); current = store.list()[0];
  assert.equal(current.graph.nodes[source.id], undefined); assert.deepEqual(current.rootNodeIds, suite.nodeMap.manifest.rootNodeIds);
  store.history(workspace.id, "redo", []); current = store.list()[0];
  assert.ok(current.graph.nodes[source.id]); assert.ok(current.rootNodeIds.includes(source.id));
});

test("workspace frame validation rejects invalid geometry without publishing", async () => {
  const { workspace } = await session(); let publishes = 0;
  const store = new WorkspaceSessionStore([workspace], () => { publishes += 1; });
  assert.throws(() => store.setWindow(workspace.id, "scene.view.quadrant", { x: -1, y: 0, width: 100, height: 100, resizeMode: "simple" }), /size|outside/);
  assert.equal(publishes, 0); assert.equal(store.list()[0].graph.revision, 0);
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
