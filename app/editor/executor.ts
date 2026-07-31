// ============================================================================
// 业务执行器（page.tsx 拆出）
//   - evaluateExpression：绑定表达式求值
//   - executeBusinessNode：本地确定性拓扑执行 + 轨迹上报
// ============================================================================

import type { Expression, IntentNode } from "../runtime/model";
import { collectRefs } from "./bindings";
import { detectCycle } from "./validation";

/** 业务执行追踪条目：记录每个业务节点一次执行的状态、耗时与输出。 */
export type Trace = {
  id: string;
  name: string;
  path: string;
  status: "waiting" | "running" | "success" | "failed" | "skipped" | "cancelled";
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
};

/**
 * 绑定表达式求值器：
 *   const → 字面量；ref → 查环境输入或上游节点输出；
 *   op    → 递归求值后按算子归约（concat/add/and/or/array）。
 * environment 是容器环境输入表，outputs 是已执行节点的输出表。
 */
export const evaluateExpression = (
  expression: Expression | undefined,
  environment: Record<string, unknown>,
  outputs: Map<string, Record<string, unknown>>,
): unknown => {
  if (!expression) return undefined;
  if (expression.kind === "const") return expression.value;
  if (expression.kind === "ref") {
    if (expression.env) return environment[expression.portId];
    return expression.nodeId ? outputs.get(expression.nodeId)?.[expression.portId] : undefined;
  }
  const values = expression.args.map((argument) =>
    evaluateExpression(argument, environment, outputs),
  );
  if (expression.op === "concat") return values.join("");
  if (expression.op === "add") return values.reduce<number>((sum, value) => sum + Number(value), 0);
  if (expression.op === "and") return values.every(Boolean);
  if (expression.op === "or") return values.some(Boolean);
  if (expression.op === "array") return values;
  return values[0];
};

/**
 * 本地确定性业务执行器（递归）：
 *   - 叶子节点：按内置算子（identity/object/array/concat）把输入映射到首个输出；
 *   - 容器节点：先查环，然后按"输入依赖是否齐备"分批拓扑调度子节点，
 *     同批子节点并行执行，全部完成后求值容器输出映射；
 *   - onTrace 逐步上报执行轨迹（运行面板展示），cancelled() 支持中途停止。
 */
export const executeBusinessNode = async (
  node: IntentNode,
  inputs: Record<string, unknown>,
  path: string,
  onTrace: (trace: Trace) => void,
  cancelled: () => boolean,
): Promise<Record<string, unknown>> => {
  if (cancelled()) throw new Error("cancelled");
  const started = performance.now();
  onTrace({ id: node.id, name: node.name, path, status: "running" });
  try {
    if (!node.children?.length) {
      let value: unknown = Object.values(inputs)[0];
      if (node.operator === "object") value = { ...inputs };
      if (node.operator === "array") value = Object.values(inputs);
      if (node.operator === "concat") value = Object.values(inputs).join("");
      const result = Object.fromEntries(
        node.outputs.map((output, index) => [
          output.id,
          index === 0 ? value : undefined,
        ]),
      );
      onTrace({
        id: node.id,
        name: node.name,
        path,
        status: "success",
        duration: Math.round(performance.now() - started),
        output: result,
      });
      return result;
    }
    const cycle = detectCycle(node);
    if (cycle) throw new Error(`循环依赖：${cycle.join(" → ")}`);
    const outputs = new Map<string, Record<string, unknown>>();
    const pending = new Set(node.children.map((child) => child.id));
    while (pending.size) {
      if (cancelled()) throw new Error("cancelled");
      const ready = node.children.filter(
        (child) =>
          pending.has(child.id) &&
          child.inputs.every((input) =>
            collectRefs(input.binding).every(
              (reference) => reference.env || !reference.nodeId || outputs.has(reference.nodeId),
            ),
          ),
      );
      if (!ready.length) throw new Error(`作用域 ${path} 中存在无法解析的依赖`);
      const resolved = await Promise.all(
        ready.map(async (child) => {
          const childInputs = Object.fromEntries(
            child.inputs.map((input) => [
              input.id,
              evaluateExpression(input.binding, inputs, outputs),
            ]),
          );
          return [
            child.id,
            await executeBusinessNode(
              child,
              childInputs,
              `${path} / ${child.name}`,
              onTrace,
              cancelled,
            ),
          ] as const;
        }),
      );
      resolved.forEach(([id, result]) => {
        outputs.set(id, result);
        pending.delete(id);
      });
    }
    const result = Object.fromEntries(
      node.outputs.map((output) => [
        output.id,
        evaluateExpression(output.binding, inputs, outputs),
      ]),
    );
    onTrace({
      id: node.id,
      name: node.name,
      path,
      status: "success",
      duration: Math.round(performance.now() - started),
      output: result,
    });
    return result;
  } catch (error) {
    onTrace({
      id: node.id,
      name: node.name,
      path,
      status: error instanceof Error && error.message === "cancelled" ? "cancelled" : "failed",
      duration: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
