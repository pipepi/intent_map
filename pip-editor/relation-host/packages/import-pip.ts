/** Unified PIP ingress: validate first, confirm once, persist exact hashes, then dispatch by layer. */
import { decodePip, pipFilename, pipSha256, UNLIMITED_PIP_IO_POLICY, type PipManifest } from "../../pip/index.ts";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus } from "../contracts/package-types.ts";
import type { PortableNodeMap } from "./node-map-package.ts";
import { decodeElementPackage } from "./element-package.ts";
import { decodeNodeTypePackage } from "./node-type-package.ts";
import { decodeNodeMapPackage } from "./node-map-package.ts";

export type PipImportResult =
  | { layer: "a3"; package: ElementPluginPackage }
  | { layer: "a4"; package: NodeTypePluginPackage }
  | { layer: "a5"; package: PortableNodeMap };
export type PipImportContext = {
  fileName?: string;
  ioOptions?: import("../../pip/index.ts").PipIoOptions;
  resolvePackage?(reference: import("../../pip/index.ts").PipPackageRef): Uint8Array | undefined | Promise<Uint8Array | undefined>;
  confirmTrust(manifest: PipManifest, hashes: string[]): boolean | Promise<boolean>;
  trustHashes(hashes: string[]): void | Promise<void>;
  installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus>;
  installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus>;
  uninstallElement?(packageId: string): void;
  uninstallNodeType?(packageId: string): void;
  openNodeMap(nodeMap: PortableNodeMap): void | Promise<void>;
};

const closureHashes = (nodeMap: PortableNodeMap) => [
  nodeMap.contentSha256,
  ...nodeMap.elementPlugins.map(({ contentSha256 }) => contentSha256),
  ...nodeMap.nodeTypes.map(({ contentSha256 }) => contentSha256),
  ...nodeMap.runtimePackages.map(({ contentSha256 }) => contentSha256),
];

export async function importPip(bytes: Uint8Array, context: PipImportContext): Promise<PipImportResult> {
  const ioOptions = context.ioOptions ?? { policy: UNLIMITED_PIP_IO_POLICY };
  const decoded = await decodePip(bytes, ioOptions);
  if (context.fileName && context.fileName !== pipFilename(decoded.manifest)) throw new Error(`PIP filename does not match manifest: expected ${pipFilename(decoded.manifest)}`);
  if (!(["a3", "a4", "a5"] as string[]).includes(decoded.manifest.layer)) throw new Error(`编辑器不能导入 ${decoded.manifest.layer} PIP`);
  if (decoded.manifest.layer === "a3") {
    const plugin = await decodeElementPackage(bytes, ioOptions), hashes = [await pipSha256(bytes)];
    if (!await context.confirmTrust(plugin.manifest, hashes)) throw new Error("用户取消信任 A3 PIP");
    await context.installElement(plugin); await context.trustHashes(hashes);
    return { layer: "a3", package: plugin };
  }
  if (decoded.manifest.layer === "a4") {
    const plugin = await decodeNodeTypePackage(bytes, ioOptions), hashes = [plugin.contentSha256, ...plugin.embeddedElements.map((item) => item.contentSha256)];
    if (!await context.confirmTrust(plugin.manifest, hashes)) throw new Error("用户取消信任 A4 PIP");
    const installedElements: string[] = [];
    try {
      for (const element of plugin.embeddedElements) if (await context.installElement(element) === "installed") installedElements.push(element.manifest.packageId);
      await context.installNodeType(plugin);
    } catch (error) {
      installedElements.reverse().forEach((id) => context.uninstallElement?.(id)); throw error;
    }
    await context.trustHashes(hashes);
    return { layer: "a4", package: plugin };
  }
  const nodeMap = await decodeNodeMapPackage(bytes, { ...ioOptions, resolvePackage: context.resolvePackage }), hashes = [...new Set(closureHashes(nodeMap))];
  if (!await context.confirmTrust(nodeMap.nodeMap.manifest, hashes)) throw new Error("用户取消信任 A5 闭包");
  const installedElements: string[] = [], installedNodeTypes: string[] = [];
  try {
    for (const plugin of nodeMap.elementPlugins) if (await context.installElement(plugin) === "installed") installedElements.push(plugin.manifest.packageId);
    for (const plugin of nodeMap.nodeTypes) if (await context.installNodeType(plugin) === "installed") installedNodeTypes.push(plugin.manifest.packageId);
    await context.openNodeMap(nodeMap);
  } catch (error) {
    installedNodeTypes.reverse().forEach((id) => context.uninstallNodeType?.(id));
    installedElements.reverse().forEach((id) => context.uninstallElement?.(id));
    throw error;
  }
  // Persist the already verified closure only after every activation/open step succeeded.
  await context.trustHashes(hashes);
  return { layer: "a5", package: nodeMap };
}

const TRUST_KEY = "pip-editor.trusted-sha256.v1";
export const browserTrustHashes = (hashes: string[]) => {
  const current = new Set<string>(JSON.parse(localStorage.getItem(TRUST_KEY) ?? "[]"));
  hashes.forEach((hash) => current.add(hash));
  localStorage.setItem(TRUST_KEY, JSON.stringify([...current].sort()));
};
