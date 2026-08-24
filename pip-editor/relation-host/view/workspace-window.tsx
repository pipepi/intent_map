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
  if (direction.includes("e")) width = clamp(start.width + dx, 360, Math.min(1800, world.width - x));
  if (direction.includes("s")) height = clamp(start.height + dy, 420, Math.min(1200, world.height - y));
  if (direction.includes("w")) { const right = start.x + start.width; width = clamp(start.width - dx, 360, 1800); x = right - width; }
  if (direction.includes("n")) { const bottom = start.y + start.height; height = clamp(start.height - dy, 420, 1200); y = bottom - height; }
  return { ...start, x, y, width, height };
}

export function WorkspaceWindow({ id, frame, views, children, system = false, active = false, front = false, onFrame, onActivate, onClose }: {
  id: string; frame: WorkspaceWindowFrame; views: FreeLayoutWorkspaceViews; children: ReactNode; system?: boolean;
  active?: boolean; front?: boolean; onFrame: (frame: WorkspaceWindowFrame) => void; onActivate?: () => void; onClose?: () => void;
}) {
  const [preview, setPreview] = useState(frame), gesture = useRef<Gesture | undefined>(undefined);
  const latestPreview = useRef(preview), outsideRelease = useRef<AbortController | undefined>(undefined);
  useEffect(() => { latestPreview.current = preview; }, [preview]);
  useEffect(() => { if (!gesture.current) setPreview(frame); }, [frame]);
  useEffect(() => () => outsideRelease.current?.abort(), []);
  const finish = (clientX?: number, clientY?: number) => {
    const current = gesture.current; if (!current) return;
    const hasPoint = Number.isFinite(clientX) && Number.isFinite(clientY);
    const next = hasPoint ? resized(current.start, current.direction,
      (clientX! - current.startX) / views.camera.scale, (clientY! - current.startY) / views.camera.scale, views.world) : latestPreview.current;
    gesture.current = undefined; outsideRelease.current?.abort(); outsideRelease.current = undefined;
    if (current.moved) { latestPreview.current = next; setPreview(next); onFrame(next); } else setPreview(frame);
  };
  const begin = (event: ReactPointerEvent<HTMLElement>) => {
    const path = event.nativeEvent.composedPath() as HTMLElement[];
    const resizeTarget = path.find((item) => item?.dataset?.resizeDirection);
    const dragTarget = path.find((item) => item?.dataset?.windowDrag !== undefined);
    if (!resizeTarget && !dragTarget) return;
    const interactive = path.find((item) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(item?.tagName));
    if (interactive && !resizeTarget) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: preview, direction: resizeTarget?.dataset.resizeDirection as Direction | undefined, moved: false };
    outsideRelease.current?.abort(); const controller = new AbortController(); outsideRelease.current = controller;
    const release = (native: PointerEvent) => { if (native.pointerId === event.pointerId) finish(native.clientX, native.clientY); };
    addEventListener("pointerup", release, { capture: true, signal: controller.signal });
    addEventListener("pointercancel", release, { capture: true, signal: controller.signal });
    addEventListener("blur", () => finish(), { signal: controller.signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) finish(); }, { signal: controller.signal });
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    // Pointer-up can happen outside the browser surface. The next hover event
    // reports no pressed buttons and must terminate the stale captured drag.
    if (event.buttons === 0) { finish(event.clientX, event.clientY); return; }
    const dx = (event.clientX - current.startX) / views.camera.scale, dy = (event.clientY - current.startY) / views.camera.scale;
    if (Math.hypot(dx, dy) >= 3) current.moved = true;
    setPreview(resized(current.start, current.direction, dx, dy, views.world));
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => { if (gesture.current?.pointerId === event.pointerId) finish(event.clientX, event.clientY); };
  const handles = preview.resizeMode === "simple" ? ["e", "s", "se"] : directions;
  return <article className={`${styles.freeWindow} ${system ? styles.systemWindow : ""}`} data-node-id={id}
    style={{ left: preview.x, top: preview.y, width: preview.width, height: preview.height, zIndex: front ? 12 : system ? 8 : 2 }}
    onPointerDownCapture={() => { if (!active) onActivate?.(); }}
    onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onLostPointerCapture={() => finish()}
    onClickCapture={(event) => {
      const path = event.nativeEvent.composedPath() as HTMLElement[];
      if (path.some((item) => item?.dataset?.resizeToggle !== undefined)) onFrame({ ...preview, resizeMode: preview.resizeMode === "simple" ? "full" : "simple" });
      if (path.some((item) => item?.dataset?.windowClose !== undefined)) onClose?.();
    }}>
    <div className={styles.windowViewport} data-window-viewport><div className={styles.windowContent} style={{ zoom: preview.contentScale ?? 1 }}>{children}</div></div>
    {handles.map((direction) => <i key={direction} className={styles.resizeHandle} data-resize-direction={direction} data-direction={direction} />)}
  </article>;
}
