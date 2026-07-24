"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { IntentNode } from "./model";

const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type ResizeDirection = (typeof resizeDirections)[number];

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
};

const portRows = (node: IntentNode) =>
  Math.max(node.inputs.length, node.outputs.length);

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
}: NodeRendererProps) {
  const size = node.size ?? { width: 320, height: 220 };
  const alwaysLive = node.implementation?.config?.lod === "always-live";
  const summary = scale < 0.75 && !active && !alwaysLive;
  const rows = portRows(node);
  return (
    <article
      className={[
        "runtime-node",
        `runtime-kind-${node.kind}`,
        selected ? "selected" : "",
        active ? "active" : "",
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
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={() => onEnter(node)}
    >
      <header
        className="runtime-node-titlebar"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!layoutLocked) onMoveStart(node, event);
        }}
      >
        <span className="runtime-kind-chip">{node.kind.toUpperCase()}</span>
        <strong>{node.name}</strong>
        <small>{node.implementation?.key ?? "intent"}</small>
        {node.implementation?.core && <i title="核心节点">◆</i>}
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
          {node.inputs.map((input, index) => (
            <span
              className={`runtime-port runtime-port-input channel-${input.channel ?? "data"}`}
              style={{ top: 54 + index * 26 }}
              key={input.id}
              title={input.name}
            >
              <i />
              <b>{input.name}</b>
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
        resizeDirections.map((direction) => (
          <span
            className={`runtime-resize runtime-resize-${direction}`}
            key={direction}
            onPointerDown={(event) => {
              event.stopPropagation();
              onResizeStart(node, direction, event);
            }}
          />
        ))}
    </article>
  );
}

export const RUNTIME_RESIZE_DIRECTIONS = resizeDirections;
