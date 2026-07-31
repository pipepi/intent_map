"use client";

import { useRef } from "react";

import type { CameraState } from "../runtime/model";
import {
  createMoveNodeStart,
  createResizeNodeStart,
  createResizeScopeCanvasStart,
  createViewportPointerDownHandler,
  type PointerGestureDeps,
} from "./pointer-gestures";

type PointerSessionDeps = Omit<
  PointerGestureDeps,
  "touchPointersRef" | "touchGestureRef"
>;

export function useCanvasPointerGestures(deps: PointerSessionDeps) {
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<{
    startCamera: CameraState;
    startCenter: { x: number; y: number };
    startDistance?: number;
    allowSinglePan: boolean;
  } | null>(null);
  const gestureDeps: PointerGestureDeps = {
    ...deps,
    touchPointersRef,
    touchGestureRef,
  };

  /* eslint-disable react-hooks/refs -- Gesture factories only capture refs for pointer callbacks. */
  const onViewportPointerDown = createViewportPointerDownHandler(gestureDeps);
  const moveNodeStart = createMoveNodeStart(gestureDeps);
  const resizeNodeStart = createResizeNodeStart(gestureDeps);
  const resizeScopeCanvasStart = createResizeScopeCanvasStart(gestureDeps);
  /* eslint-enable react-hooks/refs */

  return {
    onViewportPointerDown,
    moveNodeStart,
    resizeNodeStart,
    resizeScopeCanvasStart,
  };
}
