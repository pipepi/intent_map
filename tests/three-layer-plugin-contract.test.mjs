import assert from "node:assert/strict";
import test from "node:test";
import { assertElementManifest, assertNodeCollectionManifest, assertNodeTypeManifest } from "../app/_editor/plugin-editor/package-validation.ts";
import { buildIntentPluginSuite } from "../plugins/intent/suite.ts";
import { buildScenePluginSuite } from "../plugins/scene/suite.ts";

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
