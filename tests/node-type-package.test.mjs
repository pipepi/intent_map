import assert from "node:assert/strict";
import test from "node:test";
import { parseNodeTypePackage, validateNodeTypeDependencies } from "../app/_editor/plugin-editor/node-type-registry.ts";
import { SAMPLE_NODE_TYPE_PACKAGES } from "../app/_editor/plugin-editor/sample-packages.ts";

test("sample node types parse and reject executable fields", () => {
  const parsed = parseNodeTypePackage(JSON.stringify(SAMPLE_NODE_TYPE_PACKAGES[0]));
  assert.deepEqual(parsed, SAMPLE_NODE_TYPE_PACKAGES[0]);
  assert.throws(() => parseNodeTypePackage(JSON.stringify({ ...parsed, script: "bad" })), /keys/);
});

test("node type dependencies require exact installed elements and declarations", () => {
  const plugin = SAMPLE_NODE_TYPE_PACKAGES[0];
  assert.throws(() => validateNodeTypeDependencies(plugin, []), /缺少/);
  const element = { manifest: { id: "official.text-elements", version: "2.0.0", elements: [] } };
  assert.throws(() => validateNodeTypeDependencies(plugin, [element]), /精确版本/);
  element.manifest.version = "1.0.0";
  assert.throws(() => validateNodeTypeDependencies(plugin, [element]), /未知/);
});
