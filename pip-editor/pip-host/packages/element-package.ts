/** A3 adapter: executable Node Element capability encoded as one canonical PIP. */
import { assertPipManifest, pipSha256, type PipIoOptions } from "../../pip-package/index.ts";
import { loadPipDocument } from "../../pip/index.ts";
import { sha256, sourceDigest } from "./hash.ts";
import { assertSelfContainedEsm } from "./esm-validation.ts";
import type { ElementPluginManifest, ElementPluginPackage } from "../contracts/package-types.ts";
import { assetText, assetsByPath, decodePipPackage, encodePipPackage, packageDescriptorDocument, PIP_PACKAGE_LOADER, textAsset } from "./pip-package.ts";

export async function decodeElementPackage(pipBytes: Uint8Array, options?: PipIoOptions): Promise<ElementPluginPackage> {
  const pip = await decodePipPackage(pipBytes, options);
  if (pip.manifest.layer !== "a3") throw new Error(`Expected a3 Node Element PIP, received ${pip.manifest.layer}`);
  const manifest = assertPipManifest(pip.manifest) as ElementPluginManifest;
  loadPipDocument(JSON.parse(pip.rootTreeText));
  const files = assetsByPath(pip.assets), allowed = new Set([manifest.entry, ...manifest.sourcePaths]);
  const unexpected = Object.keys(files).find((path) => !allowed.has(path));
  if (unexpected) throw new Error(`Unexpected a3 asset: ${unexpected}`);
  if (!files[manifest.entry] || manifest.sourcePaths.some((path) => !files[path])) throw new Error("A3 package content is incomplete");
  if (await sha256(files[manifest.entry]) !== manifest.entrySha256) throw new Error("entry.mjs hash does not match manifest");
  if (await sourceDigest(files, manifest.sourcePaths) !== manifest.sourceSha256) throw new Error("source hash does not match manifest");
  const entrySource = assetText(pip.assets, manifest.entry);
  await assertSelfContainedEsm(entrySource, `${manifest.packageId}/entry.mjs`);
  return { manifest, entrySource, files, pipBytes, contentSha256: await pipSha256(pipBytes) };
}

export async function encodeElementPackage(manifest: ElementPluginManifest, entrySource: string, sources: Record<string, string>) {
  await assertSelfContainedEsm(entrySource, `${manifest.packageId}/entry.mjs`);
  const sourceFiles = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, new TextEncoder().encode(source)]));
  const entry = new TextEncoder().encode(entrySource);
  const complete = assertPipManifest({ ...manifest, entrySha256: await sha256(entry), sourceSha256: await sourceDigest(sourceFiles, manifest.sourcePaths) }) as ElementPluginManifest;
  return encodePipPackage({ manifest: complete, loaderSource: PIP_PACKAGE_LOADER,
    rootTreeText: JSON.stringify(packageDescriptorDocument(complete.packageId)),
    assets: [textAsset("entry.mjs", entrySource, "text/javascript"), ...Object.entries(sources).map(([path, source]) => textAsset(path, source))] });
}
