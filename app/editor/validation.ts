// ============================================================================
// 作用域校验（page.tsx 拆出）
//   - detectCycle：数据管道循环依赖检测
//   - collectValidationIssues：三级严重度的作用域问题收集
// ============================================================================

import type { IntentNode } from "../runtime/model";
import { deriveNodeBindingEdges } from "../runtime/panel-pipelines";
import { collectRefs } from "./bindings";

/**
 * 检测数据管道的循环依赖：只取 channel === "data" 的边建图，
 * DFS 三色标记（visiting/visited），命中环则返回环上的节点 id 路径，
 * 无环返回 null。事件通道不参与（事件允许回环）。
 */
export const detectCycle = (scope: IntentNode): string[] | null => {
  const dataEdges = deriveNodeBindingEdges(scope).filter(
    (edge) => edge.channel === "data",
  );
  const graph = new Map<string, string[]>();
  (scope.children ?? []).forEach((child) => graph.set(child.id, []));
  dataEdges.forEach((edge) =>
    graph.get(edge.targetNodeId)?.push(edge.sourceNodeId),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    if (visiting.has(id)) return [...path, id];
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      const found = walk(dependency, [...path, id]);
      if (found) return found;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of graph.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
};

export type ValidationIssue = {
  level: "error" | "warning" | "info";
  text: string;
  nodeId: string;
  portId?: string;
  edgeId?: string;
  scopeNodeId: string;
};

/**
 * 收集作用域的校验问题，三级严重度：
 *   error   数据依赖成环（无法执行）
 *   warning 输入未绑定 / 容器输出未映射（可能产生空数据）
 *   info    环境输入没人消费 / 节点输出没人消费（冗余提示）
 */
export const collectValidationIssues = (scope: IntentNode): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const cycle = detectCycle(scope);
  if (cycle) {
    issues.push({
      level: "error",
      text: `循环依赖：${cycle.join(" → ")}`,
      nodeId: cycle[0] ?? scope.id,
      edgeId: `cycle:${cycle.join(">")}`,
      scopeNodeId: scope.id,
    });
  }
  const children = scope.children ?? [];
  const consumedEnvironment = new Set<string>();
  const consumedOutputs = new Set<string>();
  for (const child of children) {
    for (const input of child.inputs) {
      if (!input.binding) {
        issues.push({
          level: "warning",
          text: `「${child.name}」输入「${input.name}」未绑定`,
          nodeId: child.id,
          portId: input.id,
          scopeNodeId: scope.id,
        });
      }
      for (const reference of collectRefs(input.binding)) {
        if (reference.env) consumedEnvironment.add(reference.portId);
        if (reference.nodeId) {
          consumedOutputs.add(`${reference.nodeId}:${reference.portId}`);
        }
      }
    }
  }
  for (const output of scope.outputs) {
    if (!output.binding) {
      issues.push({
        level: "warning",
        text: `容器输出「${output.name}」未映射`,
        nodeId: scope.id,
        portId: output.id,
        scopeNodeId: scope.id,
      });
    }
    for (const reference of collectRefs(output.binding)) {
      if (reference.env) consumedEnvironment.add(reference.portId);
      if (reference.nodeId) {
        consumedOutputs.add(`${reference.nodeId}:${reference.portId}`);
      }
    }
  }
  for (const port of scope.inputs) {
    if (!consumedEnvironment.has(port.id)) {
      issues.push({
        level: "info",
        text: `环境输入「${port.name}」未被任何节点消费`,
        nodeId: scope.id,
        portId: port.id,
        scopeNodeId: scope.id,
      });
    }
  }
  for (const child of children) {
    if (
      child.outputs.length > 0 &&
      child.outputs.every(
        (output) => !consumedOutputs.has(`${child.id}:${output.id}`),
      )
    ) {
      issues.push({
        level: "info",
        text: `「${child.name}」的输出未被消费`,
        nodeId: child.id,
        portId: child.outputs[0]?.id,
        scopeNodeId: scope.id,
      });
    }
  }
  return issues;
};
