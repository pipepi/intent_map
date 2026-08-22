import assert from "node:assert/strict";
import test from "node:test";
import { assertPipManifest } from "../pip-editor/pip/index.ts";
import { decodeNodeMapPackage } from "../pip-editor/relation-host/packages/node-map-package.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";

test("Intent and Scene produce strict A3, A4 and A5 PIPs", async () => {
  for (const suite of [await buildIntentPluginSuite(), await buildScenePluginSuite()]) {
    assert.equal(assertPipManifest(suite.element.manifest).layer, "a3");
    assert.equal(assertPipManifest(suite.nodeType.manifest).layer, "a4");
    assert.equal(assertPipManifest(suite.nodeMap.manifest).layer, "a5");
    const portable = await decodeNodeMapPackage(suite.nodeMapPip);
    assert.equal(portable.nodeTypes[0].manifest.dependencies[0].sha256, portable.elementPlugins[0].contentSha256);
    assert.equal(portable.nodeMap.manifest.dependencies[0].sha256, portable.nodeTypes[0].contentSha256);
  }
});

test("old ZIP manifest contracts are rejected", () => {
  assert.throws(() => assertPipManifest({ format: "intent-element-plugin", schemaVersion: 2 }), /Invalid/);
  assert.throws(() => assertPipManifest({ format: "intent-node-type-plugin", schemaVersion: 2 }), /Invalid/);
  assert.throws(() => assertPipManifest({ format: "intent-node-collection", schemaVersion: 2 }), /Invalid/);
});
