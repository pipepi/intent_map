import assert from "node:assert/strict";
import test from "node:test";
import { prepareDocumentExport } from "../app/runtime/export.ts";
import { loadRelationDocument, serializeRelationDocument } from "../app/relation/document.ts";
import { sampleRelationDocument } from "./relation-document-fixture.mjs";

test("prepares a deterministic RelationDocument export with an integrity receipt", async () => {
  const serialized = serializeRelationDocument(sampleRelationDocument());
  const first = await prepareDocumentExport(serialized), second = await prepareDocumentExport(serialized);
  assert.equal(first.ok, true); assert.equal(second.ok, true);
  assert.equal(first.filename, "relation-workspace-v1.json");
  assert.match(first.sha256, /^[a-f0-9]{64}$/); assert.equal(first.sha256, second.sha256);
  assert.equal(loadRelationDocument(JSON.parse(new TextDecoder().decode(first.bytes))).schemaVersion, 1);
});
