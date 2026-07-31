/**
 * edge-renderer.tsx —— 应用域画布的 SVG 连线渲染器。
 *
 * 包含两类边的纯渲染函数（均为 .map 回调签名：第一个参数是边，第二个是 deps）：
 *
 *   1. renderEdge              —— 节点→节点的聚合管道边（AggregatedEdge）。
 *      多条同通道管道在 bindings.ts 中被聚合成一条边，此处负责：
 *      - 起止坐标计算：按端口序号沿节点右/左边缘纵向排布
 *        （PORT_TOP + 序号 × PORT_ROW）；节点最小化时退化为节点中点；
 *      - 贝塞尔弯曲度 bend 按水平距离自适应（最小 70）；
 *      - 中点圆点显示聚合条数，选中态放大并展开成员明细文本；
 *      - 交互：单击选中/取消（联动高亮相邻边、调暗无关边），
 *        双击断开该聚合边的全部成员管道并弹出 toast。
 *
 *   2. renderScopeBoundaryEdge —— 作用域边界虚拟边（ScopeBoundaryEdge）。
 *      表示"环境输入 → 内部节点"和"内部节点 → 容器输出"两种跨界连接：
 *      - 环境侧起点固定在画布左边界（x = -10）；
 *      - 容器输出终点固定在画布右边界（worldSize.width + 10）；
 *      - 无交互，仅一条贝塞尔 path。
 *
 * 与 page.tsx 的关系：page 每次渲染组装 EdgeRendererDeps 传入，
 * 函数名保持不变（appEdges.map((e) => renderEdge(e, deps))）。
 * 本模块不持有状态，全部可变值经 deps 注入。
 */

import type { ReactNode } from "react";

import { nodeDisplayMode, type IntentNode } from "../runtime/model";
import { runtimeNodeRenderSize } from "../runtime/node-renderer";

import { PORT_ROW, PORT_TOP } from "./constants";
import { findNode } from "./tree-utils";
import type { AggregatedEdge, ScopeBoundaryEdge } from "./bindings";

/**
 * 连线渲染所需的外部依赖（由 page.tsx 每次渲染组装）。
 * 均为渲染期只读值 + 事件回调，无 ref，因此不会触发 react-hooks/refs 误报。
 */
export interface EdgeRendererDeps {
  /** 当前作用域节点（边端点在其 children 中解析；边界边还读它的 inputs/outputs） */
  scopeNode: IntentNode;
  /** 画布世界尺寸（边界边的容器输出终点 x = worldSize.width + 10） */
  worldSize: { width: number; height: number };
  /** 当前选中的聚合边 id（null = 无选中）；控制选中样式与成员明细展开 */
  selectedEdgeId: string | null;
  /** 当前选中的应用节点 id；非空时相邻边高亮、其余边调暗 */
  selectedAppNodeId: string | null;
  /** 单击边时切换选中态 */
  setSelectedEdgeId: (id: string | null) => void;
  /** 双击断边时逐成员清空目标端口的输入绑定 */
  updateInputBinding: (nodeId: string, portId: string, value: string) => void;
  /** 操作反馈提示（双击断边后显示断开条数） */
  setToast: (message: string) => void;
}

/**
 * 渲染一条聚合管道边（SVG 贝塞尔曲线）。
 * 作为 appEdges.map 的回调使用：appEdges.map((edge) => renderEdge(edge, deps))。
 * 端点节点在 scopeNode 中找不到时返回 null（防御性，正常不会触发）。
 */
export function renderEdge(
  edge: AggregatedEdge,
  deps: EdgeRendererDeps,
): ReactNode {
  const {
    scopeNode,
    selectedEdgeId,
    selectedAppNodeId,
    setSelectedEdgeId,
    updateInputBinding,
    setToast,
  } = deps;
  const source = findNode(scopeNode, edge.sourceNodeId);
  const target = findNode(scopeNode, edge.targetNodeId);
  if (!source || !target) return null;
  const sourceSize = runtimeNodeRenderSize(source);
  const targetSize = runtimeNodeRenderSize(target);
  const sourceMinimized = nodeDisplayMode(source) === "minimized";
  const targetMinimized = nodeDisplayMode(target) === "minimized";
  const sourcePortIndex = Math.max(0, source.outputs.findIndex((port) => port.id === edge.sourcePortId));
  const targetPortIndex = Math.max(0, target.inputs.findIndex((port) => port.id === edge.targetPortId));
  const sx =
    source.position.x + sourceSize.width + (sourceMinimized ? 0 : 6);
  const sy = sourceMinimized
    ? source.position.y + sourceSize.height / 2
    : source.position.y + PORT_TOP + sourcePortIndex * PORT_ROW;
  const tx = target.position.x - (targetMinimized ? 0 : 6);
  const ty = targetMinimized
    ? target.position.y + targetSize.height / 2
    : target.position.y + PORT_TOP + targetPortIndex * PORT_ROW;
  const bend = Math.max(70, Math.abs(tx - sx) * 0.42);
  const selected = selectedEdgeId === edge.id;
  return (
    <g
      className={`runtime-edge channel-${edge.channel} ${selected ? "selected" : ""} ${selectedAppNodeId ? (edge.sourceNodeId === selectedAppNodeId || edge.targetNodeId === selectedAppNodeId ? "edge-connected" : "edge-dim") : ""}`}
      key={edge.id}
      onPointerDown={(event) => {
        event.stopPropagation();
        setSelectedEdgeId(selected ? null : edge.id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        edge.members.forEach((member) =>
          updateInputBinding(member.targetNodeId, member.targetPortId, ""),
        );
        setSelectedEdgeId(null);
        setToast(`已断开 ${edge.members.length} 条管道`);
      }}
    >
      <path d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`} />
      <circle cx={(sx + tx) / 2} cy={(sy + ty) / 2} r={selected ? 12 : 9} />
      <text x={(sx + tx) / 2} y={(sy + ty) / 2 + 3}>{edge.count}</text>
      {selected && <text className="edge-detail" x={(sx + tx) / 2} y={(sy + ty) / 2 + 28}>{edge.members.map((member) => `${member.sourcePortId}→${member.targetPortId}`).join(" · ")}</text>}
    </g>
  );
}

/**
 * 渲染作用域边界虚拟边（环境输入 → 节点、节点 → 容器输出）。
 * 作为 scopeBoundaryEdges.map 的回调使用。
 * 节点侧端点解析失败时返回 null（防御性）；无交互，仅画 path。
 */
export function renderScopeBoundaryEdge(
  edge: ScopeBoundaryEdge,
  deps: EdgeRendererDeps,
): ReactNode {
  const { scopeNode, worldSize } = deps;
  const source =
    edge.sourceKind === "node" && edge.sourceId
      ? scopeNode.children?.find((node) => node.id === edge.sourceId)
      : undefined;
  const target =
    edge.targetKind === "node" && edge.targetId
      ? scopeNode.children?.find((node) => node.id === edge.targetId)
      : undefined;
  if (edge.sourceKind === "node" && !source) return null;
  if (edge.targetKind === "node" && !target) return null;
  const sourceSize = source ? runtimeNodeRenderSize(source) : undefined;
  const targetSize = target ? runtimeNodeRenderSize(target) : undefined;
  const sourceIndex =
    edge.sourceKind === "environment"
      ? Math.max(
          0,
          scopeNode.inputs.findIndex(
            (port) => port.id === edge.sourcePortId,
          ),
        )
      : Math.max(
          0,
          source?.outputs.findIndex(
            (port) => port.id === edge.sourcePortId,
          ) ?? 0,
        );
  const targetIndex =
    edge.targetKind === "container-output"
      ? Math.max(
          0,
          scopeNode.outputs.findIndex(
            (port) => port.id === edge.targetPortId,
          ),
        )
      : Math.max(
          0,
          target?.inputs.findIndex(
            (port) => port.id === edge.targetPortId,
          ) ?? 0,
        );
  const sourceMinimized =
    source && nodeDisplayMode(source) === "minimized";
  const targetMinimized =
    target && nodeDisplayMode(target) === "minimized";
  const sx =
    edge.sourceKind === "environment"
      ? -10
      : source!.position.x +
        sourceSize!.width +
        (sourceMinimized ? 0 : 6);
  const sy =
    edge.sourceKind === "environment"
      ? PORT_TOP + sourceIndex * PORT_ROW
      : sourceMinimized
        ? source!.position.y + sourceSize!.height / 2
        : source!.position.y + PORT_TOP + sourceIndex * PORT_ROW;
  const tx =
    edge.targetKind === "container-output"
      ? worldSize.width + 10
      : target!.position.x - (targetMinimized ? 0 : 6);
  const ty =
    edge.targetKind === "container-output"
      ? PORT_TOP + targetIndex * PORT_ROW
      : targetMinimized
        ? target!.position.y + targetSize!.height / 2
        : target!.position.y + PORT_TOP + targetIndex * PORT_ROW;
  const bend = Math.max(70, Math.abs(tx - sx) * 0.42);
  return (
    <path
      className={`runtime-boundary-edge channel-${edge.channel}`}
      key={edge.id}
      d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`}
    />
  );
}
