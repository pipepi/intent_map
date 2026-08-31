/** 集中管理只应注册一次的宿主生命周期和全局组合键。 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { JsonValue } from "../relation/index.ts";
import { readHostLaunchPackage } from "../pip/host-client.ts";
import type { NodeTypePluginRegistry } from "./activation/node-type-registry.ts";
import type { ExecutionSessionManager } from "./execution/session-manager.ts";
import { TriggerRuntime } from "./execution/trigger-runtime.ts";
import { importPip } from "./packages/import-pip.ts";
import type { usePluginCatalog } from "./use-plugin-catalog.ts";
import type { WorkspaceSession } from "./workspace/workspace-store.ts";

type HostEffectsOptions = {
  activeWorkspaceId?: string;
  catalog: ReturnType<typeof usePluginCatalog>;
  commandWorkspace?: WorkspaceSession;
  executionManager: ExecutionSessionManager;
  history: (
    workspace: WorkspaceSession,
    direction: "undo" | "redo",
  ) => void;
  nodeTypePackages: unknown[];
  nodeTypes: NodeTypePluginRegistry;
  onCloseFocusedWindow: () => void;
  requestClose: (workspaceId: string) => void;
  setActiveWorkspaceId: Dispatch<SetStateAction<string | undefined>>;
  setMessage: Dispatch<SetStateAction<string>>;
  tabWorkspaces: WorkspaceSession[];
  workspaces: WorkspaceSession[];
};

export function useHostEffects({
  activeWorkspaceId,
  catalog,
  commandWorkspace,
  executionManager,
  history,
  nodeTypePackages,
  nodeTypes,
  onCloseFocusedWindow,
  requestClose,
  setActiveWorkspaceId,
  setMessage,
  tabWorkspaces,
  workspaces,
}: HostEffectsOptions) {
  const launchRead = useRef(false);
  const [triggerRuntime] = useState(
    () => new TriggerRuntime({
      registry: nodeTypes,
      fire: async (workspace, triggerNodeId, payload) => {
        await executionManager.trigger({
          workspaceId: workspace.id,
          graph: workspace.graph,
          triggerNodeId,
          payload,
        });
      },
      close: (workspaceId, triggerNodeId) =>
        executionManager.closeTrigger(workspaceId, triggerNodeId),
      error: (error) => setMessage(
        error instanceof Error ? error.message : "自动触发执行失败",
      ),
    }),
  );

  useEffect(() => {
    if (launchRead.current || location.protocol !== "pip:") return;
    launchRead.current = true;
    void readHostLaunchPackage()
      .then((bytes) => bytes && importPip(bytes, {
        confirmTrust: () => true,
        trustHashes: catalog.persistTrust,
        installElement: catalog.installElement,
        installNodeType: catalog.installNodeType,
        openNodeMap: catalog.openNodeMap,
        uninstallElement: catalog.rollbackElement,
        uninstallNodeType: catalog.rollbackNodeType,
      }))
      .catch((error) => setMessage(
        error instanceof Error ? error.message : "启动 A5 失败",
      ));
  }, [catalog, setMessage]);

  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    addEventListener("wheel", preventPageZoom, { passive: false });
    return () => removeEventListener("wheel", preventPageZoom);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "w") {
        event.preventDefault();
        if (activeWorkspaceId) requestClose(activeWorkspaceId);
        else onCloseFocusedWindow();
      }
      if (event.key === "Tab" && tabWorkspaces.length) {
        event.preventDefault();
        const index = tabWorkspaces.findIndex(
          (item) => item.id === activeWorkspaceId,
        );
        const delta = event.shiftKey ? -1 : 1;
        const next = index < 0
          ? tabWorkspaces[0]
          : tabWorkspaces[
            (index + delta + tabWorkspaces.length) % tabWorkspaces.length
          ];
        setActiveWorkspaceId(next.id);
      }
      if (key === "z" && commandWorkspace) {
        event.preventDefault();
        history(commandWorkspace, event.shiftKey ? "redo" : "undo");
      }
    };
    addEventListener("keydown", handleKeyDown);
    return () => removeEventListener("keydown", handleKeyDown);
  }, [
    activeWorkspaceId,
    commandWorkspace,
    history,
    onCloseFocusedWindow,
    requestClose,
    setActiveWorkspaceId,
    tabWorkspaces,
  ]);

  useEffect(() => {
    for (const workspace of workspaces) {
      executionManager.markWorkspaceStale(workspace.id, workspace.graph.revision);
    }
  }, [executionManager, workspaces]);

  useEffect(() => {
    triggerRuntime.sync(workspaces);
  }, [nodeTypePackages, triggerRuntime, workspaces]);

  useEffect(() => () => triggerRuntime.dispose(), [triggerRuntime]);

  useEffect(() => {
    const handleHook = (event: Event) => {
      const detail = (event as CustomEvent<{
        key?: unknown;
        payload?: JsonValue;
      }>).detail;
      if (typeof detail?.key !== "string") return;
      void triggerRuntime.dispatchHook(detail.key, detail.payload ?? {})
        .catch((error) => setMessage(
          error instanceof Error ? error.message : "Hook 触发失败",
        ));
    };
    addEventListener("intent-relation-hook", handleHook);
    return () => removeEventListener("intent-relation-hook", handleHook);
  }, [setMessage, triggerRuntime]);
}
