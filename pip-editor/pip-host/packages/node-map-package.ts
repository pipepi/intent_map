import { PipForkLevel } from "../../pip/types.ts";
import { migrate_node_map_manifest } from "./legacy-node-map.ts";
import { migrate_workspace } from "../../pip/legacy-semantics.ts";
import { graphNodes, createGraph, setGraphNode, graphRevision, setGraphRevision } from "../../pip/pip-model.ts";
/** A5 adapter: Node Map data plus a flat, fully validated A3/A4 dependency closure. */
import { assertPipGraph, createPipDocument, loadPipDocument, pipDocumentValues, pipValueRefs, serializePipDocument, type Pip, type PipValue, type PipRef } from "../../pip/index.ts";
import { assertPipManifest, pipFilename, pipSha256, type PipAsset, type PipIoOptions, type PipPackage, type PipPackageRef } from "../../pip-package/index.ts";
import { decodeElementPackage } from "./element-package.ts";
import { decodeNodeTypePackage } from "./node-type-package.ts";
import { assertNodeMapWorkspace } from "../contracts/package-validation.ts";
import type { ElementPluginPackage, NodeMap, NodeTypePluginPackage } from "../contracts/package-types.ts";
import { decodePipPackage, encodePipPackage, PIP_PACKAGE_LOADER, textAsset } from "./pip-package.ts";

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
const refsInGraphNode = (graph: Pip, nodeId: string): PipRef[] => {
    const refs: PipRef[] = [];
    const visit = (pips: Pip[]) => pips.forEach((pip) => {
        if (pip.predicate_value) refs.push(pip.predicate_value.predicate, ...pipValueRefs(pip.predicate_value.value));
        visit(pip.pips);
    });
    const node = graphNodes(graph)[nodeId];
    if (node?.predicate_value) refs.push(node.predicate_value.predicate, ...pipValueRefs(node.predicate_value.value));
    if (node)
        visit(node.pips);
    return refs;
};
export function selectPipClosure(graph: Pip, rootNodeIds: Iterable<string>): Pip {
    assertPipGraph(graph);
    const pending = [...new Set([...rootNodeIds, "pip.meta.revision", "pip.meta.root-node-ids", "pip.meta.workspace"])].sort();
    const selected = new Set<string>();
    while (pending.length) {
        const nodeId = pending.shift()!;
        if (selected.has(nodeId))
            continue;
        if (!graphNodes(graph)[nodeId])
            throw new Error(`Node Map root or reference is missing ${nodeId}`);
        selected.add(nodeId);
        for (const ref of refsInGraphNode(graph, nodeId))
            if (!selected.has(ref.node_id))
                pending.push(ref.node_id);
        pending.sort();
    }
    const nodes = Object.fromEntries([...selected].sort().map((id) => [id, structuredClone(graphNodes(graph)[id])]));
    const result = createGraph(nodes, 0);
    assertPipGraph(result);
    return result;
}
const refMatches = (ref: PipPackageRef, manifest: { packageId: string; packageVersion: string; releaseDate: string }, sha: string) =>
  ref.packageId === manifest.packageId && ref.version === manifest.packageVersion && ref.releaseDate === manifest.releaseDate && ref.sha256 === sha;
export async function encodeNodeMapPackage(input: PortableNodeMapSource) {
    const { manifest, graph, workspace } = input.nodeMap;
    assertPipManifest(manifest);
    assertPipGraph(graph);
    assertNodeMapWorkspace(workspace);
    for (const root of manifest.rootNodeIds)
        if (!graphNodes(graph)[root])
            throw new Error(`Node Map is missing root node ${root}`);
    const assets: PipAsset[] = [textAsset("workspace.json", JSON.stringify(workspace, null, 2), "application/json")];
    for (const plugin of input.nodeTypes) {
        if (!plugin.manifest.redistributable)
            throw new Error(`Node Type ${plugin.manifest.packageId} 不可再分发`);
        if (!manifest.dependencies.some((ref) => refMatches(ref, plugin.manifest, plugin.contentSha256)))
            throw new Error(`Node Map 未声明精确 A4 依赖 ${plugin.manifest.packageId}`);
        assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
    }
    for (const plugin of input.elementPlugins) {
        if (!plugin.manifest.redistributable)
            throw new Error(`Node Element ${plugin.manifest.packageId} 不可再分发`);
        if (!input.nodeTypes.some((nodeType) => nodeType.manifest.dependencies.some((ref) => refMatches(ref, plugin.manifest, plugin.contentSha256))))
            throw new Error(`A4 闭包未引用 A3 ${plugin.manifest.packageId}`);
        assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
    }
    for (const plugin of input.runtimePackages ?? []) {
        if (!["a1", "a2"].includes(plugin.manifest.layer))
            throw new Error(`A5 launch closure cannot embed ${plugin.manifest.layer}`);
        assets.push({ path: `packages/${pipFilename(plugin.manifest)}`, mime: "application/vnd.intent-map.pip", bytes: plugin.pipBytes });
    }
    return encodePipPackage({ manifest, loaderSource: PIP_PACKAGE_LOADER,
        rootTreeText: serializePipDocument(createPipDocument(graph, manifest.rootNodeIds, { kind: "node-map" })), assets });
}
export async function decodeNodeMapPackage(pipBytes: Uint8Array, options?: NodeMapDecodeOptions): Promise<PortableNodeMap> {
    const pip = await decodePipPackage(pipBytes, options);
    if (pip.manifest.layer !== "a5")
        throw new Error(`Expected a5 Node Map PIP, received ${pip.manifest.layer}`);
    const raw_manifest = assertPipManifest(pip.manifest);
    if (raw_manifest.layer !== "a5")
        throw new Error("Invalid Node Map manifest");
    // 原始字节已通过校验；仅派生运行时描述，不改写依赖、原包或其哈希。
    const is_legacy = raw_manifest.nodeMapAbi === "relation-node-map/1";
    const manifest = migrate_node_map_manifest(raw_manifest);
    const document = loadPipDocument(JSON.parse(pip.rootTreeText)), { graph } = pipDocumentValues(document);
    const workspaceAsset = pip.assets.find(({ path }) => path === "workspace.json");
    if (!workspaceAsset)
        throw new Error("Node Map workspace is missing");
    const raw_workspace = JSON.parse(new TextDecoder().decode(workspaceAsset.bytes));
    const workspace = is_legacy ? migrate_workspace(raw_workspace) : raw_workspace;
    assertNodeMapWorkspace(workspace);
    const nodeTypes: NodeTypePluginPackage[] = [], elementPlugins: ElementPluginPackage[] = [];
    const runtimePackages: PortableNodeMap["runtimePackages"] = [];
    for (const asset of pip.assets) {
        if (asset.path === "workspace.json")
            continue;
        if (!asset.path.startsWith("packages/") || !asset.path.endsWith(".pip"))
            throw new Error(`Unexpected Node Map asset: ${asset.path}`);
        const embedded = await decodePipPackage(asset.bytes, options);
        if (asset.path !== `packages/${pipFilename(embedded.manifest)}`)
            throw new Error(`Embedded PIP filename does not match manifest: ${asset.path}`);
        if (embedded.manifest.layer === "a3")
            elementPlugins.push(await decodeElementPackage(asset.bytes, options));
        else if (embedded.manifest.layer === "a4")
            nodeTypes.push(await decodeNodeTypePackage(asset.bytes, options));
        else if (["a1", "a2"].includes(embedded.manifest.layer))
            runtimePackages.push({ manifest: embedded.manifest, pipBytes: asset.bytes, contentSha256: await pipSha256(asset.bytes) });
        else
            throw new Error(`A5 cannot embed ${embedded.manifest.layer}`);
    }
    for (const ref of manifest.dependencies)
        if (!nodeTypes.some((plugin) => refMatches(ref, plugin.manifest, plugin.contentSha256))) {
            const bytes = await options?.resolvePackage?.(ref);
            if (!bytes)
                throw new Error(`Node Map 缺少精确 A4 依赖 ${ref.packageId}`);
            const plugin = await decodeNodeTypePackage(bytes, options);
            if (!refMatches(ref, plugin.manifest, plugin.contentSha256))
                throw new Error(`解析到的 A4 内容身份不匹配 ${ref.packageId}`);
            nodeTypes.push(plugin);
        }
    for (const plugin of nodeTypes)
        for (const ref of plugin.manifest.dependencies)
            if (!elementPlugins.some((item) => refMatches(ref, item.manifest, item.contentSha256))) {
                const bytes = await options?.resolvePackage?.(ref);
                if (!bytes)
                    throw new Error(`Node Type 缺少精确 A3 依赖 ${ref.packageId}`);
                const element = await decodeElementPackage(bytes, options);
                if (!refMatches(ref, element.manifest, element.contentSha256))
                    throw new Error(`解析到的 A3 内容身份不匹配 ${ref.packageId}`);
                elementPlugins.push(element);
            }
    if (manifest.launchProfile)
        for (const ref of [manifest.launchProfile.loader, manifest.launchProfile.editor]) {
            if (!runtimePackages.some((item) => refMatches(ref, item.manifest, item.contentSha256)))
                throw new Error(`Node Map 启动闭包缺少 ${ref.packageId}`);
        }
    for (const root of manifest.rootNodeIds)
        if (!graphNodes(graph)[root])
            throw new Error(`Node Map is missing root node ${root}`);
    return { contentSha256: await pipSha256(pipBytes), nodeMap: { manifest, graph, workspace }, nodeTypes, elementPlugins, runtimePackages, pipBytes };
}
export type PipImportResult = {
    graph: Pip;
    nodeIds: Map<string, string>;
    pip_ids: Map<string, string>;
};
const availableId = (base: string, used: Set<string>) => {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}~${suffix}`)) suffix += 1;
  return `${base}~${suffix}`;
};
/** Copies a closed graph into another graph and recursively rewrites every colliding identity. */
export function importPipGraph(target: Pip, incoming: Pip): PipImportResult {
    assertPipGraph(target);
    assertPipGraph(incoming);
    const usedNodes = new Set(Object.keys(graphNodes(target)));
    const nodeIds = new Map<string, string>();
    for (const sourceId of Object.keys(graphNodes(incoming)).sort()) {
        const destinationId = availableId(sourceId, usedNodes);
        usedNodes.add(destinationId);
        nodeIds.set(sourceId, destinationId);
    }
    const pip_ids = new Map<string, string>();
    for (const node of Object.values(graphNodes(incoming))) {
        const destinationNodeId = nodeIds.get(node.id)!;
        const used_pips = new Set<string>();
        const mapPips = (pips: Pip[]) => pips.forEach((pip) => {
            const destination_pip_id = availableId(pip.id, used_pips);
            used_pips.add(destination_pip_id);
            pip_ids.set(`${node.id}\u0000${pip.id}`, destination_pip_id);
            mapPips(pip.pips);
        });
        mapPips(node.pips);
        if (!destinationNodeId)
            throw new Error(`Missing node import mapping for ${node.id}`);
    }
    const rewriteRef = (ref: PipRef): PipRef => ({
        node_id: nodeIds.get(ref.node_id) ?? ref.node_id,
        pip_id: pip_ids.get(`${ref.node_id}\u0000${ref.pip_id}`) ?? ref.pip_id,
        ...(ref.pip_id_parent !== undefined ? { pip_id_parent: pip_ids.get(`${ref.node_id}\u0000${ref.pip_id_parent}`) ?? ref.pip_id_parent } : {})
    });
    const rewriteObject = (object: PipValue): PipValue => object.kind === "const"
        ? structuredClone(object)
        : object.kind === "ref"
            ? { kind: "ref", target: rewriteRef(object.target) }
            : { kind: "op", op: object.op, args: object.args.map(rewriteObject) };
    const rewritePips = (sourceNodeId: string, pips: Pip[]): Pip[] => pips.map((pip) => ({
        id: pip_ids.get(`${sourceNodeId}\u0000${pip.id}`)!,
        fork_level: PipForkLevel.PIPE,
        ...(pip.predicate_value ? { predicate_value: { predicate: rewriteRef(pip.predicate_value.predicate), value: rewriteObject(pip.predicate_value.value) } } : {}),
        pips: rewritePips(sourceNodeId, pip.pips)
    }));
    const graph = structuredClone(target);
    for (const node of Object.values(graphNodes(incoming))) {
        const id = nodeIds.get(node.id)!;
        setGraphNode(graph, { id, fork_level: PipForkLevel.NODE,
            ...(node.predicate_value ? { predicate_value: { predicate: rewriteRef(node.predicate_value.predicate), value: rewriteObject(node.predicate_value.value) } } : {}),
            pips: rewritePips(node.id, node.pips) });
    }
    setGraphRevision(graph, graphRevision(graph) + 1);
    assertPipGraph(graph);
    return { graph, nodeIds, pip_ids };
}
export type PipWorkspace = {
    id: string;
    source: {
        id: string;
        version: string;
        contentSha256: string;
    };
    rootNodeIds: string[];
    graph: Pip;
    views: NodeMap["workspace"]["views"];
    selection: string[];
    scopedSelections: Record<string, string[]>;
};
export function createNodeMapWorkspace(nodeMap: NodeMap, id = crypto.randomUUID(), contentSha256 = "unpackaged"): PipWorkspace {
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
