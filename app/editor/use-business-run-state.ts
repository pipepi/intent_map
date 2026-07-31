// ============================================================================
// useBusinessRunState —— 业务运行域 Hook（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 业务树运行的一组状态与动作（与 business-run.ts 工厂会师）：
//
//   runState    idle → running → success / failed / idle(取消)
//   trace       执行轨迹（运行面板逐行展示，轨迹回调就地合并）
//   rootInput   业务根节点的运行输入值（object/array 按 JSON 解析）
//   cancelRunRef 取消标记（stop 置位，执行器逐轮检查）
//
// 跨域触点只有两个，经 deps 注入：businessRoot（拓扑执行入口，page 派生）、
// setToast（运行失败上报）。run/stop 直接由本 Hook 经 createBusinessRun 创建。
//
// 用法：
//   const { runState, trace, rootInput, setRootInput, run, stop } =
//     useBusinessRunState({ businessRoot, setToast });
// ============================================================================

import { useRef, useState } from "react";

import type { IntentNode } from "../runtime/model";

import { type Trace } from "./executor";
import {
  createBusinessRun,
  type BusinessRunState,
} from "./business-run";

export interface BusinessRunStateDeps {
  /** 业务根节点（拓扑执行入口，由 page 派生区计算） */
  businessRoot: IntentNode;
  /** 运行失败/根输入非法 JSON 时的上报通道 */
  setToast: (message: string) => void;
}

export interface BusinessRunStateOps {
  runState: BusinessRunState;
  /** 执行轨迹（运行面板逐行展示） */
  trace: Trace[];
  /** 业务根节点的运行输入值（运行面板中可编辑） */
  rootInput: Record<string, unknown>;
  setRootInput: (
    next:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
  run: () => Promise<void>;
  stop: () => void;
}

export function useBusinessRunState(
  deps: BusinessRunStateDeps,
): BusinessRunStateOps {
  const [runState, setRunState] = useState<BusinessRunState>("idle");
  const [trace, setTrace] = useState<Trace[]>([]);
  // 业务根节点的运行输入默认值（object/array 类型按 JSON 解析）
  const [rootInput, setRootInput] = useState<Record<string, unknown>>({
    product_goal: "构建可验证、可持续演进的业务应用",
    business_constraints: "确定性、可审计、严格模块边界",
    stakeholders: "需求方, 产品设计, 工程实现",
  });
  const cancelRunRef = useRef(false);

  /* eslint-disable react-hooks/refs -- 工厂模式：cancelRunRef 仅在 run/stop 事件回调中读写，渲染期不解引用 */
  const { run, stop } = createBusinessRun({
    businessRoot: deps.businessRoot,
    rootInput,
    cancelRunRef,
    setRunState,
    setTrace,
    setToast: deps.setToast,
  });
  /* eslint-enable react-hooks/refs */

  return { runState, trace, rootInput, setRootInput, run, stop };
}
