/** 把插件 catalog 的宿主特权能力适配为系统节点插件模型。 */
import type { usePluginCatalog } from "../../relation-host/use-plugin-catalog.ts";
import type {
  SystemPluginComponentProps,
  SystemPluginDefinition,
  SystemPluginHostSnapshot,
} from "../system-plugin/contracts.ts";
import { createSystemPluginTypeNode } from "../system-plugin/runtime.ts";
import {
  PluginManagerPanel,
  type PluginManagerModel,
} from "./panel.tsx";

type PluginCatalog = ReturnType<typeof usePluginCatalog>;

export type PluginManagerHostServices = {
  catalog: PluginCatalog;
  canRedo: boolean;
  canUndo: boolean;
  message: string;
  onExport: () => void;
  onExportNative?: () => void;
  onHistory: (direction: "undo" | "redo") => void;
  onMessage: (message: string) => void;
};

const servicesFrom = (
  snapshot: SystemPluginHostSnapshot,
): PluginManagerHostServices => snapshot.services as PluginManagerHostServices;

function buildModel(snapshot: SystemPluginHostSnapshot): PluginManagerModel {
  const services = servicesFrom(snapshot);
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
  } = services.catalog;

  return {
    activeWorkspaceId: snapshot.workspace.id,
    canRedo: services.canRedo,
    canUndo: services.canUndo,
    disabledElements,
    disabledNodeTypes,
    elements: elementPackages,
    message: services.message,
    nodeMaps,
    nodeTypes: nodeTypePackages,
    onUndo: () => services.onHistory("undo"),
    onRedo: () => services.onHistory("redo"),
    onInstall: install,
    onExport: services.onExport,
    onExportNative: services.onExportNative,
    onDisableElement: (id) => {
      elements.disable(id);
      setDisabledElements((current) => new Set(current).add(id));
      services.onMessage(`已禁用 ${id}；刷新后清除已执行代码`);
    },
    onDisableNodeType: (id) => {
      try {
        nodeTypes.disable(id);
      } finally {
        setDisabledNodeTypes((current) => new Set(current).add(id));
      }
    },
    onUninstallElement: (id) => {
      elements.uninstall(id);
      setElementPackages((current) => current.filter(
        (item) => item.manifest.packageId !== id,
      ));
    },
    onUninstallNodeType: (id) => {
      nodeTypes.uninstall(id);
      setNodeTypePackages((current) => current.filter(
        (item) => item.manifest.packageId !== id,
      ));
    },
    onOpenNodeMap: openNodeMap,
  };
}

function PluginManagerSystemNode({ model }: SystemPluginComponentProps) {
  return <PluginManagerPanel {...model as PluginManagerModel} />;
}

export const pluginManagerSystemPlugin: SystemPluginDefinition = {
  id: "host.plugin-manager",
  typeNode: createSystemPluginTypeNode("relation.host.type.plugin-manager"),
  label: "插件管理器",
  description: "安装、禁用和导出 PIP",
  category: "系统",
  icon: "⚙",
  scope: "host",
  instancePolicy: "singleton",
  defaultWindow: {
    width: 640,
    height: 720,
    resizeMode: "full",
  },
  buildModel,
  Component: PluginManagerSystemNode,
};
