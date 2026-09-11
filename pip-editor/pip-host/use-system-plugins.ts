/** 把内置系统插件 runtime 接到宿主与工作区两种呈现表面。 */
import { useEffect, useState } from "react";
import {
  createBuiltinSystemPluginRegistry,
  createSystemPluginCanvasBridge,
  PLUGIN_MANAGER_SYSTEM_PLUGIN_ID,
  SystemPluginRuntime,
  type EditorPreferenceStore,
  type PluginManagerHostServices,
} from "../pip-host-io/index.ts";
import type { WorkspacePoint } from "./contracts/package-types.ts";
import type { SystemPluginWindow } from "./contracts/system-plugin.ts";
import type { usePluginCatalog } from "./use-plugin-catalog.ts";
import type {
  HostCanvasState,
  HostPresentationStore,
} from "./workspace/host-presentation-store.ts";
import { normalizeFreeLayout } from "./workspace/view-state.ts";
import type {
  WorkspaceSession,
  WorkspaceSessionStore,
} from "./workspace/workspace-store.ts";

type SystemPluginHostOptions = {
  catalog: ReturnType<typeof usePluginCatalog>;
  canExportNative: boolean;
  host: HostCanvasState;
  hostStore: HostPresentationStore;
  message: string;
  onExport: (workspace: WorkspaceSession, native?: boolean) => void;
  onHistory: (
    workspace: WorkspaceSession,
    direction: "undo" | "redo",
  ) => void;
  onMessage: (message: string) => void;
  preferences: EditorPreferenceStore;
  workspaces: WorkspaceSession[];
  workspaceStore: WorkspaceSessionStore;
};

export function useSystemPlugins(options: SystemPluginHostOptions) {
  const {
    catalog,
    canExportNative,
    host,
    hostStore,
    message,
    onExport,
    onHistory,
    onMessage,
    preferences,
    workspaces,
    workspaceStore,
  } = options;
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

  useEffect(() => {
    for (const workspace of workspaces) {
      const views = normalizeFreeLayout(
        workspace.views,
        workspace.rootNodeIds,
      );
      for (const window of Object.values(views.systemWindows)) {
        if (registry.get(window.pluginId) && !runtime.get(window.instanceId)) {
          runtime.ensure(window.pluginId, workspace.id);
        }
      }
    }
    for (const window of Object.values(host.systemWindows)) {
      if (registry.get(window.pluginId) && !runtime.get(window.instanceId)) {
        runtime.ensure(window.pluginId);
      }
    }
  }, [host.systemWindows, registry, runtime, workspaces]);

  useEffect(() => () => {
    runtime.disposeAll();
  }, [runtime]);

  const servicesFor = (
    workspace?: WorkspaceSession,
  ): PluginManagerHostServices & { preferences: EditorPreferenceStore } => ({
    catalog,
    canRedo: Boolean(workspace?.redo.length),
    canUndo: Boolean(workspace?.undo.length),
    message,
    onExport: () => {
      if (workspace) onExport(workspace);
    },
    onExportNative: canExportNative && workspace
      ? () => onExport(workspace, true)
      : undefined,
    onHistory: (direction) => {
      if (workspace) onHistory(workspace, direction);
    },
    onMessage,
    preferences,
  });

  const openWorkspace = (
    workspace: WorkspaceSession,
    pluginId: string,
    point: WorkspacePoint,
  ) => {
    const definition = registry.require(pluginId);
    if (!definition.surfaces.includes("workspace")) return;
    if (definition.accepts?.(workspace) === false) return;
    const instance = runtime.ensure(pluginId, workspace.id);
    workspaceStore.openSystemPluginWindow(workspace.id, {
      windowId: instance.id,
      pluginId,
      instanceId: instance.id,
      point,
      defaultFrame: definition.defaultWindow,
    });
  };

  const openHost = (pluginId: string, point: WorkspacePoint) => {
    const definition = registry.require(pluginId);
    if (!definition.surfaces.includes("host")) return;
    const instance = runtime.ensure(pluginId);
    hostStore.openSystemWindow(
      {
        id: instance.id,
        pluginId,
        instanceId: instance.id,
      },
      point,
      definition.defaultWindow,
    );
  };

  const closeWorkspace = (
    workspace: WorkspaceSession,
    window: SystemPluginWindow,
  ) => {
    workspaceStore.closeSystemWindow(workspace.id, window.id);
    runtime.releasePresentation(window.instanceId);
  };

  const closeHost = (windowId: string) => {
    const window = host.systemWindows[windowId];
    hostStore.closeSystemWindow(windowId);
    if (window) runtime.releasePresentation(window.instanceId);
  };

  return {
    canvas,
    closeHost,
    closeWorkspace,
    disposeWorkspace: (workspaceId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        const views = normalizeFreeLayout(
          workspace.views,
          workspace.rootNodeIds,
        );
        for (const window of Object.values(views.systemWindows)) {
          runtime.releasePresentation(window.instanceId);
        }
      }
      runtime.disposeWorkspace(workspaceId);
    },
    openHost,
    openWorkspace,
    importAtHost: (files: File[], point: WorkspacePoint) => {
      openHost(PLUGIN_MANAGER_SYSTEM_PLUGIN_ID, point);
      void catalog.installFiles(files);
    },
    importAtWorkspace: (
      workspace: WorkspaceSession,
      files: File[],
      point: WorkspacePoint,
    ) => {
      openWorkspace(workspace, PLUGIN_MANAGER_SYSTEM_PLUGIN_ID, point);
      void catalog.installFiles(files);
    },
    rejectImport: () => {
      onMessage("只支持拖入 A3、A4 或 A5 的 .pip 文件");
    },
    servicesFor,
  };
}

export type ReturnTypeOfSystemPlugins = ReturnType<typeof useSystemPlugins>;
