import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage, encodeElementPackage } from "../app/_editor/plugin-editor/element-package.ts";
import { decodeZip, encodeZip } from "../app/_editor/plugin-editor/zip-package.ts";

const manifest = { format: "intent-element-plugin", schemaVersion: 2, runtimeAbi: "relation-element/2", id: "official.text", name: "Text", version: "1.0.0", entry: "entry.mjs",
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

test("element decoder rejects obsolete v1 manifests", async () => {
  const archive = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  const files = decodeZip(archive);
  const obsolete = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  obsolete.schemaVersion = 1;
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(obsolete));
  await assert.rejects(() => decodeElementPackage(encodeZip(files)), /obsolete/);
});

test("element entry must be self-contained ESM", async () => {
  for (const source of [
    'import "https://example.com/plugin.js";',
    'export { value } from "./relative.js";',
    'export default () => import("https://example.com/later.js");',
  ]) await assert.rejects(() => encodeElementPackage(manifest, source, { "source/index.js": source }), /self-contained ESM.*at \d+-\d+/);
  await encodeElementPackage(manifest, "export default import.meta.url;", { "source/index.js": "import.meta" });
});
