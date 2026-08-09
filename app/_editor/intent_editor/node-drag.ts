"use client";

import { useState, type PointerEvent } from "react";
import { entityKindRange, project, type PointYZ } from "./geometry";
import type { NodeId, SceneState } from "./model";

type NodeDragOptions = {
  enabled: boolean;
  state: SceneState;
  yAxisLength: number;
  zAxisLength: number;
  onMove: (id: NodeId, position: PointYZ) => void;
};

export function useNodeDrag({ enabled, state, yAxisLength, zAxisLength, onMove }: NodeDragOptions) {
  const [draggingId, setDraggingId] = useState<NodeId | null>(null);

  function beginDrag(id: NodeId, event: PointerEvent<SVGGElement>) {
    if (!enabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!enabled || !draggingId) return;
    const node = state.nodes[draggingId];
    const bounds = event.currentTarget.getBoundingClientRect();
    const screenX = ((event.clientX - bounds.left) / bounds.width) * 960;
    const screenY = ((event.clientY - bounds.top) / bounds.height) * 540;
    const origin = project({ x: 0, y: 0, z: 0 }, "quadrant", "surface", 90, yAxisLength, zAxisLength);
    const range = entityKindRange(node, state);
    const margin = (range.end - range.start) * 0.04;
    onMove(draggingId, {
      y: Math.max(range.start + margin, Math.min(range.end - margin, (origin.y - screenY) / yAxisLength)),
      z: Math.max(0, Math.min(1, (screenX - origin.x) / zAxisLength)),
    });
  }

  function endDrag() {
    setDraggingId(null);
  }

  return { draggingId, beginDrag, moveDrag, endDrag };
}
