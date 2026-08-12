"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NodeRenderer } from "./node-renderer";
import type { ElementPluginRegistry } from "./element-runtime";
import type { CanvasNode, DefinitionEntry } from "./types";
import styles from "./editor.module.css";

type Point = { x: number; y: number };
type Props = {
  nodes: CanvasNode[];
  definitions: Map<string, DefinitionEntry>;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onValueChange: (id: string, key: string, value: string) => void;
  onExport: () => void;
  registry: ElementPluginRegistry;
};

const additive = (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => event.ctrlKey || event.metaKey || event.shiftKey;

export function NodeCanvas({ nodes, definitions, selectedIds, onSelectionChange, onValueChange, onExport, registry }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point; additive: boolean }>();
  const [menu, setMenu] = useState<Point>();

  function localPoint(event: { clientX: number; clientY: number }): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function beginBox(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    setMenu(undefined);
    setDrag({ start: point, end: point, additive: additive(event) });
  }

  function finishBox() {
    if (!drag) return;
    const left = Math.min(drag.start.x, drag.end.x), right = Math.max(drag.start.x, drag.end.x);
    const top = Math.min(drag.start.y, drag.end.y), bottom = Math.max(drag.start.y, drag.end.y);
    const isClick = right - left < 4 && bottom - top < 4;
    const hits = isClick ? [] : nodes.filter((node) => node.x < right && node.x + 250 > left && node.y < bottom && node.y + 260 > top).map((node) => node.id);
    onSelectionChange(new Set(drag.additive ? [...selectedIds, ...hits] : hits));
    setDrag(undefined);
  }

  function selectNode(event: ReactPointerEvent, id: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (additive(event)) {
      const next = new Set(selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      onSelectionChange(next);
    } else if (!selectedIds.has(id) || selectedIds.size > 1) onSelectionChange(new Set([id]));
  }

  const selectedTypes = [...new Set(nodes.filter((node) => selectedIds.has(node.id)).map((node) => node.type))];
  const validTypes = selectedTypes.filter((type) => definitions.has(type));
  return <section className={styles.canvasWrap} data-testid="node-canvas">
    <div className={styles.canvasInfo}>画布 · {nodes.length} 个节点 · {selectedIds.size} 个已选</div>
    <div ref={canvasRef} className={styles.canvas} onPointerDown={beginBox}
      onPointerMove={(event) => drag && setDrag({ ...drag, end: localPoint(event) })} onPointerUp={finishBox}
      onContextMenu={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}>
      {nodes.map((node) => <article key={node.id} data-node-id={node.id} data-node-type={node.type} className={`${styles.node} ${selectedIds.has(node.id) ? styles.selected : ""}`}
        style={{ left: node.x, top: node.y }} onPointerDown={(event) => selectNode(event, node.id)}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!selectedIds.has(node.id)) onSelectionChange(new Set([node.id])); setMenu(localPoint(event)); }}>
        <NodeRenderer node={node} definition={definitions.get(node.type)?.definition} registry={registry} onValueChange={(key, value) => onValueChange(node.id, key, value)} />
      </article>)}
      {drag && <div className={styles.selectionBox} style={{ left: Math.min(drag.start.x, drag.end.x), top: Math.min(drag.start.y, drag.end.y), width: Math.abs(drag.end.x - drag.start.x), height: Math.abs(drag.end.y - drag.start.y) }} />}
      {menu && <div className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
        <strong>可导出节点类型</strong>
        {selectedTypes.map((type) => <span key={type} className={!definitions.has(type) ? styles.invalidType : ""}>{type}{!definitions.has(type) && "（插件已卸载）"}</span>)}
        <div><button onClick={() => { onExport(); setMenu(undefined); }} disabled={!validTypes.length}>导出插件</button><button onClick={() => setMenu(undefined)}>取消</button></div>
      </div>}
    </div>
  </section>;
}
