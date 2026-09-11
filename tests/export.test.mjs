import assert from "node:assert/strict";
import test from "node:test";
import { prepareDocumentExport } from "../pip-editor/pip-package/export.ts";
import { loadPipDocument, serializePipDocument } from "../pip-editor/pip/document.ts";
import { samplePipDocument } from "./pip-document-fixture.mjs";

test("prepares a deterministic PipDocument export with an integrity receipt", async () => {
  const serialized = serializePipDocument(samplePipDocument());
  const first = await prepareDocumentExport(serialized), second = await prepareDocumentExport(serialized);
  assert.equal(first.ok, true); assert.equal(second.ok, true);
  assert.equal(first.filename, "pip-workspace-v3.json");
  assert.match(first.sha256, /^[a-f0-9]{64}$/); assert.equal(first.sha256, second.sha256);
  assert.equal(loadPipDocument(JSON.parse(new TextDecoder().decode(first.bytes))).id, "pip-workspace@3");
});
