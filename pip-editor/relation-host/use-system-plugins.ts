/** 把内置系统插件 runtime 接到工作区生命周期和窗口呈现。 */
import { useEffect, useState } from "react";
import {
  createBuiltinSystemPluginRegistry,
  createSystemPluginCanvasBridge,
  SystemPluginRuntime,
  type PluginManagerHostServices,
} from "../relation-host-io/index.ts";
import type { WorkspacePoint } from "./contracts/package-types.ts";
import type { SystemPluginWindow } from "./contracts/system-plugin.ts";
import type { usePluginCatalog } from "./use-plugin-catalog.ts";
import { normalizeFreeLayout } from "./workspace/view-state.ts";
import type {
  WorkspaceSession,
  WorkspaceSessionStore,
} from "./workspace/workspace-store.ts";

type SystemPluginHostOptions = {
  active?: WorkspaceSession;
  catalog: ReturnType<typeof usePluginCatalog>;
  canExportNative: boolean;
  history: (direction: "undo" | "redo") => void;
  message: string;
  onExport: (workspace: WorkspaceSession, native?: boolean) => void;
  onMessage: (message: string) => void;
  workspaces: WorkspaceSession[];
  workspaceStore: WorkspaceSessionStore;
};

export function useSystemPlugins({
  active,
  catalog,
  canExportNative,
  history,
  message,
  onExport,
  onMessage,
  workspaces,
  workspaceStore,
}: SystemPluginHostOptions) {
  // revision 只负责通知 React 重新读取 runtime 中的实例状态。
  const [, setRevision] = useState(0);
  const [registry] = useState(createBuiltinSystemPluginRegistry);
  const [runtime] = useState(
    () => new SystemPluginRuntime(
      registry,
      () => setRevision((revision) => revision + 1),
    ),
  );
  const [canvas] = useState(
    () => createSystemPluginCanvasBridge(registry, runtime),
  );

  // 恢复工作区时，旧窗口会先归一化，再按插件 scope 找回内存实例。
  useEffect(() => {
    for (const workspace of workspaces) {
      const views = normalizeFreeLayout(
        workspace.views,
        workspace.rootNodeIds,
      );
      for (const window of Object.values(views.systemWindows)) {
        if (!registry.get(window.pluginId)) continue;
        if (runtime.get(window.instanceId)) continue;
        runtime.ensure(window.pluginId, workspace.id);
      }
    }
  }, [registry, runtime, workspaces]);

  useEffect(() => () => {
    // host scope 单例跨工作区保留，但必须在宿主会话卸载时最终释放。
    runtime.disposeAll();
  }, [runtime]);

  const services: PluginManagerHostServices | undefined = active
    ? {
      catalog,
      canRedo: Boolean(active.redo.length),
      canUndo: Boolean(active.undo.length),
      message,
      onExport: () => onExport(active),
      onExportNative: canExportNative
        ? () => onExport(active, true)
        : undefined,
      onHistory: history,
      onMessage,
    }
    : undefined;

  const open = (pluginId: string, point: WorkspacePoint) => {
    if (!active) return;
    const definition = registry.require(pluginId);
    if (definition.accepts?.(active) === false) return;
    const instance = runtime.ensure(pluginId, active.id);
    workspaceStore.openSystemPluginWindow(active.id, {
      windowId: instance.id,
      pluginId,
      instanceId: instance.id,
      point,
      defaultFrame: definition.defaultWindow,
    });
  };

  const close = (window: SystemPluginWindow) => {
    if (!active) return;
    workspaceStore.closeSystemWindow(active.id, window.id);
    runtime.releasePresentation(window.instanceId);
  };

  return {
    close,
    canvas,
    disposeWorkspace: (workspaceId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        const views = normalizeFreeLayout(
          workspace.views,
          workspace.rootNodeIds,
        );
        for (const window of Object.values(views.systemWindows)) {
          // host singleton 仅撤下呈现；multiple 实例则在最后一个窗口关闭时释放。
          runtime.releasePresentation(window.instanceId);
        }
      }
      runtime.disposeWorkspace(workspaceId);
    },
    open,
    services,
  };
}
