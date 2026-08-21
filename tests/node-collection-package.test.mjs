import assert from "node:assert/strict";
import test from "node:test";
import { decodeCollectionPackage, createCollectionWorkspace, encodeCollectionPackage, importRelationGraph, PortableCollectionCatalog, selectRelationClosure } from "../app/_editor/plugin-editor/collection-package.ts";
import { activateCollectionDependencies } from "../app/_editor/plugin-editor/collection-activation.ts";
import { assertRelationGraph } from "../app/relation/model.ts";
import { buildScenePluginSuite } from "../plugins/scene/suite.ts";
import { decodeZip, encodeZip } from "../app/_editor/plugin-editor/zip-package.ts";

test("collection closure follows object and predicate references without persisting edges", async () => {
  const suite = await buildScenePluginSuite();
  const selected = selectRelationClosure(suite.collection.graph, ["scene.buy-btc"]);
  for (const id of ["scene.buy-btc", "scene.xiaoming", "scene.usdt", "scene.btc", "scene.predicate.subject"]) assert.ok(selected.nodes[id], id);
  assert.equal("edges" in selected, false);
});

test("portable collection carries exact dependencies and opens independent workspaces", async () => {
  const suite = await buildScenePluginSuite();
  const decoded = await decodeCollectionPackage(suite.collectionArchive);
  assert.equal(decoded.nodeTypes[0].manifest.id, "official.scene-types");
  assert.equal(decoded.elementPlugins[0].manifest.id, "official.scene-elements");
  const first = createCollectionWorkspace(decoded.collection, "workspace.first", decoded.contentSha256);
  const second = createCollectionWorkspace(decoded.collection, "workspace.second");
  first.graph.revision = 9;
  assert.equal(second.graph.revision, 0);
  assert.notEqual(first.graph, second.graph);
  assert.deepEqual(first.rootNodeIds, ["scene.view.quadrant", "scene.view.tube"]);
  assert.notEqual(first.rootNodeIds, decoded.collection.manifest.rootNodeIds);
  assert.match(decoded.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.source.contentSha256, decoded.contentSha256);
});

test("collection catalog is idempotent by content and rejects changed same-version content", async () => {
  const suite = await buildScenePluginSuite();
  const first = await decodeCollectionPackage(suite.collectionArchive);
  const catalog = new PortableCollectionCatalog();
  assert.equal(catalog.install(first), "installed");
  assert.equal(catalog.install(await decodeCollectionPackage(suite.collectionArchive)), "already-installed");
  const reformattedFiles = decodeZip(suite.collectionArchive);
  reformattedFiles["manifest.json"] = new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(reformattedFiles["manifest.json"]))));
  assert.equal((await decodeCollectionPackage(encodeZip(reformattedFiles))).contentSha256, first.contentSha256, "JSON formatting and ZIP layout are normalized");

  const changedArchive = encodeCollectionPackage({
    collection: { ...suite.collection, workspace: { ...suite.collection.workspace, views: { kind: "changed" } } },
    nodeTypes: [suite.nodeType],
    elementPlugins: [suite.element],
  });
  const changed = await decodeCollectionPackage(changedArchive);
  assert.notEqual(changed.contentSha256, first.contentSha256);
  assert.throws(() => catalog.install(changed), /conflicts with installed immutable package/);

  const nextVersionArchive = encodeCollectionPackage({
    collection: { ...suite.collection, manifest: { ...suite.collection.manifest, version: "3.0.0" } },
    nodeTypes: [suite.nodeType],
    elementPlugins: [suite.element],
  });
  assert.equal(catalog.install(await decodeCollectionPackage(nextVersionArchive)), "installed");
  assert.equal(catalog.list().length, 2);
});

test("graph import remaps colliding node and nested relation references recursively", async () => {
  const suite = await buildScenePluginSuite();
  const imported = importRelationGraph(suite.collection.graph, suite.collection.graph);
  assertRelationGraph(imported.graph);
  assert.equal(imported.nodeIds.get("scene.xiaoming"), "scene.xiaoming~2");
  assert.equal(imported.relationIds.get("scene.buy-btc\u0000subject:0"), "subject:0");
  const copiedSubject = imported.graph.nodes["scene.buy-btc~2"].relations.find(({ id }) => id === "subject:0");
  assert.equal(copiedSubject.object.target.nodeId, "scene.xiaoming~2");
  assert.equal(copiedSubject.predicate.nodeId, "scene.predicate.subject~2");
});

test("collection decoding is data-only and dependency activation happens explicitly in layer order", async () => {
  const suite = await buildScenePluginSuite();
  const portable = await decodeCollectionPackage(suite.collectionArchive);
  const calls = [];
  const host = {
    elements: () => [],
    nodeTypes: () => [],
    installElement: async (plugin) => { calls.push(`element:${plugin.manifest.id}`); return "installed"; },
    installNodeType: async (plugin) => { calls.push(`node-type:${plugin.manifest.id}`); return "installed"; },
  };
  assert.deepEqual(calls, [], "decoding a collection must not execute embedded plugins");
  assert.deepEqual(await activateCollectionDependencies(portable, host), []);
  assert.deepEqual(calls, ["element:official.scene-elements", "node-type:official.scene-types"]);
});

test("collection activation reports missing, disabled and failed dependencies without throwing", async () => {
  const suite = await buildScenePluginSuite();
  const portable = { ...await decodeCollectionPackage(suite.collectionArchive), elementPlugins: [] };
  const diagnostics = await activateCollectionDependencies(portable, {
    elements: () => [],
    nodeTypes: () => [],
    installElement: async () => "installed",
    installNodeType: async () => { throw new Error("registration failed"); },
  });
  assert.deepEqual(diagnostics.map(({ dependencyKind, stage }) => [dependencyKind, stage]), [["element", "resolve"], ["node-type", "activate"]]);
  assert.match(diagnostics[1].message, /registration failed/);
});
