import { assertRelationGraph, relationObjectRefs, type Relation, type RelationGraph, type RelationObject, type RelationRef } from "../../relation/model.ts";
import { decodeElementPackage } from "./element-package.ts";
import { decodeNodeTypePackage } from "./node-type-package.ts";
import { assertNodeCollectionManifest, assertNodeCollectionWorkspace } from "./package-validation.ts";
import { sha256 } from "./hash.ts";
import type { ElementPluginPackage, NodeCollectionPlugin, NodeTypePluginPackage } from "./package-types.ts";
import { decodeZip, encodeZip, jsonFile } from "./zip-package.ts";

export type PortableCollection = {
  contentSha256: string;
  collection: NodeCollectionPlugin;
  nodeTypes: NodeTypePluginPackage[];
  elementPlugins: ElementPluginPackage[];
};
export type PortableCollectionSource = Omit<PortableCollection, "contentSha256">;
export type CollectionInstallStatus = "installed" | "already-installed";

export class PortableCollectionCatalog {
  readonly #collections = new Map<string, PortableCollection>();
  list() { return [...this.#collections.values()]; }
  install(portable: PortableCollection): CollectionInstallStatus {
    const key = `${portable.collection.manifest.id}\u0000${portable.collection.manifest.version}`;
    const current = this.#collections.get(key);
    if (current) {
      if (current.contentSha256 !== portable.contentSha256) {
        throw new Error(`Collection ${portable.collection.manifest.id}@${portable.collection.manifest.version} conflicts with installed immutable package`);
      }
      return "already-installed";
    }
    this.#collections.set(key, portable);
    return "installed";
  }
}

const canonicalJson = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalJson)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]))
    : value;

const normalizedZipBytes = (files: Record<string, Uint8Array>, normalizeEmbeddedArchives = true) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  const structuredJsonPaths = new Set(normalizeEmbeddedArchives
    ? ["manifest.json", "graph.json", "workspace.json"]
    : ["manifest.json", "ontology.json"]);
  for (const path of Object.keys(files).sort()) {
    let bytes = files[path];
    if (structuredJsonPaths.has(path)) bytes = encoder.encode(JSON.stringify(canonicalJson(JSON.parse(decoder.decode(bytes)))));
    if (normalizeEmbeddedArchives && (path.startsWith("node-types/") || path.startsWith("element-plugins/")) && path.endsWith(".zip")) {
      bytes = normalizedZipBytes(decodeZip(bytes), false);
    }
    chunks.push(encoder.encode(`${path}\u0000${bytes.length}\u0000`), bytes);
  }
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
};

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
    if (!graph.nodes[nodeId]) throw new Error(`Collection root or reference is missing ${nodeId}`);
    selected.add(nodeId);
    for (const ref of refsInGraphNode(graph, nodeId)) if (!selected.has(ref.nodeId)) pending.push(ref.nodeId);
    pending.sort();
  }
  const nodes = Object.fromEntries([...selected].sort().map((id) => [id, structuredClone(graph.nodes[id])]));
  const result = { revision: 0, nodes };
  assertRelationGraph(result);
  return result;
}

export function encodeCollectionPackage(input: PortableCollectionSource) {
  const { manifest, graph, workspace } = input.collection;
  assertNodeCollectionManifest(manifest); assertRelationGraph(graph); assertNodeCollectionWorkspace(workspace);
  for (const root of manifest.rootNodeIds) if (!graph.nodes[root]) throw new Error(`Collection is missing root node ${root}`);
  const files: Record<string, string | Uint8Array> = {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "graph.json": JSON.stringify(graph, null, 2),
    "workspace.json": JSON.stringify(workspace, null, 2),
  };
  const declaredNodeTypes = new Set(manifest.dependencies.nodeTypes.map(({ id, version }) => `${id}@${version}`));
  const declaredElements = new Set(manifest.dependencies.elements.map(({ id, version }) => `${id}@${version}`));
  for (const plugin of input.nodeTypes) {
    if (!plugin.manifest.redistributable) throw new Error(`节点类型插件 ${plugin.manifest.id} 不可再分发`);
    if (!declaredNodeTypes.has(`${plugin.manifest.id}@${plugin.manifest.version}`)) throw new Error(`集合未声明节点类型依赖 ${plugin.manifest.id}@${plugin.manifest.version}`);
    files[`node-types/${plugin.manifest.id}.intent-node-type.zip`] = plugin.archive;
  }
  for (const plugin of input.elementPlugins) {
    if (!plugin.manifest.redistributable) throw new Error(`元素插件 ${plugin.manifest.id} 不可再分发`);
    if (!declaredElements.has(`${plugin.manifest.id}@${plugin.manifest.version}`)) throw new Error(`集合未声明元素依赖 ${plugin.manifest.id}@${plugin.manifest.version}`);
    files[`element-plugins/${plugin.manifest.id}.intent-element.zip`] = plugin.archive;
  }
  return encodeZip(files);
}

export async function decodeCollectionPackage(archive: Uint8Array): Promise<PortableCollection> {
  const files = decodeZip(archive);
  const contentSha256 = await sha256(normalizedZipBytes(files));
  const manifest = jsonFile(files, "manifest.json"); assertNodeCollectionManifest(manifest);
  const graph = jsonFile(files, "graph.json"); assertRelationGraph(graph);
  const workspace = jsonFile(files, "workspace.json"); assertNodeCollectionWorkspace(workspace);
  const nodeTypes: NodeTypePluginPackage[] = [], elementPlugins: ElementPluginPackage[] = [];
  for (const [path, bytes] of Object.entries(files).sort(([left], [right]) => left.localeCompare(right))) {
    if (["manifest.json", "graph.json", "workspace.json"].includes(path)) continue;
    if (path.startsWith("node-types/") && path.endsWith(".zip")) { nodeTypes.push(await decodeNodeTypePackage(bytes)); continue; }
    if (path.startsWith("element-plugins/") && path.endsWith(".zip")) { elementPlugins.push(await decodeElementPackage(bytes)); continue; }
    throw new Error(`Unexpected collection package file: ${path}`);
  }
  for (const plugin of nodeTypes) if (!manifest.dependencies.nodeTypes.some(({ id, version }) => id === plugin.manifest.id && version === plugin.manifest.version)) throw new Error(`集合包含未声明节点类型依赖 ${plugin.manifest.id}@${plugin.manifest.version}`);
  for (const plugin of elementPlugins) if (!manifest.dependencies.elements.some(({ id, version }) => id === plugin.manifest.id && version === plugin.manifest.version)) throw new Error(`集合包含未声明元素依赖 ${plugin.manifest.id}@${plugin.manifest.version}`);
  for (const root of manifest.rootNodeIds) if (!graph.nodes[root]) throw new Error(`Collection is missing root node ${root}`);
  return { contentSha256, collection: { manifest, graph, workspace }, nodeTypes, elementPlugins };
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
  graph: RelationGraph;
  views: NodeCollectionPlugin["workspace"]["views"];
  selection: string[];
};

export function createCollectionWorkspace(collection: NodeCollectionPlugin, id = crypto.randomUUID(), contentSha256 = "unpackaged"): RelationWorkspace {
  return {
    id,
    source: { id: collection.manifest.id, version: collection.manifest.version, contentSha256 },
    graph: structuredClone(collection.graph),
    views: structuredClone(collection.workspace.views),
    selection: [...(collection.workspace.initialSelection ?? collection.manifest.rootNodeIds)],
  };
}
