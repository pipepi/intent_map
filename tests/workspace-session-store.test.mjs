import { graphNodes, graphRevision, pipStatement } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { createNodeMapWorkspace } from "../pip-editor/pip-host/packages/node-map-package.ts";
import { WorkspaceSessionStore } from "../pip-editor/pip-host/workspace/workspace-store.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";

const session = async () => {
  const suite = await buildScenePluginSuite();
  const base = createNodeMapWorkspace(suite.nodeMap, "workspace.test");
  base.rootNodeIds = ["scene.view.quadrant", "scene.view.tube"];
  base.views = {
    kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 },
    projections: {
      "scene.view.quadrant": { x: 80, y: 80, width: 1120, height: 720, resizeMode: "simple" },
      "scene.view.tube": { x: 1320, y: 80, width: 1120, height: 720, resizeMode: "simple" },
    }, systemWindows: {},
  };
  base.selection = ["scene.deliver-breakfast"];
  base.scopedSelections = { "scene.view.quadrant": ["scene.deliver-breakfast"], "scene.view.tube": ["scene.deliver-breakfast"] };
  return { ...base, undo: [], redo: [], capabilityDiagnostics: [] };
};

test("workspace store validates before publishing and preserves state on failure", async () => {
  const initial = await session();
  const published = [];
  const store = new WorkspaceSessionStore([initial], (next) => published.push(next));
  const name = graphNodes(initial.graph)["scene.xiaoming"].pips.find(({ id }) => id === "name");
  const patch = { schemaVersion: 2, baseRevision: 0, operations: [{ op: "put", parent_path: ["scene.xiaoming"], pip: { ...name, predicate_value: { ...name.predicate_value, value: { kind: "const", value: "新名字" } } } }] };
  assert.throws(() => store.commitPatch(initial.id, patch, [() => { throw new Error("domain invalid"); }]), /domain invalid/);
  assert.equal(graphRevision(store.list()[0].graph), 0);
  assert.equal(published.length, 0);
  assert.throws(() => store.select(initial.id, ["missing"]), /unknown Pip/);
  assert.equal(published.length, 0);
});

test("workspace store commits, rejects stale commands, and maintains undo redo", async () => {
  const initial = await session();
  const store = new WorkspaceSessionStore([initial], () => {});
  const name = graphNodes(initial.graph)["scene.xiaoming"].pips.find(({ id }) => id === "name");
  const patch = { schemaVersion: 2, baseRevision: 0, operations: [{ op: "put", parent_path: ["scene.xiaoming"], pip: { ...name, predicate_value: { ...name.predicate_value, value: { kind: "const", value: "新名字" } } } }] };
  store.commitPatch(initial.id, patch, []);
  assert.equal(graphRevision(store.list()[0].graph), 1);
  store.setWindow(initial.id, "scene.view.quadrant", { x: 180, y: 160, width: 1120, height: 720, resizeMode: "full" });
  assert.throws(() => store.commitPatch(initial.id, patch, []), /Stale Pip patch/);
  store.history(initial.id, "undo", []);
  assert.equal(pipStatement(graphNodes(store.list()[0].graph)["scene.xiaoming"].pips.find(({ id }) => id === "name")).value.value, "小明");
  assert.equal(store.list()[0].views.projections["scene.view.quadrant"].x, 180);
  assert.equal(store.list()[0].views.projections["scene.view.quadrant"].resizeMode, "full");
  store.history(initial.id, "redo", []);
  assert.equal(pipStatement(graphNodes(store.list()[0].graph)["scene.xiaoming"].pips.find(({ id }) => id === "name")).value.value, "新名字");
  store.select(initial.id, ["scene.xiaoming", "scene.xiaoming"]);
  assert.deepEqual(store.list()[0].selection, ["scene.xiaoming"]);
  const beforeSelection = store.list()[0];
  store.select(initial.id, ["scene.buy-btc"], "scene.view.quadrant");
  const afterSelection = store.list()[0];
  assert.deepEqual(afterSelection.scopedSelections["scene.view.quadrant"], ["scene.buy-btc"]);
  assert.deepEqual(afterSelection.scopedSelections["scene.view.tube"], ["scene.deliver-breakfast"]);
  assert.equal(graphRevision(afterSelection.graph), graphRevision(beforeSelection.graph));
  assert.deepEqual(afterSelection.undo, beforeSelection.undo);
  assert.deepEqual(afterSelection.redo, beforeSelection.redo);
  assert.throws(() => store.select(initial.id, ["scene.xiaoming"], "scene.not-a-root"), /scope/);
});
