/** Coordinates package installation, workspace tabs, creators, and host-system windows. */
import { useEffect, useRef, useState } from "react";
import { createCoreRelationGraph } from "../relation/index.ts";
import { createNodeMapWorkspace, PortableNodeMapCatalog, type PortableNodeMap } from "./packages/node-map-package.ts";
import { browserElementRuntime, ElementPluginRegistry } from "./activation/element-registry.ts";
import { validateNodeTypeDependencies } from "./packages/node-type-package.ts";
import { browserNodeTypeRuntime, NodeTypePluginRegistry } from "./activation/node-type-registry.ts";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus, RelationElementRequest, WorkspacePoint } from "./contracts/package-types.ts";
import { browserTrustHashes, importPip } from "./packages/import-pip.ts";
import { exportNativeNodeMap, exportNodeMap } from "./packages/export-node-map.ts";
import { readHostCatalog, readHostLaunchPackage, readHostPackage, trustPackageHashes } from "../pip/host-client.ts";
import { decodePip, pipFilename, selectedPipFilePolicy, UNLIMITED_PIP_IO_POLICY, type PipPackageRef } from "../pip/index.ts";
import type { PipCatalogEntry } from "../pip/profile.ts";
import { NodeCanvas } from "./view/workspace-canvas.tsx";
import { SystemPluginManager } from "./view/system-plugin-manager-element.tsx";
import { WorkspaceTabs } from "./view/workspace-tabs.tsx";
import { CloseWorkspaceDialog } from "./view/close-workspace-dialog.tsx";
import { graphFingerprint, WorkspaceSessionStore, type WorkspaceSession } from "./workspace/workspace-store.ts";
import { normalizeFreeLayout, preserveSystemWindows } from "./workspace/view-state.ts";
import styles from "./view/relation-host.module.css";

const scratchWorkspace = (): WorkspaceSession => {
  const graph = createCoreRelationGraph(), id = crypto.randomUUID();
  return {
    id, source: { id: "host.new-tab", version: "1", contentSha256: "host" }, rootNodeIds: [], graph,
    views: normalizeFreeLayout({ kind: "free-layout" }, []), selection: [], scopedSelections: {}, undo: [], redo: [],
    capabilityDiagnostics: [], savedGraphFingerprint: graphFingerprint(graph),
  };
};

export function RelationHost() {
  const elementRegistryRef = useRef<ElementPluginRegistry | null>(null), nodeTypeRegistryRef = useRef<NodeTypePluginRegistry | null>(null);
  if (!elementRegistryRef.current) elementRegistryRef.current = new ElementPluginRegistry(browserElementRuntime());
  if (!nodeTypeRegistryRef.current) nodeTypeRegistryRef.current = new NodeTypePluginRegistry(browserNodeTypeRuntime());
  const elements = elementRegistryRef.current, nodeTypes = nodeTypeRegistryRef.current;
  const [elementPackages, setElementPackages] = useState<ElementPluginPackage[]>([]), [nodeTypePackages, setNodeTypePackages] = useState<NodeTypePluginPackage[]>([]);
  const [disabledElements, setDisabledElements] = useState(new Set<string>()), [disabledNodeTypes, setDisabledNodeTypes] = useState(new Set<string>()), [nodeMaps, setNodeMaps] = useState<PortableNodeMap[]>([]);
  const nodeMapCatalogRef = useRef(new PortableNodeMapCatalog()), initialRef = useRef<WorkspaceSession[]>([scratchWorkspace()]);
  const [workspaces, setWorkspaces] = useState(initialRef.current), workspaceStoreRef = useRef<WorkspaceSessionStore | null>(null);
  if (!workspaceStoreRef.current) workspaceStoreRef.current = new WorkspaceSessionStore(initialRef.current, setWorkspaces);
  const workspaceStore = workspaceStoreRef.current, [activeWorkspaceId, setActiveWorkspaceId] = useState(initialRef.current[0].id);
  const [message, setMessage] = useState("核心为空白宿主；Alt/Option + 左键拖拽，或按一下空格，可打开节点创建器。"), [pendingClose, setPendingClose] = useState<string>();
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId), launchRead = useRef(false);
  const nameFor = (workspace: WorkspaceSession) => workspace.source.id === "host.new-tab" ? "新标签" : nodeMaps.find((item) => item.contentSha256 === workspace.source.contentSha256)?.nodeMap.manifest.name ?? workspace.source.id;
  const persistTrust = async (hashes: string[]) => location.protocol === "pip:" ? trustPackageHashes(hashes) : browserTrustHashes(hashes);
  async function installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus> {
    const status = await elements.install(plugin); setDisabledElements((current) => { const next = new Set(current); next.delete(plugin.manifest.packageId); return next; });
    setElementPackages((current) => current.some((item) => item.manifest.packageId === plugin.manifest.packageId) ? current : [...current, plugin]); return status;
  }
  async function installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus> {
    validateNodeTypeDependencies(plugin, elements.list().filter((item) => item.active)); const status = await nodeTypes.install(plugin);
    setDisabledNodeTypes((current) => { const next = new Set(current); next.delete(plugin.manifest.packageId); return next; });
    setNodeTypePackages((current) => current.some((item) => item.manifest.packageId === plugin.manifest.packageId) ? current : [...current, plugin]); return status;
  }
  const rollbackElement = (id: string) => { elements.uninstall(id); setElementPackages((current) => current.filter((item) => item.manifest.packageId !== id)); };
  const rollbackNodeType = (id: string) => { nodeTypes.uninstall(id); setNodeTypePackages((current) => current.filter((item) => item.manifest.packageId !== id)); };
  async function install(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importPip(bytes, { fileName: file.name, ioOptions: { policy: selectedPipFilePolicy(bytes.length) },
        resolvePackage: (ref) => elementPackages.find((item) => item.contentSha256 === ref.sha256)?.pipBytes ?? nodeTypePackages.find((item) => item.contentSha256 === ref.sha256)?.pipBytes,
        confirmTrust: () => true, trustHashes: persistTrust, installElement, installNodeType, openNodeMap, uninstallElement: rollbackElement, uninstallNodeType: rollbackNodeType });
      setMessage(`已导入 ${result.layer.toUpperCase()} ${result.package instanceof Object && "manifest" in result.package ? result.package.manifest.name : result.package.nodeMap.manifest.name}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "PIP 导入失败"); }
  }
  async function openNodeMap(portable: PortableNodeMap) {
    const status = nodeMapCatalogRef.current.install(portable); setNodeMaps(nodeMapCatalogRef.current.list());
    const base = createNodeMapWorkspace(portable.nodeMap, crypto.randomUUID(), portable.contentSha256);
    const workspace: WorkspaceSession = { ...base, undo: [], redo: [], capabilityDiagnostics: [], savedGraphFingerprint: graphFingerprint(base.graph) };
    const reusable = active?.source.id === "host.new-tab" && !active.rootNodeIds.length && active.graph.revision === 0;
    if (reusable && active) {
      workspace.id = active.id; workspace.views = preserveSystemWindows(workspace.views, active.views, active.rootNodeIds);
      workspaceStore.replace(active.id, workspace); setActiveWorkspaceId(active.id);
    }
    else { workspaceStore.add(workspace); setActiveWorkspaceId(workspace.id); }
    setMessage(`${status === "installed" ? "已打开" : "已再次打开"} Node Map ${portable.nodeMap.manifest.name}`);
  }
  useEffect(() => {
    if (launchRead.current || location.protocol !== "pip:") return; launchRead.current = true;
    void readHostLaunchPackage().then((bytes) => bytes && importPip(bytes, { confirmTrust: () => true, trustHashes: persistTrust, installElement, installNodeType, openNodeMap, uninstallElement: rollbackElement, uninstallNodeType: rollbackNodeType })).catch((error) => setMessage(error instanceof Error ? error.message : "启动 A5 失败"));
  // Native launch is a one-shot handoff.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); };
    addEventListener("wheel", preventPageZoom, { passive: false });
    return () => removeEventListener("wheel", preventPageZoom);
  }, []);
  async function request(request: RelationElementRequest) {
    if (!active) return; const workspaceId = active.id;
    try {
      if (request.kind === "apply-patch") workspaceStore.commitPatch(workspaceId, request.patch, nodeTypes.validators());
      if (request.kind === "select") workspaceStore.select(workspaceId, request.nodeIds, request.scopeId);
      if (request.kind === "set-workspace-window") workspaceStore.setWindow(workspaceId, request.windowId, request.frame);
      if (request.kind === "invoke-creator") await invokeCreator(request.creatorId, request.worldPosition, request.input, request.origin);
      if (request.kind === "command") { const command = nodeTypes.commands().get(request.commandId); if (!command) throw new Error(`Unknown relation command ${request.commandId}`); workspaceStore.commitPatch(workspaceId, await command(request.input, active.graph), nodeTypes.validators()); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "关系操作失败"); }
  }
  async function invokeCreator(creatorId: string, point: WorkspacePoint, input?: import("../relation/index.ts").JsonValue, origin?: import("../relation/index.ts").RelationRef) {
    if (!active) return; const snapshot = active, creator = nodeTypes.creators().find((item) => item.id === creatorId); if (!creator) throw new Error(`Unknown creator ${creatorId}`);
    const context = { workspaceId: snapshot.id, graph: snapshot.graph, rootNodeIds: snapshot.rootNodeIds, worldPosition: point, origin };
    if (!creator.accepts(context)) throw new Error(`Creator ${creatorId} does not accept this workspace`);
    workspaceStore.commitCreation(snapshot.id, await creator.create(context, input), point, nodeTypes.validators());
  }
  function history(direction: "undo" | "redo") { if (!active) return; try { workspaceStore.history(active.id, direction, nodeTypes.validators()); } catch (error) { setMessage(error instanceof Error ? error.message : "历史操作失败"); } }
  const saveBlob = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); };
  async function exportWorkspace(workspace: WorkspaceSession | undefined, native = false) {
    if (!workspace) return false; const source = nodeMaps.find((item) => item.contentSha256 === workspace.source.contentSha256);
    if (!source) { setMessage("当前工作区缺少原始 A5 闭包，无法导出"); return false; }
    try {
      let exportSource = source;
      if (native) {
        const catalog = await readHostCatalog(), entries = ["a1", "a2"].map((layer) => catalog.packages.find((item) => item.layer === layer && item.valid && (item.origin === "system" || item.origin === "user")));
        if (entries.some((entry) => !entry?.packageId || !entry.packageVersion || !entry.releaseDate || !entry.sha256)) throw new Error("宿主 catalog 未提供完整 A1/A2 launcher 闭包");
        const exact = entries as Array<PipCatalogEntry & Required<Pick<PipCatalogEntry, "packageId" | "packageVersion" | "releaseDate" | "sha256">>>;
        const runtimePackages = await Promise.all(exact.map(async (entry) => { const pipBytes = new Uint8Array(await readHostPackage(entry)), decoded = await decodePip(pipBytes, { policy: UNLIMITED_PIP_IO_POLICY }); return { manifest: decoded.manifest, pipBytes, contentSha256: entry.sha256 }; }));
        const ref = (index: number): PipPackageRef => ({ origin: exact[index].origin as "system" | "user", packageId: exact[index].packageId, version: exact[index].packageVersion, releaseDate: exact[index].releaseDate, sha256: exact[index].sha256 });
        exportSource = { ...source, runtimePackages, nodeMap: { ...source.nodeMap, manifest: { ...source.nodeMap.manifest, launchProfile: { schemaVersion: 1, loader: ref(0), editor: ref(1) } } } };
      }
      const bytes = await exportNodeMap(workspace, { source: exportSource, portable: true });
      if (!native) saveBlob(new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.intent-map.pip" }), pipFilename(source.nodeMap.manifest));
      else { const blob = await exportNativeNodeMap(bytes), platform = navigator.platform.toLowerCase(); saveBlob(blob, platform.includes("mac") ? "node-map.dmg" : platform.includes("win") ? "node-map.exe" : "node-map.AppImage"); }
      workspaceStore.markSaved(workspace.id); setMessage(native ? "已生成当前平台原生 Node Map" : "已导出 portable A5 PIP"); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Node Map 导出失败"); return false; }
  }
  const closeNow = (id: string) => { const index = workspaces.findIndex((item) => item.id === id); workspaceStore.remove(id); if (id === activeWorkspaceId) setActiveWorkspaceId(workspaces[index + 1]?.id ?? workspaces[index - 1]?.id ?? ""); setPendingClose(undefined); };
  const requestClose = (id: string) => { const workspace = workspaces.find((item) => item.id === id); if (!workspace) return; if (graphFingerprint(workspace.graph) !== workspace.savedGraphFingerprint) { setActiveWorkspaceId(id); setPendingClose(id); } else closeNow(id); };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "w") { event.preventDefault(); if (activeWorkspaceId) requestClose(activeWorkspaceId); }
      if (event.key === "Tab" && workspaces.length) { event.preventDefault(); const index = workspaces.findIndex((item) => item.id === activeWorkspaceId), delta = event.shiftKey ? -1 : 1; setActiveWorkspaceId(workspaces[(index + delta + workspaces.length) % workspaces.length].id); }
      if (event.key.toLowerCase() === "z") { event.preventDefault(); history(event.shiftKey ? "redo" : "undo"); }
    }; addEventListener("keydown", keys); return () => removeEventListener("keydown", keys);
  });
  const pluginManager = active ? <SystemPluginManager elements={elementPackages} nodeTypes={nodeTypePackages} disabledElements={disabledElements} disabledNodeTypes={disabledNodeTypes} nodeMaps={nodeMaps}
    activeWorkspaceId={active.id} message={message} canUndo={Boolean(active.undo.length)} canRedo={Boolean(active.redo.length)} onUndo={() => history("undo")} onRedo={() => history("redo")} onInstall={install}
    onExport={() => void exportWorkspace(active)} onExportNative={location.protocol === "pip:" ? () => void exportWorkspace(active, true) : undefined}
    onDisableElement={(id) => { elements.disable(id); setDisabledElements((current) => new Set(current).add(id)); setMessage(`已禁用 ${id}；刷新后清除已执行代码`); }}
    onDisableNodeType={(id) => { try { nodeTypes.disable(id); } finally { setDisabledNodeTypes((current) => new Set(current).add(id)); } }}
    onUninstallElement={(id) => { elements.uninstall(id); setElementPackages((current) => current.filter((item) => item.manifest.packageId !== id)); }}
    onUninstallNodeType={(id) => { nodeTypes.uninstall(id); setNodeTypePackages((current) => current.filter((item) => item.manifest.packageId !== id)); }} onOpenNodeMap={openNodeMap} /> : undefined;
  return <main className={styles.shell}><div className={styles.layout}><section className={styles.workspaceArea}>
    <WorkspaceTabs workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} nameFor={nameFor} onActivate={setActiveWorkspaceId} onClose={requestClose} onNew={() => { const workspace = scratchWorkspace(); workspaceStore.add(workspace); setActiveWorkspaceId(workspace.id); }} onReorder={(id, before) => workspaceStore.reorder(id, before)} />
    {active ? <NodeCanvas workspace={active} elements={elements} nodeTypes={nodeTypes} pluginManager={pluginManager} onSelectionChange={(selection) => workspaceStore.select(active.id, selection)} onRequest={request}
      onViewsChange={(views) => workspaceStore.updateViews(active.id, views)} onActivateWindow={(id) => workspaceStore.activateWindow(active.id, id)} onInvokeCreator={(id, point, origin) => void invokeCreator(id, point, undefined, origin)}
      onOpenPluginManager={(point) => workspaceStore.openPluginManager(active.id, point)} onClosePluginManager={() => workspaceStore.closeSystemWindow(active.id, "host.plugin-manager")} /> : <section className={styles.canvasWrap}><div className={styles.empty}>点击 + 新建工作区标签</div></section>}
  </section></div>{pendingClose && <CloseWorkspaceDialog name={nameFor(workspaces.find((item) => item.id === pendingClose)!)} onCancel={() => setPendingClose(undefined)} onDiscard={() => closeNow(pendingClose)} onExport={() => void exportWorkspace(workspaces.find((item) => item.id === pendingClose)).then((ok) => { if (ok) closeNow(pendingClose); })} />}</main>;
}
