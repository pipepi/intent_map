/** 普通节点与系统节点共用的工作区投影窗口外壳。 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import styles from "./workspace-window.module.css";
import {
  useWorkspaceWindowChromeTargets,
  WorkspaceWindowChromeContext,
} from "./workspace-window-chrome.tsx";

const directions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Direction = typeof directions[number];

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  start: WorkspaceWindowFrame;
  direction?: Direction;
  moved: boolean;
};

type WorkspaceWindowProps = {
  id: string;
  frame: WorkspaceWindowFrame;
  views: FreeLayoutWorkspaceViews;
  children: ReactNode;
  active?: boolean;
  front?: boolean;
  onFrame: (frame: WorkspaceWindowFrame) => void;
  onActivate?: () => void;
  onClose?: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function resized(
  start: WorkspaceWindowFrame,
  direction: Direction | undefined,
  dx: number,
  dy: number,
  world: FreeLayoutWorkspaceViews["world"],
) {
  // 世界左侧和顶部没有墙，窗口只受右侧、底部边界以及尺寸范围约束。
  if (!direction) {
    return {
      ...start,
      x: Math.min(start.x + dx, world.width - start.width),
      y: Math.min(start.y + dy, world.height - start.height),
    };
  }

  let { x, y, width, height } = start;
  if (direction.includes("e")) {
    width = clamp(start.width + dx, 360, Math.min(1800, world.width - x));
  }
  if (direction.includes("s")) {
    height = clamp(start.height + dy, 420, Math.min(1200, world.height - y));
  }
  if (direction.includes("w")) {
    const right = start.x + start.width;
    width = clamp(start.width - dx, 360, 1800);
    x = right - width;
  }
  if (direction.includes("n")) {
    const bottom = start.y + start.height;
    height = clamp(start.height - dy, 420, 1200);
    y = bottom - height;
  }
  return { ...start, x, y, width, height };
}

export function WorkspaceWindow({
  id,
  frame,
  views,
  children,
  active = false,
  front = false,
  onFrame,
  onActivate,
  onClose,
}: WorkspaceWindowProps) {
  const [preview, setPreview] = useState(frame);
  const chrome = useWorkspaceWindowChromeTargets();
  const gesture = useRef<Gesture | undefined>(undefined);
  const latestPreview = useRef(preview);
  const outsideRelease = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    latestPreview.current = preview;
  }, [preview]);

  useEffect(() => {
    if (!gesture.current) setPreview(frame);
  }, [frame]);

  useEffect(() => () => outsideRelease.current?.abort(), []);

  const finish = (clientX?: number, clientY?: number) => {
    const current = gesture.current;
    if (!current) return;
    const hasPoint = Number.isFinite(clientX) && Number.isFinite(clientY);
    const next = hasPoint
      ? resized(
        current.start,
        current.direction,
        (clientX! - current.startX) / views.camera.scale,
        (clientY! - current.startY) / views.camera.scale,
        views.world,
      )
      : latestPreview.current;

    gesture.current = undefined;
    outsideRelease.current?.abort();
    outsideRelease.current = undefined;
    if (current.moved) {
      latestPreview.current = next;
      setPreview(next);
      onFrame(next);
    } else {
      setPreview(frame);
    }
  };

  const begin = (event: ReactPointerEvent<HTMLElement>) => {
    const path = event.nativeEvent.composedPath() as HTMLElement[];
    const resizeTarget = path.find((item) => item?.dataset?.resizeDirection);
    const dragTarget = path.find(
      (item) => item?.dataset?.windowDrag !== undefined,
    );
    if (!resizeTarget && !dragTarget) return;
    const interactive = path.find((item) =>
      ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(item?.tagName)
    );
    const dragButton = path.find(
      (item) => item?.dataset?.windowDragButton !== undefined,
    );
    if (interactive && !resizeTarget && !dragButton) return;
    event.preventDefault();
    // 嵌套工作区中的内层窗口接管手势后，不允许外层工作区窗口一起移动。
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: preview,
      direction: resizeTarget?.dataset.resizeDirection as Direction | undefined,
      moved: false,
    };

    outsideRelease.current?.abort();
    const controller = new AbortController();
    outsideRelease.current = controller;
    const release = (native: PointerEvent) => {
      if (native.pointerId === event.pointerId) {
        finish(native.clientX, native.clientY);
      }
    };
    addEventListener("pointerup", release, {
      capture: true,
      signal: controller.signal,
    });
    addEventListener("pointercancel", release, {
      capture: true,
      signal: controller.signal,
    });
    addEventListener("blur", () => finish(), { signal: controller.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) finish();
    }, { signal: controller.signal });
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // 指针在窗口外释放时，下一次 buttons=0 的移动负责终止残留拖拽。
    if (event.buttons === 0) {
      finish(event.clientX, event.clientY);
      return;
    }
    const dx = (event.clientX - current.startX) / views.camera.scale;
    const dy = (event.clientY - current.startY) / views.camera.scale;
    if (Math.hypot(dx, dy) >= 3) current.moved = true;
    setPreview(resized(current.start, current.direction, dx, dy, views.world));
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId === event.pointerId) {
      finish(event.clientX, event.clientY);
    }
  };
  const handles = preview.resizeMode === "simple"
    ? ["e", "s", "se"] as const
    : directions;
  // 系统节点和普通节点共享同一组悬浮控制、玻璃背景和拖拽轨道。
  const windowControls = (edge: "top" | "bottom") => <div
    className={`${styles.windowSystemControls} ${
      edge === "top"
        ? styles.windowSystemControlsTop
        : styles.windowSystemControlsBottom
    }`}
    data-window-drag
    aria-label={`${edge === "top" ? "顶部" : "底部"}窗口控制与拖动区域`}
  >
    <span
      className={styles.windowExtraControls}
      ref={edge === "top" ? chrome.setTop : chrome.setBottom}
    />
    <button
      data-resize-toggle
      aria-label="切换尺寸缩放模式"
      title={preview.resizeMode === "full"
        ? "切换为三向缩放"
        : "切换为八向缩放"}
    >{preview.resizeMode === "full" ? "⤢" : "┘"}</button>
    <button data-window-close aria-label="关闭节点" title="关闭节点">×</button>
  </div>;

  return <WorkspaceWindowChromeContext.Provider value={chrome.targets}>
    <article
    className={styles.freeWindow}
    data-node-id={id}
    style={{
      left: preview.x,
      top: preview.y,
      width: preview.width,
      height: preview.height,
      zIndex: front ? 12 : 2,
    }}
    onPointerDownCapture={(event) => {
      if (active) return;
      const path = event.nativeEvent.composedPath() as HTMLElement[];
      // 控件先完成自己的 pointerdown，避免激活重渲染吞掉随后的 click。
      const interactive = path.some((item) =>
        ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"].includes(
          item?.tagName,
        ) || item?.isContentEditable
      );
      if (!interactive) onActivate?.();
    }}
    onPointerDown={begin}
    onPointerMove={move}
    onPointerUp={end}
    onPointerCancel={end}
    onLostPointerCapture={() => finish()}
    onClickCapture={(event) => {
      const path = event.nativeEvent.composedPath() as HTMLElement[];
      // click 阶段激活不会吞掉交互控件已经开始的点击，也能覆盖嵌套窗口。
      if (!active) onActivate?.();
      // 嵌套窗口的按钮只能由路径中最近的 WorkspaceWindow 处理。
      if (path.find((item) => item?.dataset?.nodeId) !== event.currentTarget) return;
      if (path.some((item) => item?.dataset?.resizeToggle !== undefined)) {
        onFrame({
          ...preview,
          resizeMode: preview.resizeMode === "simple" ? "full" : "simple",
        });
      }
      if (path.some((item) => item?.dataset?.windowClose !== undefined)) {
        onClose?.();
      }
    }}
  >
    <div className={styles.windowGlassUnderlay} aria-hidden="true" />
    {windowControls("top")}
    <i
      className={`${styles.windowDragRail} ${styles.windowDragRailLeft}`}
      data-window-drag
      aria-label="左侧拖动区域"
    />
    <i
      className={`${styles.windowDragRail} ${styles.windowDragRailRight}`}
      data-window-drag
      aria-label="右侧拖动区域"
    />
    <div className={styles.windowViewport} data-window-viewport>
      <div
        className={styles.windowContent}
        style={{ zoom: preview.contentScale ?? 1 }}
      >{children}</div>
    </div>
    {windowControls("bottom")}
    {handles.map((direction) => <i
      key={direction}
      className={styles.resizeHandle}
      data-resize-direction={direction}
      data-direction={direction}
    />)}
    </article>
  </WorkspaceWindowChromeContext.Provider>;
}
