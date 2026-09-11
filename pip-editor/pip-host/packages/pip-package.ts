import { PipForkLevel } from "../../pip/types.ts";
import { setGraphNode } from "../../pip/pip-model.ts";
/** Shared PIP transport helpers: deterministic assets, documents, hashes and exact refs. */
import { createCorePipGraph, createPipDocument, serializePipDocument, type Pip } from "../../pip/index.ts";
import { decodePip, encodePip, pipSha256, UNLIMITED_PIP_IO_POLICY, type PipAsset, type PipIoOptions, type PipManifest, type PipPackage, type PipPackageRef } from "../../pip-package/index.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PIP_PACKAGE_LOADER = `export default ({rootTreeText}) => JSON.parse(rootTreeText);`;
export const textAsset = (path: string, text: string, mime = "text/plain;charset=utf-8"): PipAsset => ({ path, mime, bytes: encoder.encode(text) });
export const assetsByPath = (assets: PipAsset[]) => Object.fromEntries(assets.map(({ path, bytes }) => [path, bytes]));
export const assetText = (assets: PipAsset[], path: string) => {
  const asset = assets.find((item) => item.path === path);
  if (!asset) throw new Error(`PIP asset is missing ${path}`);
  return decoder.decode(asset.bytes);
};
export const packageDescriptorDocument = (packageId: string) => {
    const graph = createCorePipGraph();
    setGraphNode(graph, {
        id: packageId,
        fork_level: PipForkLevel.NODE,
        pips: [{
                id: "identity",
                fork_level: PipForkLevel.PIPE,
                predicate_value: { predicate: { node_id: "pip.core.identity", pip_id: "identity" }, value: { kind: "const", value: packageId } },
                pips: []
            }]
    });
    return createPipDocument(graph, [packageId], { kind: "node-element-package" });
};
export const createPipPackage = (manifest: PipManifest, graph: Pip, roots: string[], assets: PipAsset[], workspace: unknown = {}) => ({
    manifest,
    loaderSource: PIP_PACKAGE_LOADER,
    rootTreeText: serializePipDocument(createPipDocument(graph, roots, workspace as never)),
    assets,
}) satisfies PipPackage;
export const encodePipPackage = (pip: PipPackage) => encodePip(pip, { policy: UNLIMITED_PIP_IO_POLICY });
export const decodePipPackage = (bytes: Uint8Array, options?: PipIoOptions) => decodePip(bytes, options ?? { policy: UNLIMITED_PIP_IO_POLICY });
export const exactPackageRef = async (bytes: Uint8Array, manifest: PipManifest, origin: "system" | "user" = "user"): Promise<PipPackageRef> => ({
  origin,
  packageId: manifest.packageId,
  version: manifest.packageVersion,
  releaseDate: manifest.releaseDate,
  sha256: await pipSha256(bytes),
});
