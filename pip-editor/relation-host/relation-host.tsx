/** Coordinates package installation, capability routing, workspace commits, and React publication. */
import { useRef, useState } from "react";
import { createCollectionWorkspace, decodeCollectionPackage, PortableCollectionCatalog, type PortableCollection } from "./packages/collection-package";
import { activateCollectionDependencies } from "./activation/collection-activation";
import { decodeElementPackage } from "./packages/element-package";
import { browserElementRuntime, ElementPluginRegistry } from "./activation/element-registry";
import { decodeNodeTypePackage, validateNodeTypeDependencies } from "./packages/node-type-package";
import { browserNodeTypeRuntime, NodeTypePluginRegistry } from "./activation/node-type-registry";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus, RelationElementRequest } from "./contracts/package-types";
import { decodeZip, jsonFile } from "./packages/zip-package";
import { NodeCanvas } from "./view/workspace-canvas";
import { PluginPanel } from "./view/plugin-panel";
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
  const [collections, setCollections] = useState<PortableCollection[]>([]);
  const collectionCatalogRef = useRef<PortableCollectionCatalog | null>(null);
  if (!collectionCatalogRef.current) collectionCatalogRef.current = new PortableCollectionCatalog();
  const collectionCatalog = collectionCatalogRef.current;
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const workspaceStoreRef = useRef<WorkspaceSessionStore | null>(null);
  if (!workspaceStoreRef.current) workspaceStoreRef.current = new WorkspaceSessionStore([], setWorkspaces);
  const workspaceStore = workspaceStoreRef.current;
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [message, setMessage] = useState("核心为空白宿主；请安装 V2 外置插件或集合 ZIP。 ");
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  async function installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus> {
    const status = await elements.install(plugin);
    setDisabledElements((current) => { const next = new Set(current); next.delete(plugin.manifest.id); return next; });
    setElementPackages((current) => current.some((item) => item.manifest.id === plugin.manifest.id) ? current : [...current, plugin]);
    return status;
  }
  async function installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus> {
    validateNodeTypeDependencies(plugin, elements.list().filter((item) => item.active));
    const status = await nodeTypes.install(plugin);
    setDisabledNodeTypes((current) => { const next = new Set(current); next.delete(plugin.manifest.id); return next; });
    setNodeTypePackages((current) => current.some((item) => item.manifest.id === plugin.manifest.id) ? current : [...current, plugin]);
    return status;
  }
  const statusText = (status: PluginInstallStatus) => status === "installed" ? "已安装并执行" : status === "reactivated" ? "已重新激活" : "已经处于活动状态";
  async function install(file: File) {
    try {
      const archive = new Uint8Array(await file.arrayBuffer());
      const manifest = jsonFile(decodeZip(archive), "manifest.json") as { format?: string };
      if (manifest.format === "intent-element-plugin") {
        const plugin = await decodeElementPackage(archive); const status = await installElement(plugin); setMessage(`${statusText(status)}元素插件 ${plugin.manifest.name}`); return;
      }
      if (manifest.format === "intent-node-type-plugin") {
        const plugin = await decodeNodeTypePackage(archive); const status = await installNodeType(plugin); setMessage(`${statusText(status)}节点类型插件 ${plugin.manifest.name}`); return;
      }
      if (manifest.format === "intent-node-collection") {
        const portable = await decodeCollectionPackage(archive);
        const status = collectionCatalog.install(portable);
        setCollections(collectionCatalog.list());
        setMessage(status === "installed"
          ? `已登记纯数据集合 ${portable.collection.manifest.name}；打开时才尝试激活内嵌依赖`
          : `集合 ${portable.collection.manifest.name} 已经安装`); return;
      }
      throw new Error("不支持的插件格式");
    } catch (error) { setMessage(error instanceof Error ? error.message : "插件安装失败"); }
  }

  async function openCollection(portable: PortableCollection) {
    const { collection } = portable;
    const workspace: WorkspaceSession = { ...createCollectionWorkspace(collection, crypto.randomUUID(), portable.contentSha256), undo: [], redo: [], capabilityDiagnostics: [] };
    workspaceStore.add(workspace); setActiveWorkspaceId(workspace.id); setPanelCollapsed(true);
    const diagnostics = await activateCollectionDependencies(portable, {
      elements: () => elements.list(),
      nodeTypes: () => nodeTypes.list(),
      installElement,
      installNodeType,
    });
    workspaceStore.setDiagnostics(workspace.id, diagnostics);
    setMessage(diagnostics.length
      ? `已打开 ${collection.manifest.name}，存在 ${diagnostics.length} 项能力诊断；原始关系仍可读取`
      : `已打开 ${collection.manifest.name} 并激活全部可用依赖`);
  }
  async function request(request: RelationElementRequest) {
    if (!active) return;
    try {
      const workspaceId = active.id;
      if (request.kind === "apply-patch") workspaceStore.commitPatch(workspaceId, request.patch, nodeTypes.validators());
      if (request.kind === "select") workspaceStore.select(workspaceId, request.nodeIds);
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

  return <main className={styles.shell}>
    <header className={styles.header}><div><span>RELATION NODE HOST</span><h1>三层外置插件工作区</h1></div>
      <div className={styles.addArea}><button onClick={() => history("undo")} disabled={!active?.undo.length}>撤销</button> <button onClick={() => history("redo")} disabled={!active?.redo.length}>重做</button></div>
    </header>
    <div className={`${styles.layout} ${panelCollapsed ? styles.layoutPanelCollapsed : ""}`}>
      {active ? <NodeCanvas workspace={active} elements={elements} nodeTypes={nodeTypes}
        onSelectionChange={(selection) => { try { workspaceStore.select(active.id, selection); } catch (error) { setMessage(error instanceof Error ? error.message : "选择失败"); } }}
        onRequest={request} /> : <section className={styles.canvasWrap}><div className={styles.empty}>空白 RelationNode 核心<br />安装节点集合插件后打开独立工作区。</div></section>}
      <PluginPanel elements={elementPackages} nodeTypes={nodeTypePackages} disabledElements={disabledElements} disabledNodeTypes={disabledNodeTypes} collections={collections} workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId} message={message} collapsed={panelCollapsed} onToggle={() => setPanelCollapsed((value) => !value)} onInstall={install}
        onDisableElement={(id) => { elements.disable(id); setDisabledElements((current) => new Set(current).add(id)); setMessage(`已禁用 ${id}；刷新后清除已执行代码`); }}
        onDisableNodeType={(id) => { let cleanupError: unknown; try { nodeTypes.disable(id); } catch (error) { cleanupError = error; } setDisabledNodeTypes((current) => new Set(current).add(id)); setMessage(cleanupError instanceof Error ? cleanupError.message : `已禁用 ${id}；刷新后清除已执行代码`); }}
        onUninstallElement={(id) => { elements.uninstall(id); setElementPackages((current) => current.filter((item) => item.manifest.id !== id)); setDisabledElements((current) => { const next = new Set(current); next.delete(id); return next; }); setMessage(`已卸载元素插件 ${id}；已注册标签刷新后清除`); }}
        onUninstallNodeType={(id) => { let cleanupError: unknown; try { nodeTypes.uninstall(id); } catch (error) { cleanupError = error; } setNodeTypePackages((current) => current.filter((item) => item.manifest.id !== id)); setDisabledNodeTypes((current) => { const next = new Set(current); next.delete(id); return next; }); setMessage(cleanupError instanceof Error ? cleanupError.message : `已卸载节点类型插件 ${id}`); }}
        onOpenCollection={openCollection} onActivateWorkspace={setActiveWorkspaceId} />
    </div>
  </main>;
}
