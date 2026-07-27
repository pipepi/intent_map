"use client";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  nodeDisplayMode,
  type IntentNode,
  type IntentPort,
} from "./model";
import {
  resizeDirectionsFor,
  type ResizeDirection,
  type ResizeMode,
} from "./node-renderer";
import { projectionUsesSummary } from "./projection";
import {
  BUSINESS_CONTAINER_PORT_TOP,
  BUSINESS_PORT_ROW,
  BUSINESS_PORT_TOP,
  businessEdgeGeometry,
  businessNodeSize,
  deriveBusinessVisualEdges,
} from "./business-canvas";

export type PendingBusinessPipe = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type BusinessGraphProjectionProps = {
  projectionId: string;
  scope: IntentNode;
  worldSize: { width: number; height: number };
  scale: number;
  selectedNodeId?: string;
  layoutLocked: boolean;
  containerResizeMode?: ResizeMode;
  pendingPipe?: PendingBusinessPipe | null;
  onContainerMoveStart?: (
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onContainerResizeStart?: (
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => void;
  onContainerResizeModeToggle?: () => void;
  onSelect: (node: IntentNode) => void;
  onEnter: (node: IntentNode) => void;
  onMoveStart: (
    node: IntentNode,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onResizeStart: (
    node: IntentNode,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => void;
  onResizeModeToggle: (node: IntentNode) => void;
  onDisplayModeToggle: (node: IntentNode) => void;
  onDisconnectInput: (node: IntentNode, port: IntentPort) => void;
  onStartPipe: (
    node: IntentNode,
    port: IntentPort,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onAddChild: () => void;
};

const nodeResizeMode = (node: IntentNode) => node.resizeMode ?? "simple";

export function BusinessGraphProjection({
  projectionId,
  scope,
  worldSize,
  scale,
  selectedNodeId,
  layoutLocked,
  containerResizeMode,
  pendingPipe,
  onContainerMoveStart,
  onContainerResizeStart,
  onContainerResizeModeToggle,
  onSelect,
  onEnter,
  onMoveStart,
  onResizeStart,
  onResizeModeToggle,
  onDisplayModeToggle,
  onDisconnectInput,
  onStartPipe,
  onAddChild,
}: BusinessGraphProjectionProps) {
  const edges = deriveBusinessVisualEdges(scope);
  const markerPrefix = `business-arrow-${projectionId.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <>
      <section
        className="business-container-node"
        aria-label={`当前业务容器：${scope.name}`}
      >
        <header
          className="business-container-header"
          onPointerDown={onContainerMoveStart}
        >
          <span>{scope.kind.toUpperCase()}</span>
          <div>
            <strong>{scope.name}</strong>
            <small>{scope.description}</small>
          </div>
          <i aria-hidden="true" />
        </header>
        <div className="business-container-interfaces">
          <div className="business-container-inputs">
            {scope.inputs.map((port, index) => (
              <span
                key={port.id}
                style={{
                  top:
                    BUSINESS_CONTAINER_PORT_TOP + index * BUSINESS_PORT_ROW,
                }}
              >
                <i />
                {port.name}
              </span>
            ))}
          </div>
          <div className="business-container-outputs">
            {scope.outputs.map((port, index) => (
              <span
                key={port.id}
                style={{
                  top:
                    BUSINESS_CONTAINER_PORT_TOP + index * BUSINESS_PORT_ROW,
                }}
              >
                {port.name}
                <i />
              </span>
            ))}
          </div>
        </div>
        <footer>
          <span>{scope.inputs.length} in</span>
          <span>{scope.children?.length ?? 0} children</span>
          <span>{scope.outputs.length} out</span>
        </footer>
        {!layoutLocked &&
          containerResizeMode &&
          onContainerResizeStart &&
          onContainerResizeModeToggle && (
          <>
            <span className="container-resize-layer" aria-hidden="true">
              {resizeDirectionsFor(containerResizeMode).map((direction) => (
                <span
                  className={`resize-handle resize-${direction}`}
                  key={direction}
                  onPointerDown={(event) =>
                    onContainerResizeStart(direction, event)
                  }
                />
              ))}
            </span>
            <button
              className={`resize-mode-toggle container-mode-toggle business-container-mode-toggle ${containerResizeMode}`}
              title={
                containerResizeMode === "simple"
                  ? "当前容器：右边、下边和右下角 · 点击切换为八向"
                  : "当前容器：四边四角 · 点击切换为三向"
              }
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onContainerResizeModeToggle();
              }}
            >
              {containerResizeMode === "simple" ? "┘" : "⤢"}
            </button>
          </>
        )}
      </section>
      <svg
        className="business-edges"
        viewBox={`0 0 ${worldSize.width} ${worldSize.height}`}
      >
        <defs>
          {["input", "compute", "output"].map((kind) => (
            <marker
              id={`${markerPrefix}-${kind}`}
              key={kind}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          ))}
        </defs>
        {pendingPipe && (
          <line
            className="pending-pipe"
            x1={pendingPipe.from.x}
            y1={pendingPipe.from.y}
            x2={pendingPipe.to.x}
            y2={pendingPipe.to.y}
          />
        )}
        {edges.map((edge) => {
          const geometry = businessEdgeGeometry(scope, edge, worldSize);
          if (!geometry) return null;
          const { sx, sy, tx, ty } = geometry;
          const bend = Math.max(45, Math.abs(tx - sx) * 0.42);
          const edgeClass =
            edge.targetKind === "container-output"
              ? "edge-output"
              : edge.sourceKind === "environment"
                ? "edge-input"
                : "edge-compute";
          return (
            <path
              key={edge.id}
              className={`business-edge ${edgeClass} channel-${edge.channel} ${
                selectedNodeId
                  ? edge.sourceId === selectedNodeId ||
                    edge.targetId === selectedNodeId
                    ? "edge-connected"
                    : "edge-dim"
                  : ""
              }`}
              data-source-port={edge.sourcePortId}
              data-target-port={edge.targetPortId}
              d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`}
              markerEnd={`url(#${markerPrefix}-${edgeClass.slice(5)})`}
            />
          );
        })}
      </svg>
      {(scope.children ?? []).map((node) => {
        const size = businessNodeSize(node);
        const resizeMode = nodeResizeMode(node);
        const visibleDirections = resizeDirectionsFor(resizeMode);
        const selected = selectedNodeId === node.id;
        const minimized = nodeDisplayMode(node) === "minimized";
        const lodSummary = projectionUsesSummary(scale) && !minimized;
        return (
          <article
            role="button"
            tabIndex={0}
            className={`business-node ${
              minimized ? "minimized" : "expanded"
            } ${lodSummary ? "lod-summary" : ""} ${
              selected ? "selected" : ""
            }`}
            key={node.id}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: size.width,
              height: size.height,
            }}
            onClick={() => onSelect(node)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (minimized) onDisplayModeToggle(node);
              else onEnter(node);
            }}
            onPointerDown={(event) => onMoveStart(node, event)}
            data-display-mode={minimized ? "minimized" : "expanded"}
            title={minimized ? "双击展开节点" : undefined}
          >
            {minimized ? (
              <strong>{node.name}</strong>
            ) : lodSummary ? (
              <>
                <span>{node.kind.toUpperCase()}</span>
                <strong>{node.name}</strong>
                <small>
                  {node.inputs.length} 输入 · {node.outputs.length} 输出
                </small>
              </>
            ) : (
              <>
                <span>{node.kind.toUpperCase()}</span>
                <strong>{node.name}</strong>
                <button
                  className="node-display-toggle business-display-toggle"
                  aria-label={`最小化「${node.name}」`}
                  title="只显示节点名称"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDisplayModeToggle(node);
                  }}
                >
                  −
                </button>
                <div
                  className="business-node-ports"
                  style={{ top: BUSINESS_PORT_TOP }}
                >
                  {node.inputs.map((port, index) => (
                    <i
                      className={`input pipe-target ${
                        port.binding ? "bound" : ""
                      }`}
                      data-port-kind="input"
                      data-port-node={node.id}
                      data-port-id={port.id}
                      title={
                        port.binding
                          ? "双击断开此管道"
                          : "从输出端口拖线到此连接"
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (port.binding) onDisconnectInput(node, port);
                      }}
                      style={{ top: index * BUSINESS_PORT_ROW }}
                      key={port.id}
                    >
                      <span>{port.name}</span>
                    </i>
                  ))}
                  {node.outputs.map((port, index) => (
                    <i
                      className="output pipe-source"
                      data-port-kind="output"
                      data-port-node={node.id}
                      data-port-id={port.id}
                      title="拖拽到输入端口创建管道"
                      onPointerDown={(event) =>
                        onStartPipe(node, port, event)
                      }
                      style={{ top: index * BUSINESS_PORT_ROW }}
                      key={port.id}
                    >
                      <span>{port.name}</span>
                    </i>
                  ))}
                </div>
                <small
                  style={{
                    top:
                      BUSINESS_PORT_TOP +
                      Math.max(node.inputs.length, node.outputs.length) *
                        BUSINESS_PORT_ROW +
                      8,
                  }}
                >
                  {node.description}
                </small>
                {!layoutLocked &&
                  visibleDirections.map((direction) => (
                    <span
                      className={`resize-handle resize-${direction}`}
                      key={direction}
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) =>
                        onResizeStart(node, direction, event)
                      }
                    />
                  ))}
                {!layoutLocked && (
                  <button
                    className={`resize-mode-toggle business-mode-toggle ${resizeMode} ${
                      selected ? "selected" : ""
                    }`}
                    aria-label={
                      resizeMode === "simple"
                        ? `将「${node.name}」切换为四边四角缩放`
                        : `将「${node.name}」切换为右边、下边和右下角缩放`
                    }
                    title={
                      resizeMode === "simple"
                        ? "当前：右边、下边、右下角 · 点击切换为八向"
                        : "当前：四边四角 · 点击切换为三向"
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onResizeModeToggle(node);
                    }}
                  >
                    {resizeMode === "simple" ? "┘" : "⤢"}
                  </button>
                )}
              </>
            )}
          </article>
        );
      })}
      <button
        className={`business-add-child ${
          scope.children?.length ? "" : "business-empty"
        }`}
        onClick={onAddChild}
        title={`向「${scope.name}」添加子意图`}
      >
        ＋ 添加到「{scope.name}」
      </button>
    </>
  );
}
