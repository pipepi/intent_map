// ============================================================================
// useRuntimePipeline —— 运行时事件管线域 Hook（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 页面里最内聚的一组状态（5 个 useState 只被一条链路读写）：
//
//   UI 操作 ──dispatchRuntimeEvent──▶ pendingEvents 队列
//     ──事件时钟 effect──▶ processEventBatch 原子归约
//     ──▶ runtimeState（scopeId/selectionId/layoutLocked/…）
//     ──▶ pipelineTrace（事件流水，保留最近 ~100 条）
//     ──▶ lastCommands（命令批，page 的命令处理器 effect 消费执行）
//
// 收进 Hook 的内容：5 个状态 + dispatchRuntimeEvent + 两个语义化动作
// （setBusinessScopeId / setSelectedBusinessNodeId）+ 事件时钟 effect。
// 跨域触点只有两个，经 deps 注入：
//   - setSelectedBusinessNodeId 同步持久化选中到文档面板（setDocumentState）
//   - 事件时钟出错时 setToast 上报
//
// 用法：
//   const pipeline = useRuntimePipeline({ setDocumentState, setToast });
//   const { runtimeState, lastCommands, dispatchRuntimeEvent, … } = pipeline;
// ============================================================================

import { useCallback, useEffect, useState } from "react";

import {
  updatePanel,
  type IntentDocumentV3,
  type JsonValue,
} from "../runtime/model";
import {
  createRuntimeEvent,
  processEventBatch,
  type ApplicationRuntimeState,
  type PipelineTraceEntry,
  type RuntimeCommand as PipelineCommand,
  type RuntimeEvent,
} from "../runtime/pipeline";

export interface RuntimePipelineDeps {
  /** 业务选中联动：持久化到自由布局面板的 selection（视图保存/恢复用） */
  setDocumentState: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
  /** 事件时钟批处理出错时的上报通道 */
  setToast: (message: string) => void;
}

export interface RuntimePipeline {
  /** 事件处理器归约出的运行时状态（业务作用域/选中/布局锁/文档修订号…） */
  runtimeState: ApplicationRuntimeState;
  /** 事件流水（运行面板展示，保留最近 ~100 条） */
  pipelineTrace: PipelineTraceEntry[];
  /** 最近一批事件归约出的命令（page 的命令处理器 effect 消费） */
  lastCommands: PipelineCommand[];
  /** 事件时钟计数（运行面板做批次标记） */
  eventTick: number;
  /** 待处理事件队列（运行面板展示排队深度） */
  pendingEvents: RuntimeEvent[];
  /** 事件管线入口：所有 UI 操作统一经它把事件投入队列 */
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, JsonValue>,
  ) => void;
  /** 切换业务作用域（NAVIGATE_SCOPE） */
  setBusinessScopeId: (scopeId: string) => void;
  /** 选中业务节点（SELECT_NODE + 持久化到面板 selection） */
  setSelectedBusinessNodeId: (nodeId: string) => void;
}

export function useRuntimePipeline({
  setDocumentState,
  setToast,
}: RuntimePipelineDeps): RuntimePipeline {
  const [runtimeState, setRuntimeState] = useState<ApplicationRuntimeState>({
    scopeId: "business_root",
    selectionId: "scenario_flow",
    layoutLocked: false,
    documentRevision: 0,
    lastEventType: "BOOT",
  });
  const [pendingEvents, setPendingEvents] = useState<RuntimeEvent[]>([]);
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceEntry[]>([]);
  const [lastCommands, setLastCommands] = useState<PipelineCommand[]>([]);
  const [eventTick, setEventTick] = useState(0);

  const dispatchRuntimeEvent = useCallback(
    (
      type: string,
      source: string,
      payload?: Record<string, JsonValue>,
    ) => {
      setPendingEvents((events) => [
        ...events,
        createRuntimeEvent(type, source, payload),
      ]);
    },
    [],
  );

  const setBusinessScopeId = useCallback(
    (scopeId: string) =>
      dispatchRuntimeEvent("NAVIGATE_SCOPE", "scope-navigation", { scopeId }),
    [dispatchRuntimeEvent],
  );

  const setSelectedBusinessNodeId = useCallback(
    (nodeId: string) => {
      dispatchRuntimeEvent("SELECT_NODE", "node-selection", { nodeId });
      setDocumentState((active) => {
        const next = updatePanel(active, "panel-free-layout", (panel) => ({
          ...panel,
          activeContainerSurfaceId: "free-layout-container",
          selection: {
            nodeIds: [nodeId],
            primaryNodeId: nodeId,
            revision: panel.selection.revision + 1,
          },
        }));
        return {
          ...next,
          workspaceState: {
            ...next.workspaceState,
            activePanelId: "panel-free-layout",
          },
        };
      });
    },
    [dispatchRuntimeEvent, setDocumentState],
  );

  /**
   * 事件时钟：pendingEvents 非空时推进一个 tick，调用 processEventBatch
   * 把整批事件原子地归约成新 runtimeState + 事件流水 + 命令列表。
   */
  useEffect(() => {
    if (!pendingEvents.length) return;
    const tick = eventTick + 1;
    // The event clock intentionally commits one atomic batch per effect turn.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventTick(tick);
    try {
      const batch = processEventBatch(pendingEvents, runtimeState, tick);
      setPendingEvents(batch.nextTick);
      setRuntimeState(batch.state);
      setPipelineTrace((entries) => [...entries.slice(-95), ...batch.trace]);
      setLastCommands(batch.commands);
    } catch (error) {
      setPendingEvents([]);
      setToast(error instanceof Error ? error.message : String(error));
    }
  }, [eventTick, pendingEvents, runtimeState, setToast]);

  return {
    runtimeState,
    pipelineTrace,
    lastCommands,
    eventTick,
    pendingEvents,
    dispatchRuntimeEvent,
    setBusinessScopeId,
    setSelectedBusinessNodeId,
  };
}
