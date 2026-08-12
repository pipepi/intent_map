import assert from "node:assert/strict";
import test from "node:test";
import { decodeCollectionPackage, encodeCollectionPackage, selectCollection } from "../app/_editor/plugin-editor/collection-package.ts";

const collection = { format: "intent-node-collection", schemaVersion: 1, id: "demo", name: "Demo", dependencies: [], nodes: [
  { id: "a", type: "text", name: "A", values: { text: "a" }, x: 1, y: 2 }, { id: "b", type: "text", name: "B", values: {}, x: 3, y: 4 }, { id: "c", type: "text", name: "C", values: {}, x: 5, y: 6 },
], edges: [{ id: "ab", sourceId: "a", targetId: "b" }, { id: "bc", sourceId: "b", targetId: "c" }] };

test("selected collection retains only selected nodes and internal edges", () => {
  const selected = selectCollection(collection, new Set(["a", "b"]));
  assert.deepEqual(selected.nodes.map((node) => node.id), ["a", "b"]);
  assert.deepEqual(selected.edges.map((edge) => edge.id), ["ab"]);
});

test("portable collection round-trips deterministically", async () => {
  const input = { collection, nodeTypes: [], elementPlugins: [] };
  const first = encodeCollectionPackage(input), second = encodeCollectionPackage(input);
  assert.deepEqual(first, second);
  assert.deepEqual((await decodeCollectionPackage(first)).collection, collection);
});

test("collection export rejects non-redistributable element plugins", () => {
  assert.throws(() => encodeCollectionPackage({ collection, nodeTypes: [], elementPlugins: [{ manifest: { id: "private.x", redistributable: false } }] }), /不可再分发/);
});
