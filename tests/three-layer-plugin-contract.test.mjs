import assert from "node:assert/strict";
import test from "node:test";

import { assertElementManifest, assertNodeTypePackage, assertNodeCollection } from "../app/_editor/plugin-editor/package-validation.ts";

const element = {
  format: "intent-element-plugin", schemaVersion: 1, id: "official.text", name: "Text Elements", version: "1.0.0",
  entry: "entry.mjs", elements: [{ id: "text", tag: "intent-text-preview", purpose: "preview" }],
  permissions: [], sourcePaths: ["source/index.js"], sourceSha256: "a".repeat(64), entrySha256: "b".repeat(64),
  communityTags: ["source-reviewed"], redistributable: true,
};

test("accepts the three public package contracts", () => {
  assert.doesNotThrow(() => assertElementManifest(element));
  assert.doesNotThrow(() => assertNodeTypePackage({
    format: "intent-node-type-plugin", schemaVersion: 1, id: "official.text-node", name: "Text", version: "1.0.0",
    dependencies: [{ id: element.id, version: element.version }], nodeTypes: [{ type: "text", displayName: "文本", defaultName: "intent",
      fields: [{ key: "text", defaultValue: "", control: { pluginId: element.id, elementId: "input", sourceField: "text" } }],
      view: [{ pluginId: element.id, elementId: "text", sourceField: "text" }] }],
  }));
  assert.doesNotThrow(() => assertNodeCollection({ format: "intent-node-collection", schemaVersion: 1, id: "demo", name: "Demo",
    dependencies: [{ id: "official.text-node", version: "1.0.0" }], nodes: [], edges: [] }));
});

test("rejects malformed identities, versions, tags and executable node type data", () => {
  assert.throws(() => assertElementManifest({ ...element, version: "1" }), /version/);
  assert.throws(() => assertElementManifest({ ...element, elements: [{ id: "x", tag: "div", purpose: "preview" }] }), /tag/);
  assert.throws(() => assertElementManifest({ ...element, sourcePaths: [] }), /sourcePaths/);
  assert.throws(() => assertNodeTypePackage({ format: "intent-node-type-plugin", schemaVersion: 1, id: "x.y", name: "X", version: "1.0.0", dependencies: [], nodeTypes: [], script: "bad" }), /keys|nodeTypes/);
  assert.throws(() => assertNodeCollection({ format: "intent-node-collection", schemaVersion: 1, id: "x", name: "X", dependencies: [], nodes: [{ id: "a" }], edges: [] }), /node/);
});
