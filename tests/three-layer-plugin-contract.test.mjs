import assert from "node:assert/strict";
import test from "node:test";
import { assertElementManifest, assertNodeCollectionManifest, assertNodeTypeManifest } from "../pip-editor/relation-host/contracts/package-validation.ts";
import { buildIntentPluginSuite } from "../pip-editor-plugins/intent/suite.ts";
import { buildScenePluginSuite } from "../pip-editor-plugins/scene/suite.ts";

test("external Intent and Scene suites satisfy all three v2 package contracts", async () => {
  for (const suite of [await buildIntentPluginSuite(), await buildScenePluginSuite()]) {
    assert.doesNotThrow(() => assertElementManifest(suite.element.manifest));
    assert.doesNotThrow(() => assertNodeTypeManifest(suite.nodeType.manifest));
    assert.doesNotThrow(() => assertNodeCollectionManifest(suite.collection.manifest));
  }
});

test("v1 package contracts are explicitly obsolete", () => {
  assert.throws(() => assertElementManifest({ format: "intent-element-plugin", schemaVersion: 1 }), /obsolete|invalid/);
  assert.throws(() => assertNodeTypeManifest({ format: "intent-node-type-plugin", schemaVersion: 1 }), /obsolete|invalid/);
  assert.throws(() => assertNodeCollectionManifest({ format: "intent-node-collection", schemaVersion: 1 }), /obsolete|invalid/);
});

test("runtime ABI v1 packages are obsolete even when their package schema is v2", async () => {
  const suite = await buildScenePluginSuite();
  assert.throws(() => assertElementManifest({ ...suite.element.manifest, runtimeAbi: "relation-element/1" }), /obsolete|invalid/);
  assert.throws(() => assertNodeTypeManifest({ ...suite.nodeType.manifest, runtimeAbi: "relation-node-type/1" }), /obsolete|invalid/);
});
