/** Shared PIP transport helpers: deterministic assets, documents, hashes and exact refs. */
import { createCoreRelationGraph, createRelationDocument, serializeRelationDocument, type RelationGraph } from "../../relation/index.ts";
import { decodePip, encodePip, pipSha256, UNLIMITED_PIP_IO_POLICY, type PipAsset, type PipIoOptions, type PipManifest, type PipPackage, type PipPackageRef } from "../../pip/index.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const RELATION_PACKAGE_LOADER = `export default ({rootTreeText}) => JSON.parse(rootTreeText);`;
export const textAsset = (path: string, text: string, mime = "text/plain;charset=utf-8"): PipAsset => ({ path, mime, bytes: encoder.encode(text) });
export const assetsByPath = (assets: PipAsset[]) => Object.fromEntries(assets.map(({ path, bytes }) => [path, bytes]));
export const assetText = (assets: PipAsset[], path: string) => {
  const asset = assets.find((item) => item.path === path);
  if (!asset) throw new Error(`PIP asset is missing ${path}`);
  return decoder.decode(asset.bytes);
};

export const packageDescriptorDocument = (packageId: string) => {
  const graph = createCoreRelationGraph();
  graph.nodes[packageId] = {
    id: packageId,
    relations: [{
      id: "identity",
      predicate: { nodeId: "relation.core.identity", relationId: "identity" },
      object: { kind: "const", value: packageId },
      relations: [],
    }],
  };
  return createRelationDocument(graph, [packageId], { kind: "node-element-package" });
};

export const relationPip = (manifest: PipManifest, graph: RelationGraph, roots: string[], assets: PipAsset[], workspace: unknown = {}) => ({
  manifest,
  loaderSource: RELATION_PACKAGE_LOADER,
  rootTreeText: serializeRelationDocument(createRelationDocument(graph, roots, workspace as never)),
  assets,
}) satisfies PipPackage;

export const encodeRelationPip = (pip: PipPackage) => encodePip(pip, { policy: UNLIMITED_PIP_IO_POLICY });
export const decodeRelationPip = (bytes: Uint8Array, options?: PipIoOptions) => decodePip(bytes, options ?? { policy: UNLIMITED_PIP_IO_POLICY });
export const exactPackageRef = async (bytes: Uint8Array, manifest: PipManifest, origin: "system" | "user" = "user"): Promise<PipPackageRef> => ({
  origin,
  packageId: manifest.packageId,
  version: manifest.packageVersion,
  releaseDate: manifest.releaseDate,
  sha256: await pipSha256(bytes),
});
