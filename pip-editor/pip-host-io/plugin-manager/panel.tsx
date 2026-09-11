/** 插件管理器系统节点的可视界面。 */
import { useId } from "react";
import type { PortableNodeMap } from "../../pip-host/packages/node-map-package.ts";
import type { PipImportBatchState } from "../../pip-host/packages/import-batch.ts";
import type {
  ElementPluginPackage,
  NodeTypePluginPackage,
} from "../../pip-host/contracts/package-types.ts";
import styles from "../../pip-host/view/pip-host.module.css";
import {
  ElementPackageList,
  NodeMapPackageList,
  NodeTypePackageList,
} from "./package-lists.tsx";
import { PluginImportStatus } from "./import-status.tsx";

export type PluginManagerModel = {
  activeWorkspaceId?: string;
  canRedo: boolean;
  canUndo: boolean;
  disabledElements: Set<string>;
  disabledNodeTypes: Set<string>;
  elements: ElementPluginPackage[];
  message: string;
  importBatch?: PipImportBatchState;
  nodeMaps: PortableNodeMap[];
  nodeTypes: NodeTypePluginPackage[];
  onDisableElement: (id: string) => void;
  onDisableNodeType: (id: string) => void;
  onExport: () => void;
  onExportNative?: () => void;
  onInstallFiles: (files: FileList) => void;
  onOpenNodeMap: (nodeMap: PortableNodeMap) => void | Promise<void>;
  onRedo: () => void;
  onUndo: () => void;
  onUninstallElement: (id: string) => void;
  onUninstallNodeType: (id: string) => void;
};

export function PluginManagerPanel({
  activeWorkspaceId,
  canRedo,
  canUndo,
  disabledElements,
  disabledNodeTypes,
  elements,
  importBatch,
  message,
  nodeMaps,
  nodeTypes,
  onDisableElement,
  onDisableNodeType,
  onExport,
  onExportNative,
  onInstallFiles,
  onOpenNodeMap,
  onRedo,
  onUndo,
  onUninstallElement,
  onUninstallNodeType,
}: PluginManagerModel) {
  const inputId = useId();

  return <section className={styles.panel} data-testid="plugin-manager">
    <div className={styles.panelTitle} data-window-drag>
      <div className={styles.panelIdentity}>
        <span>PIP EDITOR I/O</span>
        <h2>A3–A5 分层包</h2>
      </div>
      <div className={styles.panelTitleActions}>
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title="撤销"
          aria-label="撤销"
        >撤销</button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          title="重做"
          aria-label="重做"
        >重做</button>
      </div>
    </div>

    <div className={styles.panelActions}>
      <label className={styles.primary} htmlFor={inputId}>导入 .pip</label>
      <button disabled={!activeWorkspaceId} onClick={onExport}>导出 A5</button>
      {onExportNative && <button
        disabled={!activeWorkspaceId}
        onClick={onExportNative}
      >导出原生包</button>}
    </div>
    <input
      id={inputId}
      type="file"
      multiple
      accept=".pip,application/vnd.intent-map.pip"
      hidden
      onChange={(event) => {
        const files = event.target.files;
        if (files?.length) onInstallFiles(files);
        event.currentTarget.value = "";
      }}
    />
    <p className={styles.message} data-testid="status-message">{message}</p>
    <PluginImportStatus batch={importBatch} />

    <h3>A3 Node Element <small>表现与交互</small></h3>
    <div className={styles.pluginList}>
      <ElementPackageList
        disabled={disabledElements}
        packages={elements}
        onDisable={onDisableElement}
        onUninstall={onUninstallElement}
      />
    </div>

    <h3>A4 Node Type <small>语义、命令与投影</small></h3>
    <div className={styles.pluginList}>
      <NodeTypePackageList
        disabled={disabledNodeTypes}
        packages={nodeTypes}
        onDisable={onDisableNodeType}
        onUninstall={onUninstallNodeType}
      />
    </div>

    <h3>A5 Node Map <small>纯数据与便携闭包</small></h3>
    <div className={styles.pluginList}>
      <NodeMapPackageList nodeMaps={nodeMaps} onOpen={onOpenNodeMap} />
    </div>
  </section>;
}
