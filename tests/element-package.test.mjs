import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage, encodeElementPackage } from "../app/_editor/plugin-editor/element-package.ts";
import { decodeZip, encodeZip } from "../app/_editor/plugin-editor/zip-package.ts";

const manifest = { format: "intent-element-plugin", schemaVersion: 1, id: "official.text", name: "Text", version: "1.0.0", entry: "entry.mjs",
  elements: [{ id: "text", tag: "intent-text-preview", purpose: "preview" }], permissions: [], sourcePaths: ["source/index.js"],
  sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64), communityTags: ["source-reviewed"], redistributable: true };

test("element ZIP encoding is deterministic and round-trips", async () => {
  const first = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  const second = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  assert.deepEqual(first, second);
  const decoded = await decodeElementPackage(first);
  assert.equal(decoded.manifest.id, manifest.id);
  assert.match(decoded.entrySource, /ok/);
});

test("ZIP parser rejects unsafe, unexpected and tampered packages", async () => {
  assert.throws(() => encodeZip({ "../escape": "bad" }), /invalid/);
  const valid = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  const files = decodeZip(valid);
  files["entry.mjs"][0] ^= 1;
  await assert.rejects(() => decodeElementPackage(encodeZip(files)), /hash/);
  await assert.rejects(() => decodeElementPackage(encodeZip({ ...files, "extra.txt": "x" })), /Unexpected/);
});
