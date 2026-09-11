import { graphNodes } from "../../pip/pip-model.ts";
/** A4 adapter: ontology and executable Node Type capability encoded as one PIP. */
import { assertPipManifest, pipFilename, pipSha256, type PipAsset, type PipIoOptions } from "../../pip-package/index.ts";
import { assertPipGraph, createPipDocument, loadPipDocument, pipDocumentValues, serializePipDocument } from "../../pip/index.ts";
import { sha256, sourceDigest } from "./hash.ts";
import { assertSelfContainedEsm } from "./esm-validation.ts";
import { decodeElementPackage } from "./element-package.ts";
import type { ElementPluginPackage, NodeTypePluginManifest, NodeTypePluginPackage } from "../contracts/package-types.ts";
import { assetText, assetsByPath, decodePipPackage, encodePipPackage, PIP_PACKAGE_LOADER, textAsset } from "./pip-package.ts";

export async function decodeNodeTypePackage(pipBytes: Uint8Array, options?: PipIoOptions): Promise<NodeTypePluginPackage> {
  const pip = await decodePipPackage(pipBytes, options);
  if (pip.manifest.layer !== "a4") throw new Error(`Expected a4 Node Type PIP, received ${pip.manifest.layer}`);
    const manifest = assertPipManifest(pip.manifest) as NodeTypePluginManifest;
    const ontology = pipDocumentValues(loadPipDocument(JSON.parse(pip.rootTreeText))).graph;
    const files = assetsByPath(pip.assets), allowed = new Set([manifest.entry, ...manifest.sourcePaths]);
    const unexpected = Object.keys(files).find((path) => !allowed.has(path) && !(path.startsWith("packages/") && path.endsWith(".pip")));
    if (unexpected)
        throw new Error(`Unexpected a4 asset: ${unexpected}`);
    if (!files[manifest.entry] || manifest.sourcePaths.some((path) => !files[path]))
        throw new Error("A4 package content is incomplete");
    if (await sha256(files[manifest.entry]) !== manifest.entrySha256)
        throw new Error("entry.mjs hash does not match manifest");
    if (await sourceDigest(files, manifest.sourcePaths) !== manifest.sourceSha256)
        throw new Error("source hash does not match manifest");
    for (const id of manifest.typeNodeIds)
        if (!graphNodes(ontology)[id])
            throw new Error(`Ontology is missing type node ${id}`);
    const entrySource = assetText(pip.assets, manifest.entry);
    await assertSelfContainedEsm(entrySource, `${manifest.packageId}/entry.mjs`);
    const embeddedElements: ElementPluginPackage[] = [];
    for (const asset of pip.assets.filter(({ path }) => path.startsWith("packages/"))) {
        const element = await decodeElementPackage(asset.bytes, options);
        if (asset.path !== `packages/${pipFilename(element.manifest)}`)
            throw new Error(`Embedded PIP filename does not match manifest: ${asset.path}`);
        const ref = manifest.dependencies.find((item) => item.packageId === element.manifest.packageId);
        if (!ref || ref.version !== element.manifest.packageVersion || ref.releaseDate !== element.manifest.releaseDate || ref.sha256 !== element.contentSha256)
            throw new Error(`内嵌 A3 内容身份不匹配 ${element.manifest.packageId}`);
        embeddedElements.push(element);
    }
    return { manifest, ontology, entrySource, files, pipBytes, contentSha256: await pipSha256(pipBytes), embeddedElements };
}
export async function encodeNodeTypePackage(manifest: NodeTypePluginManifest, ontology: NodeTypePluginPackage["ontology"], entrySource: string, sources: Record<string, string>, embeddedElements: ElementPluginPackage[] = []) {
  assertPipGraph(ontology); await assertSelfContainedEsm(entrySource, `${manifest.packageId}/entry.mjs`);
  const sourceFiles = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, new TextEncoder().encode(source)]));
  const entry = new TextEncoder().encode(entrySource);
  const complete = assertPipManifest({ ...manifest, entrySha256: await sha256(entry), sourceSha256: await sourceDigest(sourceFiles, manifest.sourcePaths) }) as NodeTypePluginManifest;
  const packages: PipAsset[] = embeddedElements.map((element) => {
    if (!element.manifest.redistributable) throw new Error(`Node Element ${element.manifest.packageId} 不可再分发`);
    const ref = complete.dependencies.find((item) => item.packageId === element.manifest.packageId);
    if (!ref || ref.version !== element.manifest.packageVersion || ref.releaseDate !== element.manifest.releaseDate || ref.sha256 !== element.contentSha256) throw new Error(`A4 未声明精确内嵌 A3 依赖 ${element.manifest.packageId}`);
    return { path: `packages/${pipFilename(element.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: element.pipBytes };
  });
  return encodePipPackage({ manifest: complete, loaderSource: PIP_PACKAGE_LOADER,
    rootTreeText: serializePipDocument(createPipDocument(ontology, manifest.typeNodeIds, { kind: "node-type-package" })),
    assets: [textAsset("entry.mjs", entrySource, "text/javascript"), ...Object.entries(sources).map(([path, source]) => textAsset(path, source)), ...packages] });
}
export function validateNodeTypeDependencies(plugin: NodeTypePluginPackage, elements: ElementPluginPackage[]) {
  for (const dependency of plugin.manifest.dependencies) {
    const installed = elements.find((element) => element.manifest.packageId === dependency.packageId);
    if (!installed) throw new Error(`缺少元素 PIP ${dependency.packageId}@${dependency.version}`);
    if (installed.manifest.packageVersion !== dependency.version || installed.contentSha256 !== dependency.sha256) throw new Error(`元素 PIP ${dependency.packageId} 内容身份不匹配`);
  }
}
