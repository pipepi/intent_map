/** 管理自由布局画布上的鼠标拖拽、连线与双指缩放手势。 */
import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { RelationRef } from "../../relation/index.ts";
import type {
  WorkspacePoint,
  WorkspaceWindowFrame,
} from "../contracts/package-types.ts";
import {
  screenToWorld,
  type FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";

export type CreatorPosition = {
  screen: WorkspacePoint;
  world: WorkspacePoint;
  origin?: RelationRef;
  frame?: WorkspaceWindowFrame;
};

export type CreationWire = {
  from: WorkspacePoint;
  to: WorkspacePoint;
};

type Gesture = {
  kind: "pan" | "wire";
  pointerId: number;
  start: WorkspacePoint;
  camera: FreeLayoutWorkspaceViews["camera"];
  moved: boolean;
  origin?: RelationRef;
};

type PointerOptions = {
  free: boolean;
  persistCamera: (camera: FreeLayoutWorkspaceViews["camera"]) => void;
  previewCamera?: FreeLayoutWorkspaceViews["camera"];
  setCreator: (creator: CreatorPosition | undefined) => void;
  setPreviewCamera: (
    camera: FreeLayoutWorkspaceViews["camera"] | undefined,
  ) => void;
  setWire: (wire: CreationWire | undefined) => void;
  viewport: RefObject<HTMLDivElement | null>;
  views: FreeLayoutWorkspaceViews;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
};

const pointIn = (
  element: HTMLElement,
  clientX: number,
  clientY: number,
): WorkspacePoint => {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

const blocksCanvasGesture = (element: HTMLElement) =>
  ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(element?.tagName);

export function useWorkspaceCanvasPointer({
  free,
  onViewsChange,
  persistCamera,
  previewCamera,
  setCreator,
  setPreviewCamera,
  setWire,
  viewport,
  views,
}: PointerOptions) {
  const gesture = useRef<Gesture | undefined>(undefined);
  const touches = useRef(new Map<number, WorkspacePoint>());
  const pinch = useRef<{
    distance: number;
    world: WorkspacePoint;
    camera: FreeLayoutWorkspaceViews["camera"];
  } | undefined>(undefined);

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!free || (event.button !== 0 && event.button !== 1)) return;

    const path = event.nativeEvent.composedPath() as HTMLElement[];
    const port = path.find((item) => item?.dataset?.relationOriginNode);
    const element = viewport.current!;
    const start = pointIn(element, event.clientX, event.clientY);

    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, start);
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        const center = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
        // 第二根手指按下后，投影内部的触摸也交由画布处理。
        pinch.current = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          world: screenToWorld(center, views),
          camera: views.camera,
        };
        gesture.current = undefined;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        return;
      }

      // 单指仍可操作和滚动投影内部的应用界面。
      if (
        path.some(
          (item) => blocksCanvasGesture(item) || item?.dataset?.nodeId,
        )
      ) return;
    }

    if (path.some(blocksCanvasGesture)) return;
    if (!port && path.some((item) => item?.dataset?.nodeId)) return;

    element.focus({ preventScroll: true });
    const origin = port
      ? {
        nodeId: port.dataset.relationOriginNode!,
        relationId: port.dataset.relationOriginRelation ?? "identity",
      }
      : undefined;
    const kind = origin || (event.altKey && event.button === 0)
      ? "wire"
      : "pan";

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    if (!pinch.current) {
      gesture.current = {
        kind,
        pointerId: event.pointerId,
        start,
        camera: views.camera,
        moved: false,
        origin,
      };
    }
    if (kind === "wire") setWire({ from: start, to: start });
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointIn(viewport.current!, event.clientX, event.clientY);
    if (
      event.pointerType === "touch" &&
      touches.current.has(event.pointerId)
    ) {
      touches.current.set(event.pointerId, point);
    }

    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      const center = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
      const scale = Math.max(
        .5,
        Math.min(
          2,
          pinch.current.camera.scale *
            Math.hypot(a.x - b.x, a.y - b.y) /
            pinch.current.distance,
        ),
      );
      setPreviewCamera({
        scale,
        x: center.x - pinch.current.world.x * scale,
        y: center.y - pinch.current.world.y * scale,
      });
      return;
    }

    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (Math.hypot(dx, dy) >= 4) current.moved = true;

    if (current.kind === "wire") {
      setWire({ from: current.start, to: point });
    } else {
      setPreviewCamera({
        ...current.camera,
        x: current.camera.x + dx,
        y: current.camera.y + dy,
      });
    }
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      touches.current.delete(event.pointerId);
    }
    if (pinch.current) {
      if (touches.current.size < 2) {
        pinch.current = undefined;
        if (previewCamera) persistCamera(previewCamera);
      }
      return;
    }

    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const screen = pointIn(
      viewport.current!,
      event.clientX,
      event.clientY,
    );
    gesture.current = undefined;

    if (current.kind === "pan") {
      onViewsChange({ ...views, activeWindowId: undefined });
      setPreviewCamera(undefined);
    } else {
      setWire(undefined);
      if (current.moved) {
        setCreator({
          screen,
          world: screenToWorld(screen, views),
          origin: current.origin,
        });
      }
    }
  };

  const cancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      touches.current.delete(event.pointerId);
    }
    if (pinch.current && touches.current.size < 2) {
      pinch.current = undefined;
      if (previewCamera) persistCamera(previewCamera);
    }
    gesture.current = undefined;
    setWire(undefined);
  };

  return { begin, cancel, end, move };
}
