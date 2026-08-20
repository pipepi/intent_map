import assert from "node:assert/strict";
import test from "node:test";
import { buildIntentPluginSuite, INTENT_TYPES } from "../plugins/intent/suite.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage, validateNodeTypeDependencies } from "../app/_editor/plugin-editor/node-type-package.ts";
import { NodeTypePluginRegistry } from "../app/_editor/plugin-editor/node-type-runtime.ts";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("executable v2 node type package round-trips and registers every declared type", async () => {
  const suite = await buildIntentPluginSuite();
  const decoded = await decodeNodeTypePackage(suite.nodeTypeArchive);
  assert.deepEqual(decoded.manifest.typeNodeIds, INTENT_TYPES);
  validateNodeTypeDependencies(decoded, [suite.element]);
  const registry = new NodeTypePluginRegistry({ load: dataModule });
  assert.equal(await registry.install(decoded), "installed");
  assert.equal(await registry.install(decoded), "already-active");
  assert.equal(registry.types().length, INTENT_TYPES.length);
  assert.ok(registry.executors().has("intent.evaluate"));
  registry.disable(decoded.manifest.id);
  assert.equal(registry.types().length, 0);
  assert.equal(await registry.install(decoded), "reactivated");
  await assert.rejects(() => registry.install({ ...decoded, manifest: { ...decoded.manifest, entrySha256: "f".repeat(64) } }), /conflicts with installed immutable package/);
});

test("node type entry rejects imports but permits import.meta", async () => {
  const suite = await buildIntentPluginSuite();
  await assert.rejects(() => encodeNodeTypePackage(suite.nodeType.manifest, suite.nodeType.ontology, 'export { x } from "./x.js";', { "source/index.js": "x" }), /self-contained ESM/);
  await encodeNodeTypePackage(suite.nodeType.manifest, suite.nodeType.ontology, "export default function register(){}; void import.meta.url;", { "source/index.js": "x" });
});

test("concurrent node type installs share one module execution", async () => {
  const suite = await buildIntentPluginSuite();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let loads = 0;
  const registry = new NodeTypePluginRegistry({ load: async (source) => { loads += 1; await gate; return dataModule(source); } });
  const first = registry.install(suite.nodeType);
  const second = registry.install(suite.nodeType);
  release();
  assert.deepEqual(await Promise.all([first, second]), ["installed", "already-active"]);
  assert.equal(loads, 1);
});

test("disable clears host registrations even when plugin cleanup throws", async () => {
  const suite = await buildIntentPluginSuite();
  const expected = suite.nodeType.manifest.typeNodeIds;
  const registry = new NodeTypePluginRegistry({ load: async () => ({ default(host) {
    for (const nodeId of expected) host.registerType({ type: { nodeId, relationId: "identity" }, name: nodeId });
    host.registerCommand("throwing.command", () => ({ schemaVersion: 1, baseRevision: 0, operations: [] }));
    return () => { throw new Error("cleanup exploded"); };
  } }) });
  await registry.install(suite.nodeType);
  assert.throws(() => registry.disable(suite.nodeType.manifest.id), /cleanup reported errors/);
  assert.equal(registry.types().length, 0);
  assert.equal(registry.commands().size, 0);
  assert.equal(registry.list()[0].active, false);
});

test("node type registrations must exactly match manifest identity refs", async () => {
  const suite = await buildIntentPluginSuite();
  const expected = suite.nodeType.manifest.typeNodeIds;
  const registry = new NodeTypePluginRegistry({ load: async () => ({ default(host) {
    for (const nodeId of expected) host.registerType({ type: { nodeId, relationId: "identity" }, name: nodeId });
    host.registerType({ type: { nodeId: "intent.type.undeclared", relationId: "identity" }, name: "undeclared" });
  } }) });
  await assert.rejects(() => registry.install(suite.nodeType), /extra \[intent\.type\.undeclared\/identity\]/);
  assert.equal(registry.types().length, 0);

  const wrongIdentity = new NodeTypePluginRegistry({ load: async () => ({ default(host) {
    for (const nodeId of expected) host.registerType({ type: { nodeId, relationId: nodeId === expected[0] ? "other" : "identity" }, name: nodeId });
  } }) });
  await assert.rejects(() => wrongIdentity.install(suite.nodeType), /missing .*\/identity.*extra .*\/other/);
  assert.equal(wrongIdentity.types().length, 0);
});

test("node type dependencies require exact installed element versions", async () => {
  const suite = await buildIntentPluginSuite();
  assert.throws(() => validateNodeTypeDependencies(suite.nodeType, []), /缺少/);
  assert.throws(() => validateNodeTypeDependencies(suite.nodeType, [{ manifest: { id: suite.element.manifest.id, version: "2.0.0" } }]), /精确版本/);
});
