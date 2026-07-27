import assert from "node:assert/strict";
import test from "node:test";

import { prepareDocumentExport } from "../app/runtime/export.ts";
import {
  createApplicationDocument,
  loadIntentDocument,
  serializeIntentDocument,
} from "../app/runtime/model.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

test("prepares a deterministic v3 export with an integrity receipt", async () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const serialized = serializeIntentDocument(document);
  const first = await prepareDocumentExport(serialized);
  const second = await prepareDocumentExport(serialized);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.filename, "intent-map-v3.intent-map.json");
  assert.equal(first.byteLength, first.bytes.byteLength);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(
    loadIntentDocument(JSON.parse(new TextDecoder().decode(first.bytes))).version,
    3,
  );
});
