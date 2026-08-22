import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import styles from "./relation-host.module.css";

const directions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Direction = typeof directions[number];
type Gesture = { pointerId: number; startX: number; startY: number; start: WorkspaceWindowFrame; direction?: Direction; moved: boolean };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function resized(start: WorkspaceWindowFrame, direction: Direction | undefined, dx: number, dy: number, world: FreeLayoutWorkspaceViews["world"]) {
  // The world has no left/top wall; only its right/bottom extent constrains window movement.
  if (!direction) return { ...start, x: Math.min(start.x + dx, world.width - start.width), y: Math.min(start.y + dy, world.height - start.height) };
  let { x, y, width, height } = start;
  if (direction.includes("e")) width = clamp(start.width + dx, 560, Math.min(1800, world.width - x));
  if (direction.includes("s")) height = clamp(start.height + dy, 420, Math.min(1200, world.height - y));
  if (direction.includes("w")) { const right = start.x + start.width; width = clamp(start.width - dx, 560, 1800); x = right - width; }
  if (direction.includes("n")) { const bottom = start.y + start.height; height = clamp(start.height - dy, 420, 1200); y = bottom - height; }
  return { ...start, x, y, width, height };
}

export function WorkspaceWindow({ id, frame, views, children, system = false, active = false, front = false, onFrame, onActivate, onClose }: {
  id: string; frame: WorkspaceWindowFrame; views: FreeLayoutWorkspaceViews; children: ReactNode; system?: boolean;
  active?: boolean; front?: boolean; onFrame: (frame: WorkspaceWindowFrame) => void; onActivate?: () => void; onClose?: () => void;
}) {
  const [preview, setPreview] = useState(frame), gesture = useRef<Gesture | undefined>(undefined);
  useEffect(() => { if (!gesture.current) setPreview(frame); }, [frame]);
  const begin = (event: ReactPointerEvent<HTMLElement>) => {
    const path = event.nativeEvent.composedPath() as HTMLElement[];
    const resizeTarget = path.find((item) => item?.dataset?.resizeDirection);
    const dragTarget = path.find((item) => item?.dataset?.windowDrag !== undefined);
    if (!resizeTarget && !dragTarget) return;
    const interactive = path.find((item) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(item?.tagName));
    if (interactive && !resizeTarget) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: preview, direction: resizeTarget?.dataset.resizeDirection as Direction | undefined, moved: false };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    const dx = (event.clientX - current.startX) / views.camera.scale, dy = (event.clientY - current.startY) / views.camera.scale;
    if (Math.hypot(dx, dy) >= 3) current.moved = true;
    setPreview(resized(current.start, current.direction, dx, dy, views.world));
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    const dx = (event.clientX - current.startX) / views.camera.scale, dy = (event.clientY - current.startY) / views.camera.scale;
    const next = resized(current.start, current.direction, dx, dy, views.world);
    gesture.current = undefined; if (current.moved) { setPreview(next); onFrame(next); } else setPreview(frame);
  };
  const handles = preview.resizeMode === "simple" ? ["e", "s", "se"] : directions;
  return <article className={`${styles.freeWindow} ${system ? styles.systemWindow : ""}`} data-node-id={id}
    style={{ left: preview.x, top: preview.y, width: preview.width, height: preview.height, zIndex: front ? 12 : system ? 8 : 2 }}
    onPointerDownCapture={() => { if (!active) onActivate?.(); }}
    onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = undefined; setPreview(frame); }}
    onClickCapture={(event) => {
      const path = event.nativeEvent.composedPath() as HTMLElement[];
      if (path.some((item) => item?.dataset?.resizeToggle !== undefined)) onFrame({ ...preview, resizeMode: preview.resizeMode === "simple" ? "full" : "simple" });
      if (path.some((item) => item?.dataset?.windowClose !== undefined)) onClose?.();
    }}>
    <div className={styles.windowViewport} data-window-viewport><div className={styles.windowContent} style={{ zoom: preview.contentScale ?? 1 }}>{children}</div></div>
    {handles.map((direction) => <i key={direction} className={styles.resizeHandle} data-resize-direction={direction} data-direction={direction} />)}
  </article>;
}
