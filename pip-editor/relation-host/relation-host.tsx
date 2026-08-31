/** 协调宿主桌面、工作区会话、PIP 与可信系统插件。 */
import { useState } from "react";
import type { JsonValue, RelationRef } from "../relation/index.ts";
import {
  EditorPreferenceStore,
  type EditorPreferences,
} from "../relation-host-io/index.ts";
import type {
  ExecutionContextSnapshot,
  RelationElementRequest,
  WorkspacePoint,
} from "./contracts/package-types.ts";
import { ExecutionSessionManager } from "./execution/session-manager.ts";
import { dispatchRelationElementRequest } from "./relation-host-actions.ts";
import { createScratchWorkspace, downloadBlob } from "./relation-host-workspace.ts";
import { usePluginCatalog } from "./use-plugin-catalog.ts";
import { useHostEffects } from "./use-host-effects.ts";
import { useSystemPlugins } from "./use-system-plugins.ts";
import { CloseWorkspaceDialog } from "./view/close-workspace-dialog.tsx";
import styles from "./view/relation-host.module.css";
import { WorkspaceSessionCanvas } from "./view/workspace-session-canvas.tsx";
import { RelationHostSurface } from "./view/relation-host-surface.tsx";
import { buildWorkspaceExport } from "./workspace-export.ts";
import {
  createHostCanvasState,
  type HostViewportSize,
  HostPresentationStore,
} from "./workspace/host-presentation-store.ts";
import {
  graphFingerprint,
  WorkspaceSessionStore,
  type WorkspaceSession,
} from "./workspace/workspace-store.ts";
import { workspaceName } from "./workspace/workspace-name.ts";

export function RelationHost() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const [workspaceStore] = useState(
    () => new WorkspaceSessionStore([], setWorkspaces),
  );
  const [host, setHost] = useState(createHostCanvasState);
  const [hostStore] = useState(() => new HostPresentationStore(setHost));
  const [, setPreferences] = useState<EditorPreferences>(
    () => ({ schemaVersion: 1, workspaceOpenMode: "tab" }),
  );
  const [preferenceStore] = useState(
    () => new EditorPreferenceStore(setPreferences),
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [focusedWorkspaceId, setFocusedWorkspaceId] = useState<string>();
  const [creatorRequest, setCreatorRequest] = useState(0);
  const [pendingClose, setPendingClose] = useState<string>();
  const [message, setMessage] = useState(
    "空格或 Alt/Option + 左键拖拽可打开创建器。",
  );
  const active = workspaces.find((item) => item.id === activeWorkspaceId);
  const focused = workspaces.find((item) => item.id === focusedWorkspaceId);
  const commandWorkspace = active ?? focused;
  const presentWorkspace = (
    workspace: WorkspaceSession,
    point?: WorkspacePoint,
    viewport?: HostViewportSize,
  ) => {
    if (preferenceStore.snapshot().workspaceOpenMode === "window") {
      hostStore.presentWorkspace(workspace.id, point, "center", viewport);
      setActiveWorkspaceId(undefined);
      setFocusedWorkspaceId(workspace.id);
      return;
    }
    hostStore.restoreWorkspaceTab(workspace.id);
    setActiveWorkspaceId(workspace.id);
    setFocusedWorkspaceId(workspace.id);
  };
  const catalog = usePluginCatalog({
    onOpenWorkspace: presentWorkspace,
    setMessage,
    workspaceStore,
  });
  const { nodeMaps, nodeTypePackages, nodeTypes, elements } = catalog;
  const [execution, setExecution] = useState<ExecutionContextSnapshot>({
    sessions: [],
  });
  const [executionManager] = useState(
    () => new ExecutionSessionManager(nodeTypes, setExecution),
  );
  const [commandQueues] = useState(() => new Map<string, Promise<void>>());
  const history = (
    workspace: WorkspaceSession,
    direction: "undo" | "redo",
  ) => {
    try {
      workspaceStore.history(workspace.id, direction, nodeTypes.validators());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史操作失败");
    }
  };
  const exportWorkspace = async (
    workspace: WorkspaceSession | undefined,
    native = false,
  ) => {
    if (!workspace) return false;
    const source = nodeMaps.find(
      (item) => item.contentSha256 === workspace.source.contentSha256,
    );
    if (!source) {
      setMessage("当前工作区缺少原始 A5 闭包，无法导出");
      return false;
    }
    try {
      const output = await buildWorkspaceExport(workspace, source, native);
      downloadBlob(output.blob, output.fileName);
      workspaceStore.markSaved(workspace.id);
      setMessage(output.message);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Node Map 导出失败");
      return false;
    }
  };
  const systemPlugins = useSystemPlugins({
    catalog,
    canExportNative: location.protocol === "pip:",
    host,
    hostStore,
    message,
    onExport: (workspace, native) => void exportWorkspace(workspace, native),
    onHistory: history,
    onMessage: setMessage,
    preferences: preferenceStore,
    workspaces,
    workspaceStore,
  });
  const invokeCreator = async (
    workspace: WorkspaceSession,
    creatorId: string,
    point: WorkspacePoint,
    input?: JsonValue,
    origin?: RelationRef,
  ) => {
    const creator = nodeTypes.creators().find((item) => item.id === creatorId);
    if (!creator) throw new Error(`Unknown creator ${creatorId}`);
    const context = {
      workspaceId: workspace.id,
      graph: workspace.graph,
      rootNodeIds: workspace.rootNodeIds,
      worldPosition: point,
      origin,
    };
    if (!creator.accepts(context)) {
      throw new Error(`Creator ${creatorId} does not accept this workspace`);
    }
    const result = await creator.create(context, input);
    workspaceStore.commitCreation(
      workspace.id,
      result,
      point,
      nodeTypes.validators(),
    );
  };
  const handleRequest = async (
    workspace: WorkspaceSession,
    request: RelationElementRequest,
  ) => {
    try {
      await dispatchRelationElementRequest(request, {
        active: workspace,
        commandQueues,
        executionManager,
        invokeCreator: (id, point, input, origin) =>
          invokeCreator(workspace, id, point, input, origin),
        nodeTypes,
        workspaceStore,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关系操作失败");
    }
  };
  const nameFor = (workspace: WorkspaceSession) =>
    workspaceName(workspace, nodeMaps);
  const closeNow = (id: string) => {
    const tabs = workspaces.filter((item) => !host.workspaceWindows[item.id]);
    const index = tabs.findIndex((item) => item.id === id);
    systemPlugins.disposeWorkspace(id);
    hostStore.removeWorkspace(id);
    workspaceStore.remove(id);
    if (id === activeWorkspaceId) {
      setActiveWorkspaceId(tabs[index + 1]?.id ?? tabs[index - 1]?.id);
    }
    if (id === focusedWorkspaceId) setFocusedWorkspaceId(undefined);
    setPendingClose(undefined);
  };

  const requestClose = (id: string) => {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) return;
    if (graphFingerprint(workspace.graph) !== workspace.savedGraphFingerprint) {
      hostStore.restoreWorkspaceTab(id);
      setActiveWorkspaceId(id);
      setPendingClose(id);
    } else {
      closeNow(id);
    }
  };

  const renderWorkspace = (workspace: WorkspaceSession, autoFocus: boolean) =>
    <WorkspaceSessionCanvas
      autoFocus={autoFocus}
      workspace={workspace}
      elements={elements}
      nodeTypes={nodeTypes}
      execution={execution}
      systemPlugins={systemPlugins.canvas}
      systemPluginServices={systemPlugins.servicesFor(workspace)}
      onSelectionChange={(selection) =>
        workspaceStore.select(workspace.id, selection)}
      onRequest={(request) => void handleRequest(workspace, request)}
      onViewsChange={(views) => workspaceStore.updateViews(workspace.id, views)}
      onActivateWindow={(id) => workspaceStore.activateWindow(workspace.id, id)}
      onInvokeCreator={(id, point, origin) =>
        void invokeCreator(workspace, id, point, undefined, origin)}
      onOpenSystemPlugin={(id, point) =>
        systemPlugins.openWorkspace(workspace, id, point)}
      onCloseSystemPlugin={(window) =>
        systemPlugins.closeWorkspace(workspace, window)}
    />;

  const tabWorkspaces = workspaces.filter(
    (workspace) => !host.workspaceWindows[workspace.id],
  );
  useHostEffects({
    activeWorkspaceId,
    catalog,
    commandWorkspace,
    executionManager,
    history,
    nodeTypePackages,
    nodeTypes,
    onCloseFocusedWindow: () => {
      if (!focusedWorkspaceId || !host.workspaceWindows[focusedWorkspaceId]) {
        return;
      }
      hostStore.restoreWorkspaceTab(focusedWorkspaceId);
      setActiveWorkspaceId(focusedWorkspaceId);
    },
    requestClose,
    setActiveWorkspaceId,
    setMessage,
    tabWorkspaces,
    workspaces,
  });

  return <main className={styles.shell}>
    <RelationHostSurface
      active={active}
      activeWorkspaceId={activeWorkspaceId}
      creatorRequest={creatorRequest}
      focused={focused}
      host={host}
      hostStore={hostStore}
      nameFor={nameFor}
      renderWorkspace={renderWorkspace}
      systemPlugins={systemPlugins}
      tabWorkspaces={tabWorkspaces}
      workspaces={workspaces}
      onActivateTab={(id) => {
        setFocusedWorkspaceId(id);
        if (host.workspaceWindows[id]) hostStore.restoreWorkspaceTab(id);
        setActiveWorkspaceId(id === activeWorkspaceId ? undefined : id);
      }}
      onCloseWorkspace={requestClose}
      onCreateWorkspace={(point, viewport) => {
        const workspace = createScratchWorkspace();
        workspaceStore.add(workspace);
        presentWorkspace(workspace, point, viewport);
      }}
      onFocusWorkspace={setFocusedWorkspaceId}
      onOpenCreator={() => {
        setActiveWorkspaceId(undefined);
        setCreatorRequest((value) => value + 1);
      }}
      onReorder={(id, before) => workspaceStore.reorder(id, before)}
      onWorkspaceDrop={(id, point, viewport) => {
        hostStore.presentWorkspace(id, point, "top-left", viewport);
        setActiveWorkspaceId(undefined);
        setFocusedWorkspaceId(id);
      }}
    />
    {pendingClose && <CloseWorkspaceDialog
      name={nameFor(workspaces.find((item) => item.id === pendingClose)!)}
      onCancel={() => setPendingClose(undefined)}
      onDiscard={() => closeNow(pendingClose)}
      onExport={() => void exportWorkspace(
        workspaces.find((item) => item.id === pendingClose),
      ).then((ok) => {
        if (ok) closeNow(pendingClose);
      })}
    />}
  </main>;
}
