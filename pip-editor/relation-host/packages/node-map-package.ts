/** A5 adapter: Node Map data plus a flat, fully validated A3/A4 dependency closure. */
import { assertRelationGraph, createRelationDocument, loadRelationDocument, relationObjectRefs, serializeRelationDocument, type Relation, type RelationGraph, type RelationObject, type RelationRef } from "../../relation/index.ts";
import { assertPipManifest, pipFilename, pipSha256, type PipAsset, type PipIoOptions, type PipPackage, type PipPackageRef } from "../../pip/index.ts";
import { decodeElementPackage } from "./element-package.ts";
import { decodeNodeTypePackage } from "./node-type-package.ts";
import { assertNodeMapWorkspace } from "../contracts/package-validation.ts";
import type { ElementPluginPackage, NodeMap, NodeTypePluginPackage } from "../contracts/package-types.ts";
import { decodeRelationPip, encodeRelationPip, RELATION_PACKAGE_LOADER, textAsset } from "./pip-package.ts";

export type PortableNodeMap = {
  contentSha256: string;
  nodeMap: NodeMap;
  nodeTypes: NodeTypePluginPackage[];
  elementPlugins: ElementPluginPackage[];
  pipBytes: Uint8Array;
  runtimePackages: Array<{ manifest: PipPackage["manifest"]; pipBytes: Uint8Array; contentSha256: string }>;
};
export type PortableNodeMapSource = Omit<PortableNodeMap, "contentSha256" | "pipBytes" | "runtimePackages"> & { runtimePackages?: PortableNodeMap["runtimePackages"] };
export type NodeMapInstallStatus = "installed" | "already-installed";
export type NodeMapDecodeOptions = PipIoOptions & { resolvePackage?: (reference: PipPackageRef) => Uint8Array | undefined | Promise<Uint8Array | undefined> };

export class PortableNodeMapCatalog {
  readonly #nodeMaps = new Map<string, PortableNodeMap>();
  list() { return [...this.#nodeMaps.values()]; }
  install(portable: PortableNodeMap): NodeMapInstallStatus {
    const manifest = portable.nodeMap.manifest, key = `${manifest.packageId}\u0000${manifest.packageVersion}`;
    const current = this.#nodeMaps.get(key);
    if (current) {
      if (current.contentSha256 !== portable.contentSha256) throw new Error(`Node Map ${manifest.packageId}@${manifest.packageVersion} conflicts with installed immutable package`);
      return "already-installed";
    }
    this.#nodeMaps.set(key, portable);
    return "installed";
  }
}

const refsInGraphNode = (graph: RelationGraph, nodeId: string): RelationRef[] => {
  const refs: RelationRef[] = [];
  const visit = (relations: RelationGraph["nodes"][string]["relations"]) => relations.forEach((relation) => {
    refs.push(relation.predicate, ...relationObjectRefs(relation.object));
    visit(relation.relations);
  });
  const node = graph.nodes[nodeId];
  if (node) visit(node.relations);
  return refs;
};

export function selectRelationClosure(graph: RelationGraph, rootNodeIds: Iterable<string>): RelationGraph {
  assertRelationGraph(graph);
  const pending = [...new Set(rootNodeIds)].sort();
  const selected = new Set<string>();
  while (pending.length) {
    const nodeId = pending.shift()!;
    if (selected.has(nodeId)) continue;
    if (!graph.nodes[nodeId]) throw new Error(`Node Map root or reference is missing ${nodeId}`);
    selected.add(nodeId);
    for (const ref of refsInGraphNode(graph, nodeId)) if (!selected.has(ref.nodeId)) pending.push(ref.nodeId);
    pending.sort();
  }
  const nodes = Object.fromEntries([...selected].sort().map((id) => [id, structuredClone(graph.nodes[id])]));
  const result = { revision: 0, nodes };
  assertRelationGraph(result);
  return result;
}

const refMatches = (ref: PipPackageRef, manifest: { packageId: string; packageVersion: string; releaseDate: string }, sha: string) =>
  ref.packageId === manifest.packageId && ref.version === manifest.packageVersion && ref.releaseDate === manifest.releaseDate && ref.sha256 === sha;

export async function encodeNodeMapPackage(input: PortableNodeMapSource) {
  const { manifest, graph, workspace } = input.nodeMap;
  assertPipManifest(manifest); assertRelationGraph(graph); assertNodeMapWorkspace(workspace);
  for (const root of manifest.rootNodeIds) if (!graph.nodes[root]) throw new Error(`Node Map is missing root node ${root}`);
  const assets: PipAsset[] = [textAsset("workspace.json", JSON.stringify(workspace, null, 2), "application/json")];
  for (const plugin of input.nodeTypes) {
    if (!plugin.manifest.redistributable) throw new Error(`Node Type ${plugin.manifest.packageId} 不可再分发`);
    if (!manifest.dependencies.some((ref) => refMatches(ref, plugin.manifest, plugin.contentSha256))) throw new Error(`Node Map 未声明精确 A4 依赖 ${plugin.manifest.packageId}`);
    assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
  }
  for (const plugin of input.elementPlugins) {
    if (!plugin.manifest.redistributable) throw new Error(`Node Element ${plugin.manifest.packageId} 不可再分发`);
    if (!input.nodeTypes.some((nodeType) => nodeType.manifest.dependencies.some((ref) => refMatches(ref, plugin.manifest, plugin.contentSha256)))) throw new Error(`A4 闭包未引用 A3 ${plugin.manifest.packageId}`);
    assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
  }
  for (const plugin of input.runtimePackages ?? []) {
    if (!["a1", "a2"].includes(plugin.manifest.layer)) throw new Error(`A5 launch closure cannot embed ${plugin.manifest.layer}`);
    assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
  }
  return encodeRelationPip({ manifest, loaderSource: RELATION_PACKAGE_LOADER,
    rootTreeText: serializeRelationDocument(createRelationDocument(graph, manifest.rootNodeIds, { kind: "node-map" })), assets });
}

export async function decodeNodeMapPackage(pipBytes: Uint8Array, options?: NodeMapDecodeOptions): Promise<PortableNodeMap> {
  const pip = await decodeRelationPip(pipBytes, options);
  if (pip.manifest.layer !== "a5") throw new Error(`Expected a5 Node Map PIP, received ${pip.manifest.layer}`);
  const manifest = assertPipManifest(pip.manifest);
  if (manifest.layer !== "a5") throw new Error("Invalid Node Map manifest");
  const document = loadRelationDocument(JSON.parse(pip.rootTreeText)), graph = document.graph;
  const workspaceAsset = pip.assets.find(({ path }) => path === "workspace.json");
  if (!workspaceAsset) throw new Error("Node Map workspace is missing");
  const workspace = JSON.parse(new TextDecoder().decode(workspaceAsset.bytes)); assertNodeMapWorkspace(workspace);
  const nodeTypes: NodeTypePluginPackage[] = [], elementPlugins: ElementPluginPackage[] = [];
  const runtimePackages: PortableNodeMap["runtimePackages"] = [];
  for (const asset of pip.assets) {
    if (asset.path === "workspace.json") continue;
    if (!asset.path.startsWith("packages/") || !asset.path.endsWith(".pip")) throw new Error(`Unexpected Node Map asset: ${asset.path}`);
    const embedded = await decodeRelationPip(asset.bytes, options);
    if (asset.path !== `packages/${pipFilename(embedded.manifest)}`) throw new Error(`Embedded PIP filename does not match manifest: ${asset.path}`);
    if (embedded.manifest.layer === "a3") elementPlugins.push(await decodeElementPackage(asset.bytes, options));
    else if (embedded.manifest.layer === "a4") nodeTypes.push(await decodeNodeTypePackage(asset.bytes, options));
    else if (["a1", "a2"].includes(embedded.manifest.layer)) runtimePackages.push({ manifest: embedded.manifest, pipBytes: asset.bytes, contentSha256: await pipSha256(asset.bytes) });
    else throw new Error(`A5 cannot embed ${embedded.manifest.layer}`);
  }
  for (const ref of manifest.dependencies) if (!nodeTypes.some((plugin) => refMatches(ref, plugin.manifest, plugin.contentSha256))) {
    const bytes = await options?.resolvePackage?.(ref); if (!bytes) throw new Error(`Node Map 缺少精确 A4 依赖 ${ref.packageId}`);
    const plugin = await decodeNodeTypePackage(bytes, options); if (!refMatches(ref, plugin.manifest, plugin.contentSha256)) throw new Error(`解析到的 A4 内容身份不匹配 ${ref.packageId}`); nodeTypes.push(plugin);
  }
  for (const plugin of nodeTypes) for (const ref of plugin.manifest.dependencies) if (!elementPlugins.some((item) => refMatches(ref, item.manifest, item.contentSha256))) {
    const bytes = await options?.resolvePackage?.(ref); if (!bytes) throw new Error(`Node Type 缺少精确 A3 依赖 ${ref.packageId}`);
    const element = await decodeElementPackage(bytes, options); if (!refMatches(ref, element.manifest, element.contentSha256)) throw new Error(`解析到的 A3 内容身份不匹配 ${ref.packageId}`); elementPlugins.push(element);
  }
  if (manifest.launchProfile) for (const ref of [manifest.launchProfile.loader, manifest.launchProfile.editor]) {
    if (!runtimePackages.some((item) => refMatches(ref, item.manifest, item.contentSha256))) throw new Error(`Node Map 启动闭包缺少 ${ref.packageId}`);
  }
  for (const root of manifest.rootNodeIds) if (!graph.nodes[root]) throw new Error(`Node Map is missing root node ${root}`);
  return { contentSha256: await pipSha256(pipBytes), nodeMap: { manifest, graph, workspace }, nodeTypes, elementPlugins, runtimePackages, pipBytes };
}

export type RelationImportResult = {
  graph: RelationGraph;
  nodeIds: Map<string, string>;
  relationIds: Map<string, string>;
};

const availableId = (base: string, used: Set<string>) => {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}~${suffix}`)) suffix += 1;
  return `${base}~${suffix}`;
};

/** Copies a closed graph into another graph and recursively rewrites every colliding identity. */
export function importRelationGraph(target: RelationGraph, incoming: RelationGraph): RelationImportResult {
  assertRelationGraph(target); assertRelationGraph(incoming);
  const usedNodes = new Set(Object.keys(target.nodes));
  const nodeIds = new Map<string, string>();
  for (const sourceId of Object.keys(incoming.nodes).sort()) {
    const destinationId = availableId(sourceId, usedNodes);
    usedNodes.add(destinationId); nodeIds.set(sourceId, destinationId);
  }
  const relationIds = new Map<string, string>();
  for (const node of Object.values(incoming.nodes)) {
    const destinationNodeId = nodeIds.get(node.id)!;
    const usedRelations = new Set<string>();
    const mapRelations = (relations: Relation[]) => relations.forEach((relation) => {
      const destinationRelationId = availableId(relation.id, usedRelations);
      usedRelations.add(destinationRelationId);
      relationIds.set(`${node.id}\u0000${relation.id}`, destinationRelationId);
      mapRelations(relation.relations);
    });
    mapRelations(node.relations);
    if (!destinationNodeId) throw new Error(`Missing node import mapping for ${node.id}`);
  }
  const rewriteRef = (ref: RelationRef): RelationRef => ({
    nodeId: nodeIds.get(ref.nodeId) ?? ref.nodeId,
    relationId: relationIds.get(`${ref.nodeId}\u0000${ref.relationId}`) ?? ref.relationId,
  });
  const rewriteObject = (object: RelationObject): RelationObject => object.kind === "const"
    ? structuredClone(object)
    : object.kind === "ref"
      ? { kind: "ref", target: rewriteRef(object.target) }
      : { kind: "op", op: object.op, args: object.args.map(rewriteObject) };
  const rewriteRelations = (sourceNodeId: string, relations: Relation[]): Relation[] => relations.map((relation) => ({
    id: relationIds.get(`${sourceNodeId}\u0000${relation.id}`)!,
    predicate: rewriteRef(relation.predicate),
    object: rewriteObject(relation.object),
    relations: rewriteRelations(sourceNodeId, relation.relations),
  }));
  const graph = structuredClone(target);
  for (const node of Object.values(incoming.nodes)) {
    const id = nodeIds.get(node.id)!;
    graph.nodes[id] = { id, relations: rewriteRelations(node.id, node.relations) };
  }
  graph.revision += 1;
  assertRelationGraph(graph);
  return { graph, nodeIds, relationIds };
}

export type RelationWorkspace = {
  id: string;
  source: { id: string; version: string; contentSha256: string };
  rootNodeIds: string[];
  graph: RelationGraph;
  views: NodeMap["workspace"]["views"];
  selection: string[];
  scopedSelections: Record<string, string[]>;
};

export function createNodeMapWorkspace(nodeMap: NodeMap, id = crypto.randomUUID(), contentSha256 = "unpackaged"): RelationWorkspace {
  const initialSelection = [...(nodeMap.workspace.initialSelection ?? nodeMap.manifest.rootNodeIds)];
  return {
    id,
    source: { id: nodeMap.manifest.packageId, version: nodeMap.manifest.packageVersion, contentSha256 },
    rootNodeIds: [...nodeMap.manifest.rootNodeIds],
    graph: structuredClone(nodeMap.graph),
    views: structuredClone(nodeMap.workspace.views),
    selection: initialSelection,
    scopedSelections: Object.fromEntries(nodeMap.manifest.rootNodeIds.map((rootId) => [rootId, [...initialSelection]])),
  };
}
