import { strFromU8 } from "fflate";
import { decodeElementPackage } from "./element-package.ts";
import { assertNodeCollection, assertNodeTypePackage } from "./package-validation.ts";
import type { ElementPluginPackage, NodeCollection, NodeTypePackage } from "./package-types.ts";
import { decodeZip, encodeZip, jsonFile } from "./zip-package.ts";

export type PortableCollection = { collection: NodeCollection; nodeTypes: NodeTypePackage[]; elementPlugins: ElementPluginPackage[] };

export function selectCollection(collection: NodeCollection, selectedIds: Set<string>): NodeCollection {
  return { ...collection, nodes: collection.nodes.filter((node) => selectedIds.has(node.id)), edges: collection.edges.filter((edge) => selectedIds.has(edge.sourceId) && selectedIds.has(edge.targetId)) };
}

export function encodeCollectionPackage(input: PortableCollection) {
  assertNodeCollection(input.collection);
  const blocked = input.elementPlugins.filter((plugin) => !plugin.manifest.redistributable);
  if (blocked.length) throw new Error(`不可再分发元素插件：${blocked.map((item) => item.manifest.id).join(", ")}`);
  const files: Record<string, string | Uint8Array> = { "collection.json": JSON.stringify(input.collection, null, 2) };
  for (const plugin of [...input.nodeTypes].sort((a, b) => a.id.localeCompare(b.id))) files[`node-types/${plugin.id}.intent-node-type.json`] = JSON.stringify(plugin, null, 2);
  for (const plugin of [...input.elementPlugins].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))) files[`element-plugins/${plugin.manifest.id}.intent-element.zip`] = plugin.archive;
  return encodeZip(files);
}

export async function decodeCollectionPackage(archive: Uint8Array): Promise<PortableCollection> {
  const files = decodeZip(archive);
  const collection = jsonFile(files, "collection.json");
  assertNodeCollection(collection);
  const nodeTypes: NodeTypePackage[] = [];
  const elementPlugins: ElementPluginPackage[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (path === "collection.json") continue;
    if (path.startsWith("node-types/") && path.endsWith(".json")) { const plugin = JSON.parse(strFromU8(bytes)); assertNodeTypePackage(plugin); nodeTypes.push(plugin); continue; }
    if (path.startsWith("element-plugins/") && path.endsWith(".zip")) { elementPlugins.push(await decodeElementPackage(bytes)); continue; }
    throw new Error(`Unexpected collection package file: ${path}`);
  }
  for (const dependency of collection.dependencies) if (!nodeTypes.some((plugin) => plugin.id === dependency.id && plugin.version === dependency.version)) throw new Error(`集合缺少节点类型依赖 ${dependency.id}@${dependency.version}`);
  return { collection, nodeTypes, elementPlugins };
}
