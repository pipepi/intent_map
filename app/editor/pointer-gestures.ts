// ============================================================================
// 画布指针交互手势（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 四个手势处理函数：视口平移（鼠标/触屏）、应用节点拖拽、应用节点缩放、
// 作用域画布缩放。原实现是 Home 组件内的闭包；拆出后通过 PointerGestureDeps
// 显式传入依赖，page.tsx 每次渲染组装 deps 并调用工厂创建处理器。
// ref 一律用结构化类型 { current: T } 声明，避免与 React 版本的
// RefObject/MutableRefObject 定义耦合。
// ============================================================================

import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CameraState,
  IntentDocumentV3,
  IntentNode,
  JsonValue,
} from "../runtime/model";
import { cameraForTouchGesture } from "../runtime/camera";
import {
  runtimeNodeRenderSize,
  type ResizeDirection,
} from "../runtime/node-renderer";
import { businessNodeSize } from "../runtime/business-canvas";
import {
  MAX_SCALE,
  MIN_SCALE,
  NODE_MAX_SIZE,
  NODE_MIN_SIZE,
  ROOT_CANVAS_MAX_SIZE,
  ROOT_CANVAS_MIN_SIZE,
  ROOT_CANVAS_PADDING,
} from "./constants";
import { nodeSize } from "./tree-utils";

/** 一次触摸手势的起始快照（与 page.tsx 中 touchGestureRef 的结构一致）。 */
export type TouchGestureSnapshot = {
  startCamera: CameraState;
  startCenter: { x: number; y: number };
  startDistance?: number;
  allowSinglePan: boolean;
};

/** 四个手势工厂共享的依赖（原 Home 组件闭包捕获的状态/refs/动作）。 */
export type PointerGestureDeps = {
  // ---- refs（结构化声明）----
  viewportRef: { current: HTMLDivElement | null };
  cameraRef: { current: CameraState };
  touchPointersRef: { current: Map<number, { x: number; y: number }> };
  touchGestureRef: { current: TouchGestureSnapshot | null };
  // ---- 当前作用域状态 ----
  layoutLocked: boolean;
  isBusinessScope: boolean;
  scopeNode: IntentNode;
  scopeWorldSize: { width: number; height: number };
  visibleNodes: IntentNode[];
  // ---- 文档与历史 ----
  documentState: IntentDocumentV3;
  /** 函数式直写（不进撤销历史、不标脏）：手势过程中的逐步改写 */
  updateDocument: (updater: (active: IntentDocumentV3) => IntentDocumentV3) => void;
  /** 撤销检查点（pointerup 时把拖拽前文档压栈，见 use-document-history） */
  checkpoint: () => void;
  // ---- 动作 ----
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, JsonValue>,
  ) => void;
  setScopeCamera: (next: CameraState, persist?: boolean) => void;
  storeNodeProjection: (
    document: IntentDocumentV3,
    node: IntentNode,
  ) => IntentDocumentV3;
  storeScopeCanvasProjection: (
    document: IntentDocumentV3,
    scope: IntentNode,
    size: { width: number; height: number },
  ) => IntentDocumentV3;
};

/**
 * 视口指针按下：启动画布平移手势。三种情况：
 *   - 落在交互控件/面板/导航条上 → 不启动平移（否则 setPointerCapture
 *     会把后续 click 重定向到视口，吞掉面板内的点击）；
 *   - 触屏 → 单指平移（节点上按住不平移，留给节点拖拽）+ 双指捏合缩放；
 *   - 鼠标 → 按住空白处拖动平移。
 * 松开后把最终相机持久化（persist=true）。
 */
export const createViewportPointerDownHandler =
  (deps: PointerGestureDeps) =>
  (event: ReactPointerEvent<HTMLDivElement>) => {
    const { cameraRef, touchPointersRef, touchGestureRef, setScopeCamera } =
      deps;
    if (event.button !== 0) return;
    // 交互控件与功能面板优先响应自身事件；平移手势只在空白画布上启动，
    // 否则 setPointerCapture 会把 click 重定向到视口，吞掉面板内的鼠标点击。
    const panOrigin = event.target as HTMLElement;
    if (
      panOrigin.closest(
        "button, input, select, textarea, a, option, [contenteditable], .focused-runtime-content, .scope-navigation-bar"
      )
    )
      return;
    if (event.pointerType === "touch") {
      event.preventDefault();
      const target = event.currentTarget;
      const points = touchPointersRef.current;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const allowSinglePan = !panOrigin.closest(
        ".runtime-node, .business-node, .graph-node",
      );
      if (points.size > 1) event.stopPropagation();
      const measureTouch = () => {
        const active = [...points.values()];
        const rect = target.getBoundingClientRect();
        const clientCenter = {
          x: active.reduce((sum, point) => sum + point.x, 0) / active.length,
          y: active.reduce((sum, point) => sum + point.y, 0) / active.length,
        };
        return {
          center: {
            x: clientCenter.x - rect.left,
            y: clientCenter.y - rect.top,
          },
          distance:
            active.length > 1
              ? Math.hypot(
                  active[0].x - active[1].x,
                  active[0].y - active[1].y,
                )
              : undefined,
        };
      };
      const startTouch = measureTouch();
      touchGestureRef.current = {
        startCamera: { ...cameraRef.current },
        startCenter: startTouch.center,
        startDistance: startTouch.distance,
        allowSinglePan,
      };
      target.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        points.set(moveEvent.pointerId, {
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        const gesture = touchGestureRef.current;
        if (!gesture || points.size === 0) return;
        if (points.size === 1 && !gesture.allowSinglePan) return;
        if (points.size > 1) {
          moveEvent.preventDefault();
          moveEvent.stopPropagation();
        }
        const currentTouch = measureTouch();
        setScopeCamera(
          cameraForTouchGesture(
            gesture.startCamera,
            gesture.startCenter,
            currentTouch.center,
            gesture.startDistance,
            currentTouch.distance,
            MIN_SCALE,
            MAX_SCALE,
          ),
        );
      };
      const finish = (finishEvent: PointerEvent) => {
        if (finishEvent.pointerId !== event.pointerId) return;
        const wasPinching = points.size > 1;
        if (wasPinching) {
          finishEvent.preventDefault();
          finishEvent.stopPropagation();
        }
        points.delete(finishEvent.pointerId);
        target.removeEventListener("pointermove", move, true);
        target.removeEventListener("pointerup", finish, true);
        target.removeEventListener("pointercancel", finish, true);
        if (points.size > 0) {
          const nextTouch = measureTouch();
          touchGestureRef.current = {
            startCamera: { ...cameraRef.current },
            startCenter: nextTouch.center,
            startDistance: nextTouch.distance,
            allowSinglePan: false,
          };
        } else {
          touchGestureRef.current = null;
          setScopeCamera(cameraRef.current, true);
        }
      };
      target.addEventListener("pointermove", move, true);
      target.addEventListener("pointerup", finish, true);
      target.addEventListener("pointercancel", finish, true);
      return;
    }
    const start = { x: event.clientX, y: event.clientY };
    const startCamera = { ...cameraRef.current };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      setScopeCamera({
        ...startCamera,
        x: startCamera.x + moveEvent.clientX - start.x,
        y: startCamera.y + moveEvent.clientY - start.y,
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setScopeCamera(cameraRef.current, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

/**
 * 应用节点拖拽移动（layoutLocked 或非左键直接忽略）：
 * 拖动过程中实时写投影（视图级，不进历史），位置被夹在画布边界内
 * （距边 20px、顶部留出 56px 标题栏）；松开时若确实移动过才进历史/标脏。
 */
export const createMoveNodeStart =
  (deps: PointerGestureDeps) =>
  (node: IntentNode, event: ReactPointerEvent<HTMLElement>) => {
    const {
      layoutLocked,
      scopeNode,
      cameraRef,
      updateDocument,
      checkpoint,
      dispatchRuntimeEvent,
      storeNodeProjection,
    } = deps;
    if (layoutLocked || event.button !== 0) return;
    const start = { ...node.position };
    const size = runtimeNodeRenderSize(node);
    const bounds = scopeNode.canvasSize ?? { width: 2400, height: 1500 };
    const origin = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest = start;
    const move = (moveEvent: PointerEvent) => {
      latest = {
        x: Math.max(20, Math.min(bounds.width - size.width - 20, start.x + (moveEvent.clientX - origin.x) / cameraRef.current.scale)),
        y: Math.max(56, Math.min(bounds.height - size.height - 20, start.y + (moveEvent.clientY - origin.y) / cameraRef.current.scale)),
      };
      updateDocument((active) =>
        storeNodeProjection(active, { ...node, position: latest }),
      );
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (latest.x === start.x && latest.y === start.y) return;
      checkpoint();
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "node-move");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

/**
 * 应用节点缩放：按方向（e/s/w/n 组合）调整宽高，w/n 方向同时反向补偿位置
 * 保持对角固定；尺寸夹在 NODE_MIN/MAX_SIZE 与画布边界之间。
 * 位移超过 3px 才算拖动（防止误触进历史）。
 */
export const createResizeNodeStart =
  (deps: PointerGestureDeps) =>
  (
    node: IntentNode,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const {
      layoutLocked,
      scopeNode,
      cameraRef,
      updateDocument,
      checkpoint,
      dispatchRuntimeEvent,
      storeNodeProjection,
    } = deps;
    if (layoutLocked || event.button !== 0) return;
    const startSize = nodeSize(node);
    let dragged = false;
    const startPosition = { ...node.position };
    const bounds = scopeNode.canvasSize ?? { width: 2400, height: 1500 };
    const origin = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - origin.x) + Math.abs(moveEvent.clientY - origin.y) > 3) dragged = true;
      const dx = (moveEvent.clientX - origin.x) / cameraRef.current.scale;
      const dy = (moveEvent.clientY - origin.y) / cameraRef.current.scale;
      let x = startPosition.x;
      let y = startPosition.y;
      let width = startSize.width;
      let height = startSize.height;
      if (direction.includes("e")) width = Math.max(NODE_MIN_SIZE.width, Math.min(NODE_MAX_SIZE.width, bounds.width - startPosition.x - 20, startSize.width + dx));
      if (direction.includes("s")) height = Math.max(NODE_MIN_SIZE.height, Math.min(NODE_MAX_SIZE.height, bounds.height - startPosition.y - 20, startSize.height + dy));
      if (direction.includes("w")) {
        width = Math.max(NODE_MIN_SIZE.width, Math.min(NODE_MAX_SIZE.width, startSize.width - dx));
        x = Math.max(20, startPosition.x + startSize.width - width);
        width = startPosition.x + startSize.width - x;
      }
      if (direction.includes("n")) {
        height = Math.max(NODE_MIN_SIZE.height, Math.min(NODE_MAX_SIZE.height, startSize.height - dy));
        y = Math.max(56, startPosition.y + startSize.height - height);
        height = startPosition.y + startSize.height - y;
      }
      updateDocument((active) =>
        storeNodeProjection(active, {
          ...node,
          position: { x, y },
          size: { width, height },
        }),
      );
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (!dragged) return;
      checkpoint();
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "node-resize");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

/**
 * 作用域画布（容器本身）缩放：
 * 下限 = 所有子节点包围盒 + 留白（内容装不下时不允许再缩小），
 * 上限 = ROOT_CANVAS_MAX_SIZE；从 w/n 方向缩放时同步平移相机，
 * 让画布右/下边缘在屏幕上保持不动（视觉上从对应边拉伸）。
 */
export const createResizeScopeCanvasStart =
  (deps: PointerGestureDeps) =>
  (direction: ResizeDirection, event: ReactPointerEvent<HTMLSpanElement>) => {
    const {
      layoutLocked,
      isBusinessScope,
      scopeNode,
      scopeWorldSize,
      visibleNodes,
      cameraRef,
      updateDocument,
      checkpoint,
      dispatchRuntimeEvent,
      setScopeCamera,
      storeScopeCanvasProjection,
    } = deps;
    if (layoutLocked || event.button !== 0) return;
    const startSize = scopeWorldSize;
    const startCamera = { ...cameraRef.current };
    const origin = { x: event.clientX, y: event.clientY };
    const contentMinimum = visibleNodes.reduce(
      (minimum, node) => {
        const size = isBusinessScope
          ? businessNodeSize(node)
          : runtimeNodeRenderSize(node);
        return {
          width: Math.max(
            minimum.width,
            node.position.x + size.width + ROOT_CANVAS_PADDING,
          ),
          height: Math.max(
            minimum.height,
            node.position.y + size.height + ROOT_CANVAS_PADDING,
          ),
        };
      },
      ROOT_CANVAS_MIN_SIZE,
    );
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dx =
        (moveEvent.clientX - origin.x) / cameraRef.current.scale;
      const dy =
        (moveEvent.clientY - origin.y) / cameraRef.current.scale;
      let width = startSize.width;
      let height = startSize.height;

      if (direction.includes("e")) {
        width = Math.max(
          contentMinimum.width,
          Math.min(ROOT_CANVAS_MAX_SIZE.width, startSize.width + dx),
        );
      }
      if (direction.includes("s")) {
        height = Math.max(
          contentMinimum.height,
          Math.min(ROOT_CANVAS_MAX_SIZE.height, startSize.height + dy),
        );
      }
      if (direction.includes("w")) {
        width = Math.max(
          contentMinimum.width,
          Math.min(ROOT_CANVAS_MAX_SIZE.width, startSize.width - dx),
        );
      }
      if (direction.includes("n")) {
        height = Math.max(
          contentMinimum.height,
          Math.min(ROOT_CANVAS_MAX_SIZE.height, startSize.height - dy),
        );
      }

      updateDocument((active) =>
        storeScopeCanvasProjection(active, scopeNode, { width, height }),
      );
      setScopeCamera({
        ...startCamera,
        x: direction.includes("w")
          ? startCamera.x + (startSize.width - width) * startCamera.scale
          : startCamera.x,
        y: direction.includes("n")
          ? startCamera.y + (startSize.height - height) * startCamera.scale
          : startCamera.y,
      });
    };

    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      checkpoint();
      setScopeCamera(cameraRef.current, true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "scope-canvas-resize");
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
