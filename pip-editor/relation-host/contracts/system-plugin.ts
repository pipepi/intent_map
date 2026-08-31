/** relation-host 与系统 I/O 插件共享的最小窗口呈现协议。 */
import type { ComponentType } from "react";
import type { JsonValue, RelationGraph } from "../../relation/index.ts";
import type { WorkspaceWindowFrame } from "./package-types.ts";

/**
 * 系统窗口只记录某个工作区如何呈现实例，不携带系统插件业务状态。
 * 因此它可以被工作区布局恢复，但会在 A5 导出时被完整移除。
 */
export type SystemPluginWindow = {
  id: string;
  pluginId: string;
  instanceId: string;
  frame: WorkspaceWindowFrame;
};

export type SystemPluginReference = Pick<
  SystemPluginWindow,
  "pluginId" | "instanceId"
> & {
  migratedWindowId?: string;
};

export type SystemPluginWorkspace = {
  id: string;
  graph: RelationGraph;
  rootNodeIds: string[];
  views: JsonValue;
  selection: string[];
  scopedSelections?: Record<string, string[]>;
};

export type SystemPluginCreatorCandidate = {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon?: string;
  provider: "system";
};

export type SystemPluginCanvasRendererProps = {
  window: SystemPluginWindow;
  workspace: SystemPluginWorkspace;
  services: unknown;
};

/** Canvas 只消费此桥接面，不感知具体 registry、runtime 或插件 ID。 */
export type SystemPluginCanvasBridge = {
  creatorChoices: (
    workspace: SystemPluginWorkspace,
  ) => SystemPluginCreatorCandidate[];
  Renderer: ComponentType<SystemPluginCanvasRendererProps>;
};

/** 兼容旧 A2 工作区中的专用系统窗口标记。 */
export function normalizeSystemPluginReference(
  value: Record<string, unknown>,
): SystemPluginReference | undefined {
  if (
    typeof value.pluginId === "string" &&
    typeof value.instanceId === "string"
  ) {
    return {
      pluginId: value.pluginId,
      instanceId: value.instanceId,
    };
  }
  if (value.type === "plugin-manager") {
    return {
      pluginId: "host.plugin-manager",
      instanceId: "system.instance.host:host.plugin-manager",
      migratedWindowId: "system.instance.host:host.plugin-manager",
    };
  }
}
