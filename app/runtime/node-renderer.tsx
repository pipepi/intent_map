"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { nodeDisplayMode, type IntentNode } from "./model";

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

export type NodeRendererProps = {
  node: IntentNode;
  scale: number;
  selected: boolean;
  active: boolean;
  layoutLocked: boolean;
  content: ReactNode;
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

export function NodeRenderer({
  node,
  scale,
  selected,
  active,
  layoutLocked,
  content,
  onSelect,
  onEnter,
  onMoveStart,
  onResizeStart,
  onResizeModeToggle,
  onDisplayModeToggle,
}: NodeRendererProps) {
  const size = runtimeNodeRenderSize(node);
  const minimized = nodeDisplayMode(node) === "minimized";
  const alwaysLive = node.implementation?.config?.lod === "always-live";
  const businessReference =
    node.implementation?.key === "business-scope-reference";
  const summary = scale < 0.75 && !active && !alwaysLive;
  const rows = portRows(node);
  const resizeMode = node.resizeMode ?? "simple";
  const visibleDirections =
    resizeMode === "full" ? resizeDirections : simpleResizeDirections;

  return (
    <article
      className={[
        "runtime-node",
        `runtime-kind-${node.kind}`,
        selected ? "selected" : "",
        active ? "active" : "",
        minimized ? "minimized" : "expanded",
        summary ? "summary" : "live",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: size.width,
        height: size.height,
      }}
      data-node-id={node.id}
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
          title="双击展开节点"
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

          <div className="runtime-node-body">
            {summary ? (
              <div className="runtime-lod-summary">
                <span>{node.description}</span>
                <small>
                  {node.inputs.length} 输入 · {node.outputs.length} 输出
                </small>
              </div>
            ) : (
              content
            )}
          </div>

          {rows > 0 && (
            <div className="runtime-node-ports" aria-hidden="true">
              {businessReference && (
                <small className="reference-context-heading">引用上下文</small>
              )}
              {node.inputs.map((input, index) => (
                <span
                  className={`runtime-port runtime-port-input channel-${input.channel ?? "data"}`}
                  style={{ top: 54 + index * 26 }}
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
                  style={{ top: 54 + index * 26 }}
                  key={output.id}
                  title={output.name}
                >
                  <b>{output.name}</b>
                  <i />
                </span>
              ))}
            </div>
          )}

          {!layoutLocked &&
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

          {!layoutLocked && (
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
