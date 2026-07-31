// ============================================================================
// 画布图层组件（page.tsx 主 JSX 拆出）
// ----------------------------------------------------------------------------
// 主 JSX 条件渲染矩阵的四个独立分支，各为一个小组件：
//
//   ScopeNavigationBar      作用域导航条（返回上级/面包屑/管道计数/缩放比/
//                           图例浮层）。外层条件：展开 + 已钻入子作用域
//   ScopeHeader             作用域头部三态：最小化块（双击展开）/
//                           应用域标题栏（含最小化按钮）/ 业务域无标题栏
//   AppScopeContent         应用域内容线（与业务域互斥）：边界端口 +
//                           SVG 连线 + 子节点 NodeProjection 列表 +
//                           聚焦叶子面板 + "＋ 添加子节点"按钮。
//                           内部三个追加条件就近声明，不再散在主 JSX
//   ContainerResizeControls 容器缩放手柄 + 三向/八向模式切换。
//                           外层条件：展开 + 未锁定布局
//
// 全部为受控展示组件：状态归 page.tsx，这里只接 props 渲染。
// 以组件形式使用（回调即 props），不会触发 react-hooks/refs 误报。
// ============================================================================

import { Fragment, type ReactNode } from "react";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  type IntentNode,
  type ScopeAddress,
} from "../runtime/model";
import {
  NodeProjection,
  resizeDirectionsFor,
} from "../runtime/node-renderer";

import { PORT_ROW, PORT_TOP } from "./constants";
import { nodeResizeMode } from "./tree-utils";
import type { AggregatedEdge, ScopeBoundaryEdge } from "./bindings";
import {
  renderEdge,
  renderScopeBoundaryEdge,
  type EdgeRendererDeps,
} from "./edge-renderer";
import type {
  createMoveNodeStart,
  createResizeNodeStart,
  createResizeScopeCanvasStart,
} from "./pointer-gestures";

// ---------------------------------------------------------------------------
// 作用域导航条
// ---------------------------------------------------------------------------

export interface ScopeNavigationBarProps {
  /** 面包屑每一层的显示名（与 navigationStack 等长） */
  scopePath: string[];
  /** 钻取路径栈（生成 Fragment key、判断目标域） */
  navigationStack: ScopeAddress[];
  /** 当前作用域内管道计数（业务域=业务引用边；应用域=绑定边+边界边） */
  pipeCount: number;
  /** 当前相机缩放（显示百分比） */
  cameraScale: number;
  /** 图例浮层开关 */
  legendOpen: boolean;
  onToggleLegend: () => void;
  onNavigateParent: () => void;
  /** 面包屑跳转：截断栈到第 index 层 */
  onNavigateFrame: (index: number) => void;
}

export function ScopeNavigationBar({
  scopePath,
  navigationStack,
  pipeCount,
  cameraScale,
  legendOpen,
  onToggleLegend,
  onNavigateParent,
  onNavigateFrame,
}: ScopeNavigationBarProps): ReactNode {
  return (
    <nav className="scope-navigation-bar" aria-label="当前作用域导航">
      <button onClick={onNavigateParent}>← 返回上级</button>
      <div className="scope-path">
        {scopePath.map((name, index) => (
          <Fragment key={`${navigationStack[index].domain}:${navigationStack[index].nodeId}`}>
            <button
              className={
                index === scopePath.length - 1
                  ? "scope-path-current"
                  : undefined
              }
              disabled={index === scopePath.length - 1}
              aria-current={
                index === scopePath.length - 1
                  ? "page"
                  : undefined
              }
              title={name}
              onClick={() => onNavigateFrame(index)}
            >
              {name}
            </button>
            {index < scopePath.length - 1 && <i>›</i>}
          </Fragment>
        ))}
      </div>
      <button
        className="scope-pipeline-trigger"
        title="本作用域内的数据/事件管道数量，点击查看图例"
        aria-expanded={legendOpen}
        onClick={onToggleLegend}
      >
        {pipeCount} 管道
      </button>
      <span>{Math.round(cameraScale * 100)}%</span>
      {legendOpen && (
        <div className="scope-legend-popover">
          <span><i className="data" />数据管道</span>
          <span><i className="event" />事件管道</span>
          <small>Ctrl + 滚轮进入或返回</small>
          <small>双击展开 · 再双击进入 · Esc 返回</small>
          <small>Ctrl+Z 撤销 · Ctrl+S 导出 · Enter 进入选中</small>
          <small>◆ 核心节点</small>
        </div>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 作用域头部（三态）
// ---------------------------------------------------------------------------

export interface ScopeHeaderProps {
  /** 当前作用域是否最小化（只显示节点名小块） */
  minimized: boolean;
  /** 是否在业务域（业务域无标题栏） */
  isBusinessScope: boolean;
  /** 当前作用域节点 */
  scopeNode: IntentNode;
  /** 切换显示模式（最小化⇄展开） */
  onToggleDisplayMode: (node: IntentNode) => void;
}

export function ScopeHeader({
  minimized,
  isBusinessScope,
  scopeNode,
  onToggleDisplayMode,
}: ScopeHeaderProps): ReactNode {
  if (minimized) {
    return (
      <button
        className="root-minimized-node"
        style={{ left: 0, top: 0 }}
        title="双击展开节点"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onToggleDisplayMode(scopeNode);
        }}
      >
        {scopeNode.name}
      </button>
    );
  }
  if (isBusinessScope) return null;
  return (
    <div className="root-caption">
      <span>{scopeNode.kind.toUpperCase()}</span>
      <strong>{scopeNode.name}</strong>
      <small>{scopeNode.description}</small>
      <button
        className="node-display-toggle root-display-toggle"
        aria-label={`最小化「${scopeNode.name}」`}
        title="只显示节点名称"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDisplayMode(scopeNode);
        }}
      >
        −
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 应用域内容线（边界端口 + SVG 连线 + 子节点 + 聚焦叶子 + 添加子节点）
// ---------------------------------------------------------------------------

export interface AppScopeContentProps {
  /** 当前作用域节点（边界端口、聚焦叶子内容的来源） */
  scopeNode: IntentNode;
  /** 画布世界尺寸（SVG viewBox、聚焦叶子面板尺寸） */
  worldSize: { width: number; height: number };
  /** 聚合后的节点间管道边 */
  appEdges: AggregatedEdge[];
  /** 作用域边界虚拟边 */
  scopeBoundaryEdges: ScopeBoundaryEdge[];
  /** 连线渲染 deps（edge-renderer） */
  edgeRendererDeps: EdgeRendererDeps;
  /** 当前可见子节点（投影为可拖拽/缩放/进入的 NodeProjection） */
  visibleNodes: IntentNode[];
  cameraScale: number;
  /** 当前选中的应用节点 id */
  selectedAppNodeId: string;
  layoutLocked: boolean;
  /** 当前业务作用域 id（选中业务引用节点时联动业务选中） */
  businessScopeId: string;
  /** 节点内容渲染分发（node-surfaces 的薄封装） */
  renderNodeContent: (node: IntentNode) => ReactNode;
  /** 选中应用节点（含业务引用节点的业务选中联动） */
  onSelectAppNode: (nodeId: string) => void;
  /** 选中业务引用节点时同步业务域选中 */
  onSelectBusinessNode: (nodeId: string) => void;
  onEnterNode: (node: IntentNode) => void;
  onMoveStart: ReturnType<typeof createMoveNodeStart>;
  onResizeStart: ReturnType<typeof createResizeNodeStart>;
  onResizeModeToggle: (node: IntentNode) => void;
  onDisplayModeToggle: (node: IntentNode) => void;
  /** 聚焦叶子：已钻入深层且当前作用域无子节点 */
  focusedLeaf: boolean;
  /** 允许显示"＋ 添加子节点"按钮（应用域聚焦叶子、非容器渲染器） */
  canAddRuntimeChild: boolean;
  onAddRuntimeChild: () => void;
}

export function AppScopeContent({
  scopeNode,
  worldSize,
  appEdges,
  scopeBoundaryEdges,
  edgeRendererDeps,
  visibleNodes,
  cameraScale,
  selectedAppNodeId,
  layoutLocked,
  businessScopeId,
  renderNodeContent,
  onSelectAppNode,
  onSelectBusinessNode,
  onEnterNode,
  onMoveStart,
  onResizeStart,
  onResizeModeToggle,
  onDisplayModeToggle,
  focusedLeaf,
  canAddRuntimeChild,
  onAddRuntimeChild,
}: AppScopeContentProps): ReactNode {
  return (
    <>
      {/* 应用域装饰层：边界输入/输出端口 + 节点间管道与边界管道的 SVG 连线 */}
      <div
        className="scope-boundary-ports scope-boundary-inputs"
        aria-hidden="true"
      >
        {scopeNode.inputs.map((port, index) => (
          <span
            key={port.id}
            style={{ top: PORT_TOP - 12 + index * PORT_ROW }}
          >
            <i />
            {port.name}
          </span>
        ))}
      </div>
      <div
        className="scope-boundary-ports scope-boundary-outputs"
        aria-hidden="true"
      >
        {scopeNode.outputs.map((port, index) => (
          <span
            key={port.id}
            style={{ top: PORT_TOP - 12 + index * PORT_ROW }}
          >
            {port.name}
            <i />
          </span>
        ))}
      </div>
      <svg
        className="runtime-edges"
        viewBox={`0 0 ${worldSize.width} ${worldSize.height}`}
      >
        {appEdges.map((edge) => renderEdge(edge, edgeRendererDeps))}
        {scopeBoundaryEdges.map((edge) => renderScopeBoundaryEdge(edge, edgeRendererDeps))}
      </svg>
      {/* 应用域子节点列表 */}
      {visibleNodes.map((node) => (
        <NodeProjection
          key={node.id}
          node={node}
          scale={cameraScale}
          selected={selectedAppNodeId === node.id}
          active={false}
          layoutLocked={layoutLocked}
          content={renderNodeContent(node)}
          onSelect={(nodeId) => {
            onSelectAppNode(nodeId);
            if (nodeId === ACTIVE_BUSINESS_SCOPE_REF_ID) {
              onSelectBusinessNode(businessScopeId);
            }
          }}
          onEnter={onEnterNode}
          onMoveStart={onMoveStart}
          onResizeStart={onResizeStart}
          onResizeModeToggle={onResizeModeToggle}
          onDisplayModeToggle={onDisplayModeToggle}
        />
      ))}
      {/* 聚焦叶子面板：已钻入深层且没有子节点时，把叶子节点自身的实现内容放大渲染 */}
      {focusedLeaf && (
        <section
          className="focused-runtime-content"
          style={{
            width: Math.max(640, worldSize.width - 64),
            height: Math.max(420, worldSize.height - 96),
          }}
        >
          {renderNodeContent(scopeNode)}
        </section>
      )}
      {/* "＋ 添加子节点"按钮：仅 canAddRuntimeChild 时出现 */}
      {canAddRuntimeChild && (
        <button className="runtime-add-child" onClick={onAddRuntimeChild}>＋ 添加子节点</button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 容器缩放手柄 + 三向/八向模式切换
// ---------------------------------------------------------------------------

export interface ContainerResizeControlsProps {
  /** 当前作用域节点（缩放模式与手柄方向的来源） */
  scopeNode: IntentNode;
  /** 画布世界尺寸（模式切换按钮定位） */
  worldSize: { width: number; height: number };
  /** 当前容器是否被选中（高亮手柄与切换按钮） */
  selected: boolean;
  /** 开始画布缩放手势（pointer-gestures 工厂） */
  onResizeStart: ReturnType<typeof createResizeScopeCanvasStart>;
  /** 切换三向/八向缩放模式 */
  onResizeModeToggle: (node: IntentNode) => void;
}

export function ContainerResizeControls({
  scopeNode,
  worldSize,
  selected,
  onResizeStart,
  onResizeModeToggle,
}: ContainerResizeControlsProps): ReactNode {
  return (
    <>
      <span
        className={`container-resize-layer ${selected ? "selected" : ""}`}
        aria-hidden="true"
      >
        {resizeDirectionsFor(nodeResizeMode(scopeNode)).map(
          (direction) => (
            <span
              className={`resize-handle resize-${direction}`}
              key={direction}
              onPointerDown={(event) => {
                event.stopPropagation();
                onResizeStart(direction, event);
              }}
            />
          ),
        )}
      </span>
      <button
        className={`resize-mode-toggle container-mode-toggle ${nodeResizeMode(scopeNode)} ${selected ? "selected" : ""}`}
        style={{
          left: worldSize.width - 40,
          top: worldSize.height + 8,
        }}
        aria-label={
          nodeResizeMode(scopeNode) === "simple"
            ? `将当前容器「${scopeNode.name}」切换为四边四角缩放`
            : `将当前容器「${scopeNode.name}」切换为右边、下边和右下角缩放`
        }
        title={
          nodeResizeMode(scopeNode) === "simple"
            ? "当前容器：右边、下边、右下角 · 点击切换为八向"
            : "当前容器：四边四角 · 点击切换为三向"
        }
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onResizeModeToggle(scopeNode)}
      >
        {nodeResizeMode(scopeNode) === "simple" ? "┘" : "⤢"}
      </button>
    </>
  );
}
