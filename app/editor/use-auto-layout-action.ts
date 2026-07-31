"use client";

import type { CameraState, IntentDocumentV3, IntentNode } from "../runtime/model";
import { updateSurface } from "../runtime/model";
import { computeLaneAutoLayout } from "./auto-layout";

export interface AutoLayoutActionDeps {
  documentState: IntentDocumentV3;
  scopeNode: IntentNode;
  scopeWorldSize: { width: number; height: number };
  activeCameraKey: string;
  cameraRef: { current: CameraState };
  commitViewChange: (next: IntentDocumentV3) => void;
  fitScope: () => void;
}

export function useAutoLayoutAction({
  documentState,
  scopeNode,
  scopeWorldSize,
  activeCameraKey,
  cameraRef,
  commitViewChange,
  fitScope,
}: AutoLayoutActionDeps) {
  return () => {
    const { nodeLayouts, canvasLayout } = computeLaneAutoLayout(
      scopeNode,
      scopeWorldSize.width,
    );
    commitViewChange(
      updateSurface(
        documentState,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          const projection = surface.projections[activeCameraKey] ?? {
            camera: cameraRef.current,
            nodeLayouts: {},
          };
          return {
            ...surface,
            projections: {
              ...surface.projections,
              [activeCameraKey]: {
                ...projection,
                nodeLayouts: {
                  ...projection.nodeLayouts,
                  ...nodeLayouts,
                  [scopeNode.id]: canvasLayout,
                },
              },
            },
          };
        },
      ),
    );
    window.setTimeout(fitScope, 0);
  };
}
