/** 协调 PIP 安装、工作区标签、Creator、执行会话和宿主系统窗口。 */
import { useEffect, useRef, useState } from "react";
import type { JsonValue, RelationRef } from "../relation/index.ts";
import { readHostLaunchPackage } from "../pip/host-client.ts";
import type { ExecutionContextSnapshot, RelationElementRequest, WorkspacePoint } from "./contracts/package-types.ts";
import { ExecutionSessionManager } from "./execution/session-manager.ts";
import { TriggerRuntime } from "./execution/trigger-runtime.ts";
import { importPip } from "./packages/import-pip.ts";
import { dispatchRelationElementRequest } from "./relation-host-actions.ts";
import { createScratchWorkspace, downloadBlob } from "./relation-host-workspace.ts";
import { usePluginCatalog } from "./use-plugin-catalog.ts";
import { useSystemPlugins } from "./use-system-plugins.ts";
import { CloseWorkspaceDialog } from "./view/close-workspace-dialog.tsx";
import styles from "./view/relation-host.module.css";
import { NodeCanvas } from "./view/workspace-canvas.tsx";
import { WorkspaceTabs } from "./view/workspace-tabs.tsx";
import { buildWorkspaceExport } from "./workspace-export.ts";
import { graphFingerprint, WorkspaceSessionStore, type WorkspaceSession } from "./workspace/workspace-store.ts";

export function RelationHost() {
  // WorkspaceStore 是唯一的工作区写入口；React state 只是它发布的快照。
  const [initialWorkspace] = useState(createScratchWorkspace);
  const [workspaces, setWorkspaces] = useState([initialWorkspace]);
  const [workspaceStore] = useState(
    () => new WorkspaceSessionStore([initialWorkspace], setWorkspaces),
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspace.id);
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  const [message, setMessage] = useState(
    "核心为空白宿主；Alt/Option + 左键拖拽，或按一下空格，可打开节点创建器。",
  );
  const [pendingClose, setPendingClose] = useState<string>();

  // A3、A4 registry 与已安装 PIP catalog 由同一个 hook 统一维护。
  const catalog = usePluginCatalog({ active, setActiveWorkspaceId, setMessage, workspaceStore });
  const { nodeMaps, nodeTypePackages, nodeTypes, elements } = catalog;

  // 执行管理器保存跨渲染会话；React state 只负责把快照传给视图。
  const [execution, setExecution] = useState<ExecutionContextSnapshot>({ sessions: [] });
  const [executionManager] = useState(
    () => new ExecutionSessionManager(nodeTypes, setExecution),
  );
  const commandQueuesRef = useRef(new Map<string, Promise<void>>());

  // TriggerRuntime 监听 A5 中的 trigger 声明，但不会把临时执行状态写回图。
  const [triggerRuntime] = useState(
    () => new TriggerRuntime({
      registry: nodeTypes,
      fire: async (workspace, triggerNodeId, payload) => {
        await executionManager.trigger({ workspaceId: workspace.id, graph: workspace.graph, triggerNodeId, payload });
      },
      close: (workspaceId, triggerNodeId) => executionManager.closeTrigger(workspaceId, triggerNodeId),
      error: (error) => setMessage(error instanceof Error ? error.message : "自动触发执行失败"),
    }),
  );

  const nameFor = (workspace: WorkspaceSession) => workspace.source.id === "host.new-tab"
    ? "新标签"
    : nodeMaps.find((item) => item.contentSha256 === workspace.source.contentSha256)?.nodeMap.manifest.name ?? workspace.source.id;

  async function invokeCreator(creatorId: string, point: WorkspacePoint, input?: JsonValue, origin?: RelationRef) {
    if (!active) return;
    const creator = nodeTypes.creators().find((item) => item.id === creatorId);
    if (!creator) throw new Error(`Unknown creator ${creatorId}`);

    const context = {
      workspaceId: active.id,
      graph: active.graph,
      rootNodeIds: active.rootNodeIds,
      worldPosition: point,
      origin,
    };
    if (!creator.accepts(context)) {
      throw new Error(`Creator ${creatorId} does not accept this workspace`);
    }

    const result = await creator.create(context, input);
    workspaceStore.commitCreation(active.id, result, point, nodeTypes.validators());
  }

  async function handleRequest(request: RelationElementRequest) {
    if (!active) return;
    try {
      await dispatchRelationElementRequest(request, {
        active,
        commandQueues: commandQueuesRef.current,
        executionManager,
        invokeCreator,
        nodeTypes,
        workspaceStore,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关系操作失败");
    }
  }

  function history(direction: "undo" | "redo") {
    if (!active) return;
    try {
      workspaceStore.history(active.id, direction, nodeTypes.validators());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史操作失败");
    }
  }

  async function exportWorkspace(workspace: WorkspaceSession | undefined, native = false) {
    if (!workspace) return false;
    const source = nodeMaps.find((item) => item.contentSha256 === workspace.source.contentSha256);
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
  }

  const systemPlugins = useSystemPlugins({
    active,
    catalog,
    canExportNative: location.protocol === "pip:",
    history,
    message,
    onExport: (workspace, native) => void exportWorkspace(workspace, native),
    onMessage: setMessage,
    workspaces,
    workspaceStore,
  });

  const closeNow = (id: string) => {
    const index = workspaces.findIndex((item) => item.id === id);
    // workspace scope 实例随工作区释放，host scope 单例继续服务其他工作区。
    systemPlugins.disposeWorkspace(id);
    workspaceStore.remove(id);
    if (id === activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[index + 1]?.id ?? workspaces[index - 1]?.id ?? "");
    }
    setPendingClose(undefined);
  };

  const requestClose = (id: string) => {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) return;
    if (graphFingerprint(workspace.graph) !== workspace.savedGraphFingerprint) {
      setActiveWorkspaceId(id);
      setPendingClose(id);
    } else {
      closeNow(id);
    }
  };

  const launchRead = useRef(false);
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
      .catch((error) => setMessage(error instanceof Error ? error.message : "启动 A5 失败"));
    // 原生启动包只读取一次；安装函数的后续重建不应重复打开 A5。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (activeWorkspaceId) requestClose(activeWorkspaceId);
      }
      if (event.key === "Tab" && workspaces.length) {
        event.preventDefault();
        const index = workspaces.findIndex((item) => item.id === activeWorkspaceId);
        const delta = event.shiftKey ? -1 : 1;
        setActiveWorkspaceId(workspaces[(index + delta + workspaces.length) % workspaces.length].id);
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        history(event.shiftKey ? "redo" : "undo");
      }
    };
    addEventListener("keydown", handleKeyDown);
    return () => removeEventListener("keydown", handleKeyDown);
  });

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
      const detail = (event as CustomEvent<{ key?: unknown; payload?: JsonValue }>).detail;
      if (typeof detail?.key !== "string") return;
      void triggerRuntime.dispatchHook(detail.key, detail.payload ?? {}).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Hook 触发失败");
      });
    };
    addEventListener("intent-relation-hook", handleHook);
    return () => removeEventListener("intent-relation-hook", handleHook);
  }, [triggerRuntime]);

  return <main className={styles.shell}>
    <div className={styles.layout}>
      <section className={styles.workspaceArea}>
        <WorkspaceTabs
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          nameFor={nameFor}
          onActivate={setActiveWorkspaceId}
          onClose={requestClose}
          onNew={() => {
            const workspace = createScratchWorkspace();
            workspaceStore.add(workspace);
            setActiveWorkspaceId(workspace.id);
          }}
          onReorder={(id, before) => workspaceStore.reorder(id, before)}
        />
        {active ? <NodeCanvas
          workspace={active}
          elements={elements}
          nodeTypes={nodeTypes}
          execution={{
            sessions: execution.sessions.filter((item) => item.workspaceId === active.id),
            activeSessionId: execution.activeSessionId,
          }}
          systemPlugins={systemPlugins.canvas}
          systemPluginServices={systemPlugins.services}
          onSelectionChange={(selection) => workspaceStore.select(active.id, selection)}
          onRequest={handleRequest}
          onViewsChange={(views) => workspaceStore.updateViews(active.id, views)}
          onActivateWindow={(id) => workspaceStore.activateWindow(active.id, id)}
          onInvokeCreator={(id, point, origin) => void invokeCreator(id, point, undefined, origin)}
          onOpenSystemPlugin={systemPlugins.open}
          onCloseSystemPlugin={systemPlugins.close}
        /> : <section className={styles.canvasWrap}>
          <div className={styles.empty}>点击 + 新建工作区标签</div>
        </section>}
      </section>
    </div>
    {pendingClose && <CloseWorkspaceDialog
      name={nameFor(workspaces.find((item) => item.id === pendingClose)!)}
      onCancel={() => setPendingClose(undefined)}
      onDiscard={() => closeNow(pendingClose)}
      onExport={() => void exportWorkspace(workspaces.find((item) => item.id === pendingClose)).then((ok) => {
        if (ok) closeNow(pendingClose);
      })}
    />}
  </main>;
}
