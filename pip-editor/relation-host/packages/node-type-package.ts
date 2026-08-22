import { strFromU8 } from "fflate";
import { assertRelationGraph } from "../../relation/index.ts";
import { sha256, sourceDigest } from "./hash.ts";
import { assertNodeTypeManifest } from "../contracts/package-validation.ts";
import { assertSelfContainedEsm } from "./esm-validation.ts";
import type { ElementPluginPackage, NodeTypePluginManifest, NodeTypePluginPackage } from "../contracts/package-types.ts";
import { decodeZip, encodeZip, jsonFile } from "./zip-package.ts";

export async function decodeNodeTypePackage(archive: Uint8Array): Promise<NodeTypePluginPackage> {
  const files = decodeZip(archive);
  const manifest = jsonFile(files, "manifest.json");
  assertNodeTypeManifest(manifest);
  const allowed = new Set(["manifest.json", manifest.entry, manifest.ontology, ...manifest.sourcePaths]);
  const unexpected = Object.keys(files).find((path) => !allowed.has(path));
  if (unexpected) throw new Error(`Unexpected node type package file: ${unexpected}`);
  if (!files[manifest.entry] || !files[manifest.ontology] || manifest.sourcePaths.some((path) => !files[path])) throw new Error("Node type package content is incomplete");
  if (await sha256(files[manifest.entry]) !== manifest.entrySha256) throw new Error("entry.mjs hash does not match manifest");
  if (await sourceDigest(files, manifest.sourcePaths) !== manifest.sourceSha256) throw new Error("source hash does not match manifest");
  const ontology = jsonFile(files, manifest.ontology);
  assertRelationGraph(ontology);
  for (const id of manifest.typeNodeIds) if (!ontology.nodes[id]) throw new Error(`Ontology is missing type node ${id}`);
  const entrySource = strFromU8(files[manifest.entry]);
  await assertSelfContainedEsm(entrySource, `${manifest.id}/entry.mjs`);
  return { manifest, ontology, entrySource, files, archive };
}

export async function encodeNodeTypePackage(
  manifest: NodeTypePluginManifest,
  ontology: NodeTypePluginPackage["ontology"],
  entrySource: string,
  sources: Record<string, string>,
) {
  assertRelationGraph(ontology);
  await assertSelfContainedEsm(entrySource, `${manifest.id}/entry.mjs`);
  const sourceFiles = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, new TextEncoder().encode(source)]));
  const entry = new TextEncoder().encode(entrySource);
  const complete = { ...manifest, entrySha256: await sha256(entry), sourceSha256: await sourceDigest(sourceFiles, manifest.sourcePaths) };
  assertNodeTypeManifest(complete);
  return encodeZip({ "manifest.json": JSON.stringify(complete, null, 2), "ontology.json": JSON.stringify(ontology, null, 2), "entry.mjs": entry, ...sourceFiles });
}

export function validateNodeTypeDependencies(plugin: NodeTypePluginPackage, elements: ElementPluginPackage[]) {
  for (const dependency of plugin.manifest.elementDependencies) {
    const installed = elements.find((element) => element.manifest.id === dependency.id);
    if (!installed) throw new Error(`缺少元素插件 ${dependency.id}@${dependency.version}`);
    if (installed.manifest.version !== dependency.version) throw new Error(`元素插件 ${dependency.id} 必须使用精确版本 ${dependency.version}`);
  }
}
