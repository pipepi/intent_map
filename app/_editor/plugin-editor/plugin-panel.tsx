"use client";

import type { PortableCollection } from "./collection-package";
import type { ElementPluginPackage, NodeTypePluginPackage } from "./package-types";
import type { WorkspaceSession } from "./types";
import styles from "./editor.module.css";

export function PluginPanel({ elements, nodeTypes, disabledElements, disabledNodeTypes, collections, workspaces, activeWorkspaceId, message, collapsed, onToggle, onInstall, onDisableElement, onDisableNodeType, onUninstallElement, onUninstallNodeType, onOpenCollection, onActivateWorkspace }: {
  elements: ElementPluginPackage[]; nodeTypes: NodeTypePluginPackage[]; collections: PortableCollection[];
  disabledElements: Set<string>; disabledNodeTypes: Set<string>;
  workspaces: WorkspaceSession[]; activeWorkspaceId?: string; message: string;
  collapsed: boolean; onToggle: () => void;
  onInstall: (file: File) => void; onDisableElement: (id: string) => void; onDisableNodeType: (id: string) => void;
  onUninstallElement: (id: string) => void; onUninstallNodeType: (id: string) => void;
  onOpenCollection: (collection: PortableCollection) => void | Promise<void>; onActivateWorkspace: (id: string) => void;
}) {
  return <aside className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ""}`} data-testid="plugin-manager">
    <div className={styles.panelTitle}><div><span>RELATION HOST</span><h2>三层外置插件</h2></div><button onClick={onToggle}>{collapsed ? "展开" : "收起"}</button></div>
    {collapsed ? null : <>
    <div className={styles.panelActions}><label className={styles.primary} htmlFor="relation-plugin-zip">安装 V2 ZIP</label></div>
    <input id="relation-plugin-zip" type="file" accept=".zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onInstall(file); event.currentTarget.value = ""; }} />
    <p className={styles.message} data-testid="status-message">{message}</p>

    <h3>元素插件 <small>主窗口同权执行</small></h3>
    <div className={styles.pluginList}>{elements.length ? elements.map((plugin) => <article key={plugin.manifest.id}>
      <div><strong>{plugin.manifest.name}</strong><span>{disabledElements.has(plugin.manifest.id) ? "已禁用" : ""}</span><button onClick={() => onDisableElement(plugin.manifest.id)}>禁用</button><button onClick={() => onUninstallElement(plugin.manifest.id)}>卸载</button></div>
      <p>{plugin.manifest.elements.map((item) => `${item.id}:${item.purpose}`).join("、")}</p><small>{plugin.manifest.id}@{plugin.manifest.version}</small>
    </article>) : <div className={styles.empty}>未安装元素插件</div>}</div>

    <h3>节点类型插件 <small>可执行语义与投影</small></h3>
    <div className={styles.pluginList}>{nodeTypes.length ? nodeTypes.map((plugin) => <article key={plugin.manifest.id}>
      <div><strong>{plugin.manifest.name}</strong><span>{disabledNodeTypes.has(plugin.manifest.id) ? "已禁用" : ""}</span><button onClick={() => onDisableNodeType(plugin.manifest.id)}>禁用</button><button onClick={() => onUninstallNodeType(plugin.manifest.id)}>卸载</button></div>
      <p>{plugin.manifest.typeNodeIds.join("、")}</p><small>{plugin.manifest.id}@{plugin.manifest.version}</small>
    </article>) : <div className={styles.empty}>未安装节点类型插件</div>}</div>

    <h3>节点集合插件</h3>
    <div className={styles.pluginList}>{collections.length ? collections.map((portable) => { const collection = portable.collection; return <article key={`${collection.manifest.id}@${collection.manifest.version}`}>
      <div><strong>{collection.manifest.name}</strong><button onClick={() => void onOpenCollection(portable)}>打开</button></div>
      <p>{collection.manifest.rootNodeIds.join("、")}</p>
      {(() => { const missing = [
        ...collection.manifest.dependencies.elements.filter((dependency) => !elements.some((plugin) => plugin.manifest.id === dependency.id && plugin.manifest.version === dependency.version && !disabledElements.has(plugin.manifest.id))),
        ...collection.manifest.dependencies.nodeTypes.filter((dependency) => !nodeTypes.some((plugin) => plugin.manifest.id === dependency.id && plugin.manifest.version === dependency.version && !disabledNodeTypes.has(plugin.manifest.id))),
      ]; return missing.length ? <small>缺失能力：{missing.map(({ id, version }) => `${id}@${version}`).join("、")}</small> : null; })()}
      <small>{collection.manifest.id}@{collection.manifest.version}</small>
    </article>; }) : <div className={styles.empty}>未安装集合；核心不会自动安装领域能力。</div>}</div>

    <h3>独立工作区</h3>
    <div className={styles.pluginList}>{workspaces.length ? workspaces.map((workspace) => <article key={workspace.id}>
      <div><strong>{workspace.source.id}</strong><button disabled={activeWorkspaceId === workspace.id} onClick={() => onActivateWorkspace(workspace.id)}>切换</button></div>
      <small>{workspace.id}<br />revision {workspace.graph.revision}</small>
      {!!workspace.capabilityDiagnostics.length && <small>能力诊断：{workspace.capabilityDiagnostics.map((item) => `${item.dependency.id}@${item.dependency.version} ${item.message}`).join("；")}</small>}
    </article>) : <div className={styles.empty}>打开集合后创建独立工作区。</div>}</div></>}
  </aside>;
}
