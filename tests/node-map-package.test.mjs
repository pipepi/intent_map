import assert from "node:assert/strict";
import test from "node:test";
import { createNodeMapWorkspace, decodeNodeMapPackage, importRelationGraph, PortableNodeMapCatalog, selectRelationClosure } from "../pip-editor/relation-host/packages/node-map-package.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { exportNodeMap } from "../pip-editor/relation-host/packages/export-node-map.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip/index.ts";

test("Node Map closure follows relation refs without persisting edges", async () => {
  const suite = await buildScenePluginSuite();
  const selected = selectRelationClosure(suite.nodeMap.graph, ["scene.buy-btc"]);
  assert.ok(selected.nodes["scene.buy-btc"]); assert.ok(selected.nodes["scene.xiaoming"]); assert.equal("edges" in selected, false);
});

test("portable A5 carries exact A4/A3 PIPs and opens independent workspaces", async () => {
  const suite = await buildScenePluginSuite(), decoded = await decodeNodeMapPackage(suite.nodeMapPip);
  assert.equal(decoded.nodeTypes[0].contentSha256, decoded.nodeMap.manifest.dependencies[0].sha256);
  assert.equal(decoded.elementPlugins[0].contentSha256, decoded.nodeTypes[0].manifest.dependencies[0].sha256);
  const first = createNodeMapWorkspace(decoded.nodeMap, "workspace.first", decoded.contentSha256);
  const second = createNodeMapWorkspace(decoded.nodeMap, "workspace.second");
  first.graph.revision = 9; assert.equal(second.graph.revision, 0); assert.notEqual(first.graph, second.graph);
});

test("Node Map catalog is idempotent by exact PIP content", async () => {
  const suite = await buildScenePluginSuite(), portable = await decodeNodeMapPackage(suite.nodeMapPip), catalog = new PortableNodeMapCatalog();
  assert.equal(catalog.install(portable), "installed"); assert.equal(catalog.install(await decodeNodeMapPackage(suite.nodeMapPip)), "already-installed");
});

test("A5 rejects any tampered inner package before activation", async () => {
  const suite = await buildScenePluginSuite(), tampered = suite.nodeMapPip.slice(); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(() => decodeNodeMapPackage(tampered), /hash mismatch/);
});

test("relation graph import rewrites colliding node and relation identities", async () => {
  const suite = await buildScenePluginSuite(), imported = importRelationGraph(suite.nodeMap.graph, suite.nodeMap.graph);
  assert.notEqual(imported.nodeIds.get("scene.today"), "scene.today"); assert.equal(imported.graph.revision, 1);
});

test("thin A5 resolves already installed exact dependencies", async () => {
  const suite = await buildScenePluginSuite(), source = await decodeNodeMapPackage(suite.nodeMapPip);
  const workspace = { ...createNodeMapWorkspace(source.nodeMap, "workspace.export", source.contentSha256), undo: [], redo: [], capabilityDiagnostics: [] };
  const thin = await exportNodeMap(workspace, { source, portable: false });
  const packages = new Map([[source.nodeTypes[0].contentSha256, source.nodeTypes[0].pipBytes], [source.elementPlugins[0].contentSha256, source.elementPlugins[0].pipBytes]]);
  const decoded = await decodeNodeMapPackage(thin, { policy: UNLIMITED_PIP_IO_POLICY, resolvePackage: (ref) => packages.get(ref.sha256) });
  assert.deepEqual(decoded.nodeMap.graph, workspace.graph); assert.deepEqual(decoded.nodeMap.workspace.initialSelection, workspace.selection);
});
