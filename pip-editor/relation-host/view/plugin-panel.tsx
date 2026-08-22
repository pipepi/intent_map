import type { PortableNodeMap } from "../packages/node-map-package.ts";
import type { ElementPluginPackage, NodeTypePluginPackage } from "../contracts/package-types.ts";
import styles from "./relation-host.module.css";

export function PluginPanel({ elements, nodeTypes, disabledElements, disabledNodeTypes, nodeMaps, activeWorkspaceId, message, collapsed, canUndo, canRedo, onToggle, onUndo, onRedo, onInstall, onExport, onExportNative, onDisableElement, onDisableNodeType, onUninstallElement, onUninstallNodeType, onOpenNodeMap }: {
  elements: ElementPluginPackage[]; nodeTypes: NodeTypePluginPackage[]; nodeMaps: PortableNodeMap[];
  disabledElements: Set<string>; disabledNodeTypes: Set<string>;
  activeWorkspaceId?: string; message: string; collapsed: boolean; canUndo: boolean; canRedo: boolean;
  onToggle: () => void; onUndo: () => void; onRedo: () => void;
  onInstall: (file: File) => void; onDisableElement: (id: string) => void; onDisableNodeType: (id: string) => void;
  onExport: () => void; onExportNative?: () => void;
  onUninstallElement: (id: string) => void; onUninstallNodeType: (id: string) => void;
  onOpenNodeMap: (nodeMap: PortableNodeMap) => void | Promise<void>;
}) {
  return <aside className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ""}`} data-testid="plugin-manager">
    <div className={styles.panelTitle}>
      <div className={styles.panelIdentity}><span>PIP EDITOR I/O</span><h2>A3–A5 分层包</h2></div>
      <div className={styles.panelTitleActions}>
        <button type="button" disabled={!canUndo} onClick={onUndo} title="撤销" aria-label="撤销">{collapsed ? "↶" : "撤销"}</button>
        <button type="button" disabled={!canRedo} onClick={onRedo} title="重做" aria-label="重做">{collapsed ? "↷" : "重做"}</button>
        <button type="button" onClick={onToggle}>{collapsed ? "展开" : "收起"}</button>
      </div>
    </div>
    {collapsed ? null : <>
    <div className={styles.panelActions}><label className={styles.primary} htmlFor="pip-import">导入 .pip</label><button disabled={!activeWorkspaceId} onClick={onExport}>导出 A5</button>{onExportNative && <button disabled={!activeWorkspaceId} onClick={onExportNative}>导出原生包</button>}</div>
    <input id="pip-import" type="file" accept=".pip,application/vnd.intent-map.pip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onInstall(file); event.currentTarget.value = ""; }} />
    <p className={styles.message} data-testid="status-message">{message}</p>

    <h3>A3 Node Element <small>表现与交互</small></h3>
    <div className={styles.pluginList}>{elements.length ? elements.map((plugin) => { const id = plugin.manifest.packageId; return <article key={id}>
      <div><strong>{plugin.manifest.name}</strong><span>{disabledElements.has(id) ? "已禁用" : ""}</span><button onClick={() => onDisableElement(id)}>禁用</button><button onClick={() => onUninstallElement(id)}>卸载</button></div>
      <p>{plugin.manifest.elements.map((item) => `${item.id}:${item.purpose}`).join("、")}</p><small>{id}@{plugin.manifest.packageVersion}</small>
    </article>; }) : <div className={styles.empty}>未安装 A3</div>}</div>

    <h3>A4 Node Type <small>语义、命令与投影</small></h3>
    <div className={styles.pluginList}>{nodeTypes.length ? nodeTypes.map((plugin) => { const id = plugin.manifest.packageId; return <article key={id}>
      <div><strong>{plugin.manifest.name}</strong><span>{disabledNodeTypes.has(id) ? "已禁用" : ""}</span><button onClick={() => onDisableNodeType(id)}>禁用</button><button onClick={() => onUninstallNodeType(id)}>卸载</button></div>
      <p>{plugin.manifest.typeNodeIds.join("、")}</p><small>{id}@{plugin.manifest.packageVersion}</small>
    </article>; }) : <div className={styles.empty}>未安装 A4</div>}</div>

    <h3>A5 Node Map <small>纯数据与便携闭包</small></h3>
    <div className={styles.pluginList}>{nodeMaps.length ? nodeMaps.map((portable) => { const nodeMap = portable.nodeMap; return <article key={portable.contentSha256}>
      <div><strong>{nodeMap.manifest.name}</strong><button onClick={() => void onOpenNodeMap(portable)}>再打开</button></div>
      <p>{nodeMap.manifest.rootNodeIds.join("、")}</p><small>{nodeMap.manifest.packageId}@{nodeMap.manifest.packageVersion}</small>
    </article>; }) : <div className={styles.empty}>未导入 A5；核心不会自动获得领域能力。</div>}</div>

    </>}
  </aside>;
}
