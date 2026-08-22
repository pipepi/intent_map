/** Coordinates package installation, capability routing, workspace commits, and React publication. */
import { useEffect, useRef, useState } from "react";
import { createNodeMapWorkspace, PortableNodeMapCatalog, type PortableNodeMap } from "./packages/node-map-package";
import { browserElementRuntime, ElementPluginRegistry } from "./activation/element-registry";
import { validateNodeTypeDependencies } from "./packages/node-type-package";
import { browserNodeTypeRuntime, NodeTypePluginRegistry } from "./activation/node-type-registry";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus, RelationElementRequest } from "./contracts/package-types";
import { browserTrustHashes, importPip } from "./packages/import-pip";
import { exportNativeNodeMap, exportNodeMap } from "./packages/export-node-map";
import { readHostCatalog, readHostLaunchPackage, readHostPackage, trustPackageHashes } from "../pip/host-client";
import { decodePip, pipFilename, selectedPipFilePolicy, UNLIMITED_PIP_IO_POLICY, type PipPackageRef } from "../pip";
import type { PipCatalogEntry } from "../pip/profile";
import { NodeCanvas } from "./view/workspace-canvas";
import { PluginPanel } from "./view/plugin-panel";
import { WorkspaceTabs } from "./view/workspace-tabs";
import { WorkspaceSessionStore, type WorkspaceSession } from "./workspace/workspace-store";
import styles from "./view/relation-host.module.css";

export function RelationHost() {
  const elementRegistryRef = useRef<ElementPluginRegistry | null>(null);
  const nodeTypeRegistryRef = useRef<NodeTypePluginRegistry | null>(null);
  if (!elementRegistryRef.current) elementRegistryRef.current = new ElementPluginRegistry(browserElementRuntime());
  if (!nodeTypeRegistryRef.current) nodeTypeRegistryRef.current = new NodeTypePluginRegistry(browserNodeTypeRuntime());
  const elements = elementRegistryRef.current, nodeTypes = nodeTypeRegistryRef.current;
  const [elementPackages, setElementPackages] = useState<ElementPluginPackage[]>([]);
  const [nodeTypePackages, setNodeTypePackages] = useState<NodeTypePluginPackage[]>([]);
  const [disabledElements, setDisabledElements] = useState(new Set<string>());
  const [disabledNodeTypes, setDisabledNodeTypes] = useState(new Set<string>());
  const [nodeMaps, setNodeMaps] = useState<PortableNodeMap[]>([]);
  const nodeMapCatalogRef = useRef<PortableNodeMapCatalog | null>(null);
  if (!nodeMapCatalogRef.current) nodeMapCatalogRef.current = new PortableNodeMapCatalog();
  const nodeMapCatalog = nodeMapCatalogRef.current;
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const workspaceStoreRef = useRef<WorkspaceSessionStore | null>(null);
  if (!workspaceStoreRef.current) workspaceStoreRef.current = new WorkspaceSessionStore([], setWorkspaces);
  const workspaceStore = workspaceStoreRef.current;
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [message, setMessage] = useState("核心为空白宿主；请导入 A3、A4 或 A5 PIP。");
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const launchRead = useRef(false);
  const persistTrust = async (hashes: string[]) => {
    if (location.protocol === "pip:") await trustPackageHashes(hashes);
    else browserTrustHashes(hashes);
  };

  async function installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus> {
    const status = await elements.install(plugin);
    setDisabledElements((current) => { const next = new Set(current); next.delete(plugin.manifest.packageId); return next; });
    setElementPackages((current) => current.some((item) => item.manifest.packageId === plugin.manifest.packageId) ? current : [...current, plugin]);
    return status;
  }
  async function installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus> {
    validateNodeTypeDependencies(plugin, elements.list().filter((item) => item.active));
    const status = await nodeTypes.install(plugin);
    setDisabledNodeTypes((current) => { const next = new Set(current); next.delete(plugin.manifest.packageId); return next; });
    setNodeTypePackages((current) => current.some((item) => item.manifest.packageId === plugin.manifest.packageId) ? current : [...current, plugin]);
    return status;
  }
  const rollbackElement = (id: string) => { elements.uninstall(id); setElementPackages((current) => current.filter((item) => item.manifest.packageId !== id)); };
  const rollbackNodeType = (id: string) => { nodeTypes.uninstall(id); setNodeTypePackages((current) => current.filter((item) => item.manifest.packageId !== id)); };
  async function install(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importPip(bytes, {
        fileName: file.name,
        // Choosing this file authorizes only metrics bounded by its exact size;
        // executable package trust remains a separate confirmation below.
        ioOptions: { policy: selectedPipFilePolicy(bytes.length) },
        resolvePackage: (ref) => elementPackages.find((item) => item.contentSha256 === ref.sha256)?.pipBytes ?? nodeTypePackages.find((item) => item.contentSha256 === ref.sha256)?.pipBytes,
        confirmTrust: () => true,
        trustHashes: persistTrust, installElement, installNodeType, openNodeMap,
        uninstallElement: rollbackElement, uninstallNodeType: rollbackNodeType,
      });
      setMessage(`已导入 ${result.layer.toUpperCase()} ${result.package instanceof Object && "manifest" in result.package ? result.package.manifest.name : result.package.nodeMap.manifest.name}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "PIP 导入失败"); }
  }

  async function openNodeMap(portable: PortableNodeMap) {
    const status = nodeMapCatalog.install(portable); setNodeMaps(nodeMapCatalog.list());
    const workspace: WorkspaceSession = { ...createNodeMapWorkspace(portable.nodeMap, crypto.randomUUID(), portable.contentSha256), undo: [], redo: [], capabilityDiagnostics: [] };
    workspaceStore.add(workspace); setActiveWorkspaceId(workspace.id); setPanelCollapsed(true);
    setMessage(`${status === "installed" ? "已打开" : "已再次打开"} Node Map ${portable.nodeMap.manifest.name}`);
  }
  useEffect(() => {
    if (launchRead.current || location.protocol !== "pip:") return;
    launchRead.current = true;
    void readHostLaunchPackage().then((bytes) => bytes && importPip(bytes, {
      confirmTrust: () => true,
      trustHashes: persistTrust, installElement, installNodeType, openNodeMap,
      uninstallElement: rollbackElement, uninstallNodeType: rollbackNodeType,
    })).catch((error) => setMessage(error instanceof Error ? error.message : "启动 A5 失败"));
  // Native launch input is a one-shot handoff; registry callbacks deliberately use the first host instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function request(request: RelationElementRequest) {
    if (!active) return;
    try {
      const workspaceId = active.id;
      if (request.kind === "apply-patch") workspaceStore.commitPatch(workspaceId, request.patch, nodeTypes.validators());
      if (request.kind === "select") workspaceStore.select(workspaceId, request.nodeIds, request.scopeId);
      if (request.kind === "command") {
        const command = nodeTypes.commands().get(request.commandId);
        if (!command) throw new Error(`Unknown relation command ${request.commandId}`);
        workspaceStore.commitPatch(workspaceId, await command(request.input, active.graph), nodeTypes.validators());
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "关系操作失败"); }
  }
  function history(direction: "undo" | "redo") {
    if (!active) return;
    try {
      workspaceStore.history(active.id, direction, nodeTypes.validators());
    } catch (error) { setMessage(error instanceof Error ? error.message : "历史操作失败"); }
  }
  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };
  async function exportActive(native = false) {
    if (!active) return;
    const source = nodeMaps.find((item) => item.contentSha256 === active.source.contentSha256);
    if (!source) { setMessage("当前工作区缺少原始 A5 闭包，无法导出"); return; }
    try {
      let exportSource = source;
      if (native) {
        const catalog = await readHostCatalog(), entries = ["a1", "a2"].map((layer) => catalog.packages.find((item) => item.layer === layer && item.valid && (item.origin === "system" || item.origin === "user")));
        if (entries.some((entry) => !entry?.packageId || !entry.packageVersion || !entry.releaseDate || !entry.sha256)) throw new Error("宿主 catalog 未提供完整 A1/A2 launcher 闭包");
        const exactEntries = entries as Array<PipCatalogEntry & Required<Pick<PipCatalogEntry, "packageId" | "packageVersion" | "releaseDate" | "sha256">>>;
        const runtimePackages = await Promise.all(exactEntries.map(async (entry) => {
          const pipBytes = new Uint8Array(await readHostPackage(entry)), decoded = await decodePip(pipBytes, { policy: UNLIMITED_PIP_IO_POLICY });
          return { manifest: decoded.manifest, pipBytes, contentSha256: entry.sha256 };
        }));
        const ref = (index: number): PipPackageRef => { const entry = exactEntries[index]; return { origin: entry.origin as "system" | "user", packageId: entry.packageId, version: entry.packageVersion, releaseDate: entry.releaseDate, sha256: entry.sha256 }; };
        exportSource = { ...source, runtimePackages, nodeMap: { ...source.nodeMap, manifest: { ...source.nodeMap.manifest, launchProfile: { schemaVersion: 1, loader: ref(0), editor: ref(1) } } } };
      }
      const bytes = await exportNodeMap(active, { source: exportSource, portable: true });
      if (!native) saveBlob(new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.intent-map.pip" }), pipFilename(source.nodeMap.manifest));
      else {
        const blob = await exportNativeNodeMap(bytes), platform = navigator.platform.toLowerCase();
        saveBlob(blob, platform.includes("mac") ? "node-map.dmg" : platform.includes("win") ? "node-map.exe" : "node-map.AppImage");
      }
      setMessage(native ? "已生成当前平台原生 Node Map" : "已导出 portable A5 PIP");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Node Map 导出失败"); }
  }

  return <main className={styles.shell}>
    <div className={`${styles.layout} ${panelCollapsed ? styles.layoutPanelCollapsed : ""}`}>
      <section className={styles.workspaceArea}>
        <WorkspaceTabs workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
          nameFor={(workspace) => nodeMaps.find((item) => item.contentSha256 === workspace.source.contentSha256)?.nodeMap.manifest.name ?? workspace.source.id}
          onActivate={setActiveWorkspaceId} />
        {active ? <NodeCanvas workspace={active} elements={elements} nodeTypes={nodeTypes}
          onSelectionChange={(selection) => { try { workspaceStore.select(active.id, selection); } catch (error) { setMessage(error instanceof Error ? error.message : "选择失败"); } }}
          onRequest={request} /> : <section className={styles.canvasWrap}><div className={styles.empty}>空白 RelationNode 核心<br />导入 A5 Node Map 后打开独立工作区。</div></section>}
      </section>
      <PluginPanel elements={elementPackages} nodeTypes={nodeTypePackages} disabledElements={disabledElements} disabledNodeTypes={disabledNodeTypes} nodeMaps={nodeMaps}
        activeWorkspaceId={activeWorkspaceId} message={message} collapsed={panelCollapsed} canUndo={Boolean(active?.undo.length)} canRedo={Boolean(active?.redo.length)}
        onToggle={() => setPanelCollapsed((value) => !value)} onUndo={() => history("undo")} onRedo={() => history("redo")} onInstall={install}
        onExport={() => exportActive(false)} onExportNative={location.protocol === "pip:" ? () => exportActive(true) : undefined}
        onDisableElement={(id) => { elements.disable(id); setDisabledElements((current) => new Set(current).add(id)); setMessage(`已禁用 ${id}；刷新后清除已执行代码`); }}
        onDisableNodeType={(id) => { let cleanupError: unknown; try { nodeTypes.disable(id); } catch (error) { cleanupError = error; } setDisabledNodeTypes((current) => new Set(current).add(id)); setMessage(cleanupError instanceof Error ? cleanupError.message : `已禁用 ${id}；刷新后清除已执行代码`); }}
        onUninstallElement={(id) => { elements.uninstall(id); setElementPackages((current) => current.filter((item) => item.manifest.packageId !== id)); setDisabledElements((current) => { const next = new Set(current); next.delete(id); return next; }); setMessage(`已卸载 Node Element ${id}；已注册标签刷新后清除`); }}
        onUninstallNodeType={(id) => { let cleanupError: unknown; try { nodeTypes.uninstall(id); } catch (error) { cleanupError = error; } setNodeTypePackages((current) => current.filter((item) => item.manifest.packageId !== id)); setDisabledNodeTypes((current) => { const next = new Set(current); next.delete(id); return next; }); setMessage(cleanupError instanceof Error ? cleanupError.message : `已卸载 Node Type ${id}`); }}
        onOpenNodeMap={openNodeMap} />
    </div>
  </main>;
}
