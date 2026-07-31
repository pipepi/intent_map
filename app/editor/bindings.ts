// ============================================================================
// 绑定表达式与连线推导（page.tsx 拆出）
//   - collectRefs：绑定表达式的引用收集
//   - AggregatedEdge / aggregateEdges：同源同通道管道聚合显示
//   - ScopeBoundaryEdge / deriveScopeBoundaryEdges：容器边界虚拟连线
// ============================================================================

import type { Expression, IntentNode } from "../runtime/model";
import type { NodeBindingEdge } from "../runtime/panel-pipelines";

/**
 * 收集绑定表达式中的所有 ref 引用（端口绑定支持 const/ref/op 三种表达式，
 * op 可嵌套，这里递归展开，用于依赖分析、校验和连线推导）。
 */
export const collectRefs = (expression?: Expression): Array<Extract<Expression, { kind: "ref" }>> => {
  if (!expression) return [];
  if (expression.kind === "ref") return [expression];
  if (expression.kind === "op") return expression.args.flatMap(collectRefs);
  return [];
};

/**
 * 聚合边：同一对节点、同一通道上的多条管道合并为一条显示，
 * count 为管道数，members 保留每条明细（用于双击批量断开）。
 */
export type AggregatedEdge = NodeBindingEdge & {
  count: number;
  members: NodeBindingEdge[];
};

/**
 * 作用域边界边：连接"容器边界端口"与内部节点的虚拟管道。
 * 两种形态：
 *   environment → node          容器的环境输入流进某个子节点的输入端口
 *   node/environment → container-output  内部输出映射到容器对外输出端口
 */
export type ScopeBoundaryEdge = {
  id: string;
  sourceKind: "environment" | "node";
  sourceId?: string;
  sourcePortId: string;
  targetKind: "node" | "container-output";
  targetId?: string;
  targetPortId: string;
  channel: "data" | "event";
};

/** 把同一对节点、同一通道的多条绑定边聚合成一条显示边（见 AggregatedEdge）。 */
export const aggregateEdges = (edges: NodeBindingEdge[]): AggregatedEdge[] => {
  const groups = new Map<string, NodeBindingEdge[]>();
  for (const edge of edges) {
    const key = `${edge.sourceNodeId}>${edge.targetNodeId}:${edge.channel}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  return [...groups.entries()].map(([id, members]) => ({
    ...members[0],
    id,
    count: members.length,
    members,
  }));
};

/**
 * 推导作用域边界上的虚拟连线（见 ScopeBoundaryEdge）：
 * 扫描子节点输入绑定里的 env 引用 → 生成"环境输入 → 节点"的边；
 * 扫描容器输出绑定里的引用 → 生成"节点/环境 → 容器输出"的边。
 */
export const deriveScopeBoundaryEdges = (scope: IntentNode): ScopeBoundaryEdge[] => [
  ...(scope.children ?? []).flatMap((target) =>
    target.inputs.flatMap((input) =>
      collectRefs(input.binding)
        .filter((reference) => reference.env)
        .map((reference, index) => ({
          id: `environment:${reference.portId}>${target.id}:${input.id}:${index}`,
          sourceKind: "environment" as const,
          sourcePortId: reference.portId,
          targetKind: "node" as const,
          targetId: target.id,
          targetPortId: input.id,
          channel: input.channel ?? "data",
        })),
    ),
  ),
  ...scope.outputs.flatMap((output) =>
    collectRefs(output.binding).map((reference, index) => ({
      id: `scope-output:${reference.env ? "environment" : reference.nodeId}:${reference.portId}>${output.id}:${index}`,
      sourceKind: reference.env ? ("environment" as const) : ("node" as const),
      sourceId: reference.nodeId,
      sourcePortId: reference.portId,
      targetKind: "container-output" as const,
      targetPortId: output.id,
      channel: output.channel ?? "data",
    })),
  ),
];
