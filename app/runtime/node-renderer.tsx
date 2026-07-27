"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { nodeDisplayMode, type IntentNode } from "./model";
import { projectionUsesSummary } from "./projection";

const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const simpleResizeDirections = ["e", "s", "se"] as const;

export type ResizeDirection = (typeof resizeDirections)[number];
export type ResizeMode = "simple" | "full";

export const MINIMIZED_NODE_SIZE = { width: 220, height: 52 };

export const runtimeNodeRenderSize = (node: IntentNode) => {
  const expandedSize = node.size ?? { width: 320, height: 220 };
  return nodeDisplayMode(node) === "minimized"
    ? {
        width: Math.min(expandedSize.width, MINIMIZED_NODE_SIZE.width),
        height: MINIMIZED_NODE_SIZE.height,
      }
    : expandedSize;
};

export type NodeProjectionProps = {
  node: IntentNode;
  scale: number;
  selected: boolean;
  active: boolean;
  layoutLocked: boolean;
  content: ReactNode;
  actions?: ReactNode;
  embedded?: boolean;
  showResizeHandles?: boolean;
  portsExpanded?: boolean;
  surfacePortRegion?: boolean;
  onSelect: (nodeId: string) => void;
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
};

const portRows = (node: IntentNode) =>
  Math.max(node.inputs.length, node.outputs.length);

const referenceContextLabels: Record<string, string> = {
  document: "文档快照",
  scope: "目标作用域",
  selection: "选中节点",
};

export function NodeProjection({
  node,
  scale,
  selected,
  active,
  layoutLocked,
  content,
  actions,
  embedded = false,
  showResizeHandles = true,
  portsExpanded = true,
  surfacePortRegion = false,
  onSelect,
  onEnter,
  onMoveStart,
  onResizeStart,
  onResizeModeToggle,
  onDisplayModeToggle,
}: NodeProjectionProps) {
  const size = runtimeNodeRenderSize(node);
  const minimized = nodeDisplayMode(node) === "minimized";
  const alwaysLive = node.implementation?.config?.lod === "always-live";
  const businessReference =
    node.implementation?.key === "business-scope-reference";
  const summary = projectionUsesSummary(scale, { active, alwaysLive });
  const rows = portRows(node);
  const resizeMode = node.resizeMode ?? "simple";
  const visibleDirections =
    resizeMode === "full" ? resizeDirections : simpleResizeDirections;

  return (
    <article
      className={[
        "runtime-node",
        embedded ? "embedded-node-projection" : "",
        `runtime-kind-${node.kind}`,
        selected ? "selected" : "",
        active ? "active" : "",
        minimized ? "minimized" : "expanded",
        !minimized && rows > 0 ? "has-port-region" : "",
        summary ? "summary" : "live",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: embedded ? 0 : node.position.x,
        top: embedded ? 0 : node.position.y,
        width: embedded ? "100%" : size.width,
        height: embedded ? "100%" : size.height,
        gridTemplateRows:
          rows > 0
            ? `${embedded ? "auto" : "38px"} auto minmax(0, 1fr)`
            : undefined,
      }}
      data-node-id={node.id}
      title={minimized ? undefined : `双击进入「${node.name}」`}
      data-implementation={node.implementation?.key ?? ""}
      data-display-mode={minimized ? "minimized" : "expanded"}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (minimized) onDisplayModeToggle(node);
        else onEnter(node);
      }}
    >
      {minimized ? (
        <header
          className="runtime-minimized-titlebar"
          title="双击展开 · 再次双击进入节点"
          onPointerDown={(event) => {
            event.stopPropagation();
            if (!layoutLocked) onMoveStart(node, event);
          }}
        >
          <strong>{node.name}</strong>
        </header>
      ) : (
        <>
          <header
            className="runtime-node-titlebar"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (!layoutLocked) onMoveStart(node, event);
            }}
          >
            <span className="runtime-kind-chip">
              {businessReference ? "REFERENCE" : node.kind.toUpperCase()}
            </span>
            <strong>{node.name}</strong>
            <small>
              {businessReference
                ? "active business scope"
                : node.implementation?.key ?? "intent"}
            </small>
            {node.implementation?.core && <i title="核心节点">◆</i>}
            {actions && (
              <span className="node-projection-actions">{actions}</span>
            )}
            <button
              className="node-display-toggle"
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
          </header>

          {rows > 0 && (
            <div
              className={[
                "runtime-node-ports",
                surfacePortRegion ? "surface-port-region" : "",
                portsExpanded ? "expanded" : "collapsed",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="输入输出项"
              style={{
                height: portsExpanded ? rows * 26 + 16 : rows * 8 + 8,
              }}
            >
              {businessReference && (
                <small className="reference-context-heading">引用上下文</small>
              )}
              {node.inputs.map((input, index) => (
                <span
                  className={`runtime-port runtime-port-input channel-${input.channel ?? "data"}`}
                  data-port-kind="input"
                  data-port-node={node.id}
                  data-port-id={input.id}
                  style={{
                    top: portsExpanded ? 8 + index * 26 : 4 + index * 8,
                  }}
                  key={input.id}
                  title={
                    businessReference
                      ? referenceContextLabels[input.id] ?? input.name
                      : input.name
                  }
                >
                  <i />
                  <b>
                    {businessReference
                      ? referenceContextLabels[input.id] ?? input.name
                      : input.name}
                  </b>
                </span>
              ))}
              {node.outputs.map((output, index) => (
                <span
                  className={`runtime-port runtime-port-output channel-${output.channel ?? "data"}`}
                  data-port-kind="output"
                  data-port-node={node.id}
                  data-port-id={output.id}
                  style={{
                    top: portsExpanded ? 8 + index * 26 : 4 + index * 8,
                  }}
                  key={output.id}
                  title={output.name}
                >
                  <b>{output.name}</b>
                  <i />
                </span>
              ))}
            </div>
          )}

          <div className="runtime-node-body">
            {summary ? (
              <div className="runtime-lod-summary">
                <span>{node.description}</span>
                {node.implementation?.visual && (
                  <small>放大至 55% 以上查看交互面板</small>
                )}
                <small>
                  {node.inputs.length} 输入 · {node.outputs.length} 输出
                </small>
              </div>
            ) : (
              content
            )}
          </div>

          {showResizeHandles &&
            !layoutLocked &&
            visibleDirections.map((direction) => (
              <span
                className={`resize-handle resize-${direction}`}
                key={direction}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onResizeStart(node, direction, event);
                }}
              />
            ))}

          {showResizeHandles && !layoutLocked && (
            <button
              className={`resize-mode-toggle runtime-mode-toggle ${resizeMode} ${selected ? "selected" : ""}`}
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
}

export const RUNTIME_RESIZE_DIRECTIONS = resizeDirections;
export const SIMPLE_RESIZE_DIRECTIONS = simpleResizeDirections;
export const resizeDirectionsFor = (mode: ResizeMode) =>
  mode === "full" ? resizeDirections : simpleResizeDirections;

export function PortRegionToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={expanded ? "active" : ""}
      aria-pressed={expanded}
      title={expanded ? "收起输入输出项区域" : "展开输入输出项区域"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      ↕
    </button>
  );
}
