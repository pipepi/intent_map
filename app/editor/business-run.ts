// ============================================================================
// 业务运行族（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 整棵业务树的运行/停止：
//
//   run   根输入中 object/array 类型的值先按 JSON 解析（非法 JSON 直接报错
//         并指明端口名），然后交给 editor/executor 的 executeBusinessNode
//         拓扑执行；轨迹回调做"同 id+path 就地更新、否则追加"的合并，
//         实时写入 trace 状态驱动运行面板。
//   stop  置取消标记——执行器下一轮调度时抛出 cancelled，
//         run 捕获后把状态归位 idle（cancelled 不算失败）。
//
// runState 状态机：idle → running → success / failed / idle(取消)。
// ============================================================================

import type { IntentNode } from "../runtime/model";

import { executeBusinessNode, type Trace } from "./executor";

/** 运行状态机的四个取值（与 page.tsx 的 useState 泛型一致）。 */
export type BusinessRunState = "idle" | "running" | "success" | "failed";

/** 业务运行族所需的外部依赖（page.tsx 每次渲染组装）。 */
export interface BusinessRunDeps {
  /** 业务根节点（拓扑执行的入口） */
  businessRoot: IntentNode;
  /** 业务根节点的运行输入值（object/array 按 JSON 解析） */
  rootInput: Record<string, unknown>;
  /** 取消标记（stop 置位，执行器逐轮检查；ref 只在回调中读写） */
  cancelRunRef: { current: boolean };
  setRunState: (state: BusinessRunState) => void;
  /** 轨迹状态（支持直接值与函数式更新：同 id+path 就地替换，否则追加） */
  setTrace: (next: Trace[] | ((items: Trace[]) => Trace[])) => void;
  setToast: (message: string) => void;
}

export interface BusinessRunOps {
  run: () => Promise<void>;
  stop: () => void;
}

/** 创建业务运行族操作。 */
export function createBusinessRun(deps: BusinessRunDeps): BusinessRunOps {
  const {
    businessRoot,
    rootInput,
    cancelRunRef,
    setRunState,
    setTrace,
    setToast,
  } = deps;

  const run = async () => {
    setRunState("running");
    setTrace([]);
    cancelRunRef.current = false;
    try {
      await executeBusinessNode(
        businessRoot,
        Object.fromEntries(
          businessRoot.inputs.map((port) => {
            const raw = rootInput[port.id];
            const trimmed = typeof raw === "string" ? raw.trim() : "";
            if (
              (port.type === "object" || port.type === "array") &&
              trimmed &&
              (trimmed.startsWith("{") || trimmed.startsWith("["))
            ) {
              try {
                return [port.id, JSON.parse(trimmed)] as const;
              } catch {
                throw new Error(`根输入「${port.name}」不是有效的 JSON：${trimmed.slice(0, 40)}`);
              }
            }
            return [port.id, raw] as const;
          }),
        ),
        businessRoot.name,
        (next) =>
          setTrace((items) => {
            const existing = items.findIndex((item) => item.id === next.id && item.path === next.path);
            if (existing < 0) return [...items, next];
            return items.map((item, index) => (index === existing ? next : item));
          }),
        () => cancelRunRef.current,
      );
      setRunState("success");
    } catch (error) {
      if (error instanceof Error && error.message !== "cancelled")
        setToast(error.message);
      setRunState(error instanceof Error && error.message === "cancelled" ? "idle" : "failed");
    }
  };

  const stop = () => {
    cancelRunRef.current = true;
    setRunState("idle");
  };

  return { run, stop };
}
