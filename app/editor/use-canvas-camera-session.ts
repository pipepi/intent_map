"use client";

import { useEffect, useRef, useState } from "react";

import { getContainerSurface, type CameraState, type IntentDocumentV3, type IntentNode } from "../runtime/model";
import { MAX_SCALE, MIN_SCALE } from "./constants";
import { createScopeCameraOps } from "./scope-camera";

export interface CanvasCameraSessionDeps {
  documentState: IntentDocumentV3;
  updateDocument: (updater: (active: IntentDocumentV3) => IntentDocumentV3) => void;
  activeCameraKey: string;
  scopeWorldSize: { width: number; height: number };
  isBusinessScope: boolean;
  visibleNodes: IntentNode[];
  scopeNode: IntentNode;
  scopeMinimized: boolean;
}

export function useCanvasCameraSession({
  documentState,
  updateDocument,
  activeCameraKey,
  scopeWorldSize,
  isBusinessScope,
  visibleNodes,
  scopeNode,
  scopeMinimized,
}: CanvasCameraSessionDeps) {
  const [camera, setCamera] = useState<CameraState>({ scale: 0.5, x: 12, y: 12 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  const lastEnterAtRef = useRef(0);
  const fitOnNextScopeRef = useRef(false);
  const resetScaleOnNextScopeRef = useRef(false);

  /* eslint-disable react-hooks/refs -- The factory only captures refs for later event/effect callbacks. */
  const cameraOps = createScopeCameraOps({
    viewportRef,
    cameraRef,
    setCamera,
    setDocumentState: updateDocument,
    activeCameraKey,
    scopeWorldSize,
    isBusinessScope,
    visibleNodes,
    scopeNode,
  });
  /* eslint-enable react-hooks/refs */
  const {
    setScopeCamera,
    cameraKeepsScopeVisible,
    fitScope,
    centerScopeAtScale,
  } = cameraOps;

  useEffect(() => {
    const saved = getContainerSurface(
      documentState,
      "panel-free-layout",
      "free-layout-container",
    )?.projections[activeCameraKey]?.camera;
    const frame = window.requestAnimationFrame(() => {
      if (resetScaleOnNextScopeRef.current) {
        resetScaleOnNextScopeRef.current = false;
        fitOnNextScopeRef.current = false;
        const centered = centerScopeAtScale(1);
        if (centered) setScopeCamera(centered, true);
      } else if (fitOnNextScopeRef.current) {
        fitOnNextScopeRef.current = false;
        fitScope();
      } else if (saved && cameraKeepsScopeVisible(saved)) {
        setScopeCamera({
          scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, saved.scale)),
          x: saved.x,
          y: saved.y,
        });
      } else {
        fitScope();
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // Scope identity is the intentional trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCameraKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitScope);
    return () => window.cancelAnimationFrame(frame);
    // Display-mode changes intentionally refit the same scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMinimized]);

  return {
    camera,
    viewportRef,
    cameraRef,
    lastEnterAtRef,
    fitOnNextScopeRef,
    resetScaleOnNextScopeRef,
    setScopeCamera,
    fitScope,
    centerScopeAtScale,
  };
}
