/** 将插件管理器的安装状态和 registry 操作组合成一个系统窗口。 */
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import type { usePluginCatalog } from "../use-plugin-catalog.ts";
import { SystemPluginManager } from "./system-plugin-manager-element.tsx";

type PluginCatalog = ReturnType<typeof usePluginCatalog>;

type PluginManagerWindowProps = {
  active: WorkspaceSession;
  catalog: PluginCatalog;
  canRedo: boolean;
  canUndo: boolean;
  message: string;
  onExport: () => void;
  onExportNative?: () => void;
  onHistory: (direction: "undo" | "redo") => void;
  onMessage: (message: string) => void;
};

export function PluginManagerWindow({
  active,
  catalog,
  canRedo,
  canUndo,
  message,
  onExport,
  onExportNative,
  onHistory,
  onMessage,
}: PluginManagerWindowProps) {
  const {
    disabledElements,
    disabledNodeTypes,
    elementPackages,
    elements,
    install,
    nodeMaps,
    nodeTypePackages,
    nodeTypes,
    openNodeMap,
    setDisabledElements,
    setDisabledNodeTypes,
    setElementPackages,
    setNodeTypePackages,
  } = catalog;

  return <SystemPluginManager
    elements={elementPackages}
    nodeTypes={nodeTypePackages}
    disabledElements={disabledElements}
    disabledNodeTypes={disabledNodeTypes}
    nodeMaps={nodeMaps}
    activeWorkspaceId={active.id}
    message={message}
    canUndo={canUndo}
    canRedo={canRedo}
    onUndo={() => onHistory("undo")}
    onRedo={() => onHistory("redo")}
    onInstall={install}
    onExport={onExport}
    onExportNative={onExportNative}
    onDisableElement={(id) => {
      elements.disable(id);
      setDisabledElements((current) => new Set(current).add(id));
      onMessage(`已禁用 ${id}；刷新后清除已执行代码`);
    }}
    onDisableNodeType={(id) => {
      try {
        nodeTypes.disable(id);
      } finally {
        setDisabledNodeTypes((current) => new Set(current).add(id));
      }
    }}
    onUninstallElement={(id) => {
      elements.uninstall(id);
      setElementPackages((current) =>
        current.filter((item) => item.manifest.packageId !== id),
      );
    }}
    onUninstallNodeType={(id) => {
      nodeTypes.uninstall(id);
      setNodeTypePackages((current) =>
        current.filter((item) => item.manifest.packageId !== id),
      );
    }}
    onOpenNodeMap={openNodeMap}
  />;
}
