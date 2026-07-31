"use client";

import type { ComponentProps } from "react";

import type { IntentNode } from "../runtime/model";
import type { AggregatedEdge, ScopeBoundaryEdge } from "./bindings";
import { ScopeCanvas, type ScopeCanvasModel } from "./scope-canvas";
import type { EditorUiSession } from "./use-editor-ui-session";
import type { DocumentSession } from "./use-document-session";
import type { ScopeNavigationDeps } from "./scope-navigation";
import { useAutoLayoutAction } from "./use-auto-layout-action";
import { useCanvasCameraSession } from "./use-canvas-camera-session";
import { useCanvasPointerGestures } from "./use-canvas-pointer-gestures";
import { useCanvasProjectionActions } from "./use-canvas-projection-actions";
import { useScopeNavigationSession } from "./use-scope-navigation-session";
import { useScopeSession } from "./use-scope-session";

type AppContent = ScopeCanvasModel["appContent"];
type CanvasActions = ComponentProps<typeof ScopeCanvas>["actions"];

export interface ScopeCapability {
  scopeNode: IntentNode;
  businessScope: IntentNode;
  worldSize: { width: number; height: number };
  minimized: boolean;
  isBusiness: boolean;
  layoutLocked: boolean;
  navigationStack: ScopeCanvasModel["navigationStack"];
  scopePath: string[];
  activeCameraKey: string;
  appEdges: AggregatedEdge[];
  boundaryEdges: ScopeBoundaryEdge[];
  businessPipeCount: number;
  visibleNodes: IntentNode[];
}

export interface CanvasCapability {
  camera: ScopeCanvasModel["camera"];
  viewportRef: ComponentProps<typeof ScopeCanvas>["refs"]["viewport"];
  onWheel: CanvasActions["onWheel"];
  onViewportPointerDown: CanvasActions["onViewportPointerDown"];
  onMoveStart: AppContent["onMoveStart"];
  onResizeStart: AppContent["onResizeStart"];
  onScopeResizeStart: ScopeCanvasModel["resizeControls"]["onResizeStart"];
  onResizeModeToggle: AppContent["onResizeModeToggle"];
  onDisplayModeToggle: AppContent["onDisplayModeToggle"];
}

export interface NavigationCapability {
  legendOpen: boolean;
  onToggleLegend: CanvasActions["onToggleLegend"];
  onNavigateParent: CanvasActions["onNavigateParent"];
  onNavigateFrame: CanvasActions["onNavigateFrame"];
}

export interface EditorCanvasControllerDeps {
  document: DocumentSession;
  ui: EditorUiSession;
}

export function useEditorCanvasController({
  document,
  ui,
}: EditorCanvasControllerDeps) {
  const { model, writes, runtime, setNavigationStack } = document;
  const documentState = model.document;
  const businessScopeId = runtime.runtimeState.scopeId;
  const selectedBusinessNodeId = runtime.runtimeState.selectionId;
  const layoutLocked = runtime.runtimeState.layoutLocked;

  const scopeSession = useScopeSession({
    documentState,
    businessScopeId,
    selectedBusinessNodeId,
    layoutLocked,
    updateDocument: writes.updateTransient,
    navigationStack: model.navigationStack,
  });
  const cameraSession = useCanvasCameraSession({
    documentState,
    updateDocument: writes.updateTransient,
    activeCameraKey: scopeSession.activeCameraKey,
    scopeWorldSize: scopeSession.scopeWorldSize,
    isBusinessScope: scopeSession.isBusinessScope,
    visibleNodes: scopeSession.visibleNodes,
    scopeNode: scopeSession.scopeNode,
    scopeMinimized: scopeSession.scopeMinimized,
  });
  const projection = useCanvasProjectionActions({
    activeCameraKey: scopeSession.activeCameraKey,
    cameraRef: cameraSession.cameraRef,
    appRoot: scopeSession.appRoot,
    documentState,
    commitViewChange: writes.commitViewChange,
    setSelectedAppNodeId: ui.selection.selectAppNode,
  });
  const navigationDeps: ScopeNavigationDeps = {
    viewportRef: cameraSession.viewportRef,
    cameraRef: cameraSession.cameraRef,
    lastEnterAtRef: cameraSession.lastEnterAtRef,
    resetScaleOnNextScopeRef: cameraSession.resetScaleOnNextScopeRef,
    fitOnNextScopeRef: cameraSession.fitOnNextScopeRef,
    navigationStackLength: model.navigationStack.length,
    scopeNodeId: scopeSession.scopeNode.id,
    isBusinessScope: scopeSession.isBusinessScope,
    businessScope: scopeSession.businessScope,
    visibleNodes: scopeSession.visibleNodes,
    setNavigationStack,
    setBusinessScopeId: runtime.setBusinessScopeId,
    setSelectedBusinessNodeId: runtime.setSelectedBusinessNodeId,
    setSelectedAppNodeId: ui.selection.selectAppNode,
    setScopeLegendOpen: (open) => {
      if (!open) ui.legend.close();
      else if (!ui.legend.open) ui.legend.toggle();
    },
    setToast: ui.feedback.show,
    setScopeCamera: cameraSession.setScopeCamera,
  };
  const navigationSession = useScopeNavigationSession(navigationDeps);
  const gestures = useCanvasPointerGestures({
    viewportRef: cameraSession.viewportRef,
    cameraRef: cameraSession.cameraRef,
    layoutLocked,
    isBusinessScope: scopeSession.isBusinessScope,
    scopeNode: scopeSession.scopeNode,
    scopeWorldSize: scopeSession.scopeWorldSize,
    visibleNodes: scopeSession.visibleNodes,
    documentState,
    updateDocument: writes.updateTransient,
    checkpoint: writes.checkpoint,
    dispatchRuntimeEvent: runtime.dispatchRuntimeEvent,
    setScopeCamera: cameraSession.setScopeCamera,
    storeNodeProjection: projection.storeNodeProjection,
    storeScopeCanvasProjection: projection.storeScopeCanvasProjection,
  });
  const autoLayout = useAutoLayoutAction({
    documentState,
    scopeNode: scopeSession.scopeNode,
    scopeWorldSize: scopeSession.scopeWorldSize,
    activeCameraKey: scopeSession.activeCameraKey,
    cameraRef: cameraSession.cameraRef,
    commitViewChange: writes.commitViewChange,
    fitScope: cameraSession.fitScope,
  });

  const scope: ScopeCapability = {
    scopeNode: scopeSession.scopeNode,
    businessScope: scopeSession.businessScope,
    worldSize: scopeSession.scopeWorldSize,
    minimized: scopeSession.scopeMinimized,
    isBusiness: scopeSession.isBusinessScope,
    layoutLocked,
    navigationStack: model.navigationStack,
    scopePath: scopeSession.scopePath,
    activeCameraKey: scopeSession.activeCameraKey,
    appEdges: scopeSession.appEdges,
    boundaryEdges: scopeSession.scopeBoundaryEdges,
    businessPipeCount: scopeSession.businessVisualEdges.length,
    visibleNodes: scopeSession.visibleNodes,
  };
  const canvas: CanvasCapability = {
    camera: cameraSession.camera,
    viewportRef: cameraSession.viewportRef,
    onWheel: navigationSession.onWheel,
    onViewportPointerDown: gestures.onViewportPointerDown,
    onMoveStart: gestures.moveNodeStart,
    onResizeStart: gestures.resizeNodeStart,
    onScopeResizeStart: gestures.resizeScopeCanvasStart,
    onResizeModeToggle: projection.toggleNodeResizeMode,
    onDisplayModeToggle: projection.toggleNodeDisplayMode,
  };
  const navigation: NavigationCapability = {
    legendOpen: ui.legend.open,
    onToggleLegend: ui.legend.toggle,
    onNavigateParent: navigationSession.navigateToParent,
    onNavigateFrame: navigationSession.navigateToScopeFrame,
  };

  return {
    scope,
    canvas,
    navigation,
    projection,
    commands: {
      autoLayout,
      fit: cameraSession.fitScope,
      centerAt100Percent: cameraSession.centerScopeAtScale,
      resetCamera: cameraSession.setScopeCamera,
    },
    surface: {
      appRoot: scopeSession.appRoot,
      businessRoot: scopeSession.businessRoot,
      businessScope: scopeSession.businessScope,
      scopeNode: scopeSession.scopeNode,
      validationIssues: scopeSession.validationIssues,
      layoutLocked,
      camera: cameraSession.camera,
      navigationStack: model.navigationStack,
    },
    authoring: {
      ...scopeSession,
      layoutLocked,
      viewportRef: cameraSession.viewportRef,
      cameraRef: cameraSession.cameraRef,
      fitOnNextScopeRef: cameraSession.fitOnNextScopeRef,
      updateDocumentNodeView: projection.updateDocumentNodeView,
      storeNodeProjection: projection.storeNodeProjection,
      enterNode: navigationSession.enterNode,
    },
  };
}

export type EditorCanvasController = ReturnType<
  typeof useEditorCanvasController
>;
