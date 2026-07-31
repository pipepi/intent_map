"use client";

import { useCallback } from "react";

import {
  nodeDisplayMode,
  updateSurface,
  type CameraState,
  type IntentDocumentV3,
  type IntentNode,
} from "../runtime/model";
import { defaultNodeProjectionLayout } from "../runtime/projection";
import { findNode, nodeResizeMode } from "./tree-utils";

export interface CanvasProjectionActionDeps {
  activeCameraKey: string;
  cameraRef: { current: CameraState };
  appRoot: IntentNode;
  documentState: IntentDocumentV3;
  commitViewChange: (next: IntentDocumentV3) => void;
  setSelectedAppNodeId: (id: string) => void;
}

export function useCanvasProjectionActions({
  activeCameraKey,
  cameraRef,
  appRoot,
  documentState,
  commitViewChange,
  setSelectedAppNodeId,
}: CanvasProjectionActionDeps) {
  const storeNodeProjection = useCallback(
    (document: IntentDocumentV3, node: IntentNode) =>
      updateSurface(
        document,
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
                  [node.id]: defaultNodeProjectionLayout(node),
                },
              },
            },
          };
        },
      ),
    [activeCameraKey, cameraRef],
  );

  const storeScopeCanvasProjection = useCallback(
    (
      document: IntentDocumentV3,
      scope: IntentNode,
      size: { width: number; height: number },
    ) =>
      updateSurface(
        document,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          const projection = surface.projections[activeCameraKey] ?? {
            camera: cameraRef.current,
            nodeLayouts: {},
          };
          const fallback = defaultNodeProjectionLayout(scope);
          return {
            ...surface,
            projections: {
              ...surface.projections,
              [activeCameraKey]: {
                ...projection,
                nodeLayouts: {
                  ...projection.nodeLayouts,
                  [scope.id]: {
                    ...fallback,
                    frame: { x: 0, y: 0, ...size },
                  },
                },
              },
            },
          };
        },
      ),
    [activeCameraKey, cameraRef],
  );

  const updateDocumentNodeView = useCallback(
    (id: string, updater: (node: IntentNode) => IntentNode) => {
      const current = findNode(appRoot, id);
      if (!current) return;
      commitViewChange(storeNodeProjection(documentState, updater(current)));
    },
    [appRoot, commitViewChange, documentState, storeNodeProjection],
  );

  const toggleNodeResizeMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNodeView(node.id, (item) => ({
        ...item,
        resizeMode: nodeResizeMode(item) === "simple" ? "full" : "simple",
      }));
      setSelectedAppNodeId(node.id);
    },
    [setSelectedAppNodeId, updateDocumentNodeView],
  );

  const toggleNodeDisplayMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNodeView(node.id, (item) => ({
        ...item,
        displayMode:
          nodeDisplayMode(item) === "expanded" ? "minimized" : "expanded",
      }));
      setSelectedAppNodeId(node.id);
    },
    [setSelectedAppNodeId, updateDocumentNodeView],
  );

  return {
    storeNodeProjection,
    storeScopeCanvasProjection,
    updateDocumentNodeView,
    toggleNodeResizeMode,
    toggleNodeDisplayMode,
  };
}
