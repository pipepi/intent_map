import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage, encodeElementPackage } from "../pip-editor/relation-host/packages/element-package.ts";
import { baseElementManifest } from "../pip-editor-io/shared/manifest-builders.ts";

const manifest = { ...baseElementManifest("official.text-elements", "Text"), elements: [{ id: "text", tag: "intent-text-preview", purpose: "preview" }] };

test("A3 PIP encoding is deterministic and round-trips", async () => {
  const first = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  const second = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  assert.deepEqual(first, second);
  const decoded = await decodeElementPackage(first);
  assert.equal(decoded.manifest.packageId, manifest.packageId);
  assert.match(decoded.entrySource, /ok/);
});

test("A3 decoder rejects tampered PIP sections", async () => {
  const bytes = await encodeElementPackage(manifest, "export const ok = true;", { "source/index.js": "source" });
  const tampered = bytes.slice(); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(() => decodeElementPackage(tampered), /hash/);
});

test("element entry must be self-contained ESM", async () => {
  for (const source of ['import "https://example.com/plugin.js";', 'export { value } from "./relative.js";', 'export default () => import("https://example.com/later.js");']) {
    await assert.rejects(() => encodeElementPackage(manifest, source, { "source/index.js": source }), /self-contained ESM.*at \d+-\d+/);
  }
  await encodeElementPackage(manifest, "export default import.meta.url;", { "source/index.js": "import.meta" });
});
