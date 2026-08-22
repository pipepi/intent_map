import { strFromU8 } from "fflate";
import { sha256, sourceDigest } from "./hash.ts";
import { assertElementManifest } from "../contracts/package-validation.ts";
import { assertSelfContainedEsm } from "./esm-validation.ts";
import type { ElementPluginManifest, ElementPluginPackage } from "../contracts/package-types.ts";
import { decodeZip, encodeZip, jsonFile } from "./zip-package.ts";

export async function decodeElementPackage(archive: Uint8Array): Promise<ElementPluginPackage> {
  const files = decodeZip(archive);
  const manifest = jsonFile(files, "manifest.json");
  assertElementManifest(manifest);
  const allowed = new Set(["manifest.json", manifest.entry, ...manifest.sourcePaths]);
  const unexpected = Object.keys(files).find((path) => !allowed.has(path));
  if (unexpected) throw new Error(`Unexpected element package file: ${unexpected}`);
  if (!files[manifest.entry] || manifest.sourcePaths.some((path) => !files[path])) throw new Error("Element package content is incomplete");
  if (await sha256(files[manifest.entry]) !== manifest.entrySha256) throw new Error("entry.mjs hash does not match manifest");
  if (await sourceDigest(files, manifest.sourcePaths) !== manifest.sourceSha256) throw new Error("source hash does not match manifest");
  const entrySource = strFromU8(files[manifest.entry]);
  await assertSelfContainedEsm(entrySource, `${manifest.id}/entry.mjs`);
  return { manifest, entrySource, files, archive };
}

export async function encodeElementPackage(manifest: ElementPluginManifest, entrySource: string, sources: Record<string, string>) {
  await assertSelfContainedEsm(entrySource, `${manifest.id}/entry.mjs`);
  const sourceFiles = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, new TextEncoder().encode(source)]));
  const entry = new TextEncoder().encode(entrySource);
  const complete = { ...manifest, entrySha256: await sha256(entry), sourceSha256: await sourceDigest(sourceFiles, manifest.sourcePaths) };
  assertElementManifest(complete);
  return encodeZip({ "manifest.json": JSON.stringify(complete, null, 2), "entry.mjs": entry, ...sourceFiles });
}
