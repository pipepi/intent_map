"use client";

import type { ComponentProps } from "react";

import type { IntentNode } from "../runtime/model";
import type { AggregatedEdge, ScopeBoundaryEdge } from "./bindings";
import type { BusinessScopeLayerDeps } from "./business-scope-layer";
import {
  createBusinessLayerModel,
  createCanvasDerivedModel,
  createEdgeRendererModel,
} from "./editor-view-models";
import { ScopeCanvas, type ScopeCanvasModel } from "./scope-canvas";

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

export interface SelectionCapability {
  selectedAppNodeId: string;
  selectedBusinessNodeId: string;
  onSelectAppNode: AppContent["onSelectAppNode"];
  onSelectBusinessNode: AppContent["onSelectBusinessNode"];
  setSelectedEdgeId: (id: string | null) => void;
  selectedEdgeId: string | null;
}

export interface CanvasAuthoringCapability {
  businessLayer: Omit<
    BusinessScopeLayerDeps,
    "scope" | "worldSize" | "scale" | "selectedNodeId" | "layoutLocked"
  >;
  updateInputBinding: AppContent["edgeRendererDeps"]["updateInputBinding"];
  onEnterNode: AppContent["onEnterNode"];
  onAddRuntimeChild: AppContent["onAddRuntimeChild"];
}

export interface NavigationCapability {
  legendOpen: boolean;
  onToggleLegend: CanvasActions["onToggleLegend"];
  onNavigateParent: CanvasActions["onNavigateParent"];
  onNavigateFrame: CanvasActions["onNavigateFrame"];
}

export interface CanvasFeedbackCapability {
  toast: string;
  setToast: (message: string) => void;
}

export interface ScopeCanvasContainerProps {
  scope: ScopeCapability;
  canvas: CanvasCapability;
  selection: SelectionCapability;
  authoring: CanvasAuthoringCapability;
  navigation: NavigationCapability;
  feedback: CanvasFeedbackCapability;
  renderNodeContent: AppContent["renderNodeContent"];
}

export function ScopeCanvasContainer({
  scope,
  canvas,
  selection,
  authoring,
  navigation,
  feedback,
  renderNodeContent,
}: ScopeCanvasContainerProps) {
  const derived = createCanvasDerivedModel({
    scopeWorldSize: scope.worldSize,
    scopeMinimized: scope.minimized,
    navigationDepth: scope.navigationStack.length,
    scopeNode: scope.scopeNode,
    isBusinessScope: scope.isBusiness,
    businessPipeCount: scope.businessPipeCount,
    appPipeCount: scope.appEdges.length + scope.boundaryEdges.length,
  });
  const edgeRendererDeps = createEdgeRendererModel({
    scopeNode: scope.scopeNode,
    worldSize: derived.worldSize,
    selectedEdgeId: selection.selectedEdgeId,
    selectedAppNodeId: selection.selectedAppNodeId,
    setSelectedEdgeId: selection.setSelectedEdgeId,
    updateInputBinding: authoring.updateInputBinding,
    setToast: feedback.setToast,
  });
  const businessLayer = createBusinessLayerModel({
    scope: scope.businessScope,
    worldSize: scope.worldSize,
    scale: canvas.camera.scale,
    selectedNodeId: selection.selectedBusinessNodeId ?? undefined,
    layoutLocked: scope.layoutLocked,
    ...authoring.businessLayer,
  });

  return (
    <ScopeCanvas
      refs={{ viewport: canvas.viewportRef }}
      model={{
        camera: canvas.camera,
        renderedWorldSize: derived.renderedWorldSize,
        activeCameraKey: scope.activeCameraKey,
        scopeMinimized: scope.minimized,
        isBusinessScope: scope.isBusiness,
        layoutLocked: scope.layoutLocked,
        navigationStack: scope.navigationStack,
        scopePath: scope.scopePath,
        derivedPipeCount: derived.derivedPipeCount,
        scopeLegendOpen: navigation.legendOpen,
        toast: feedback.toast,
        businessLayer,
        header: {
          minimized: scope.minimized,
          isBusinessScope: scope.isBusiness,
          scopeNode: scope.scopeNode,
          onToggleDisplayMode: canvas.onDisplayModeToggle,
        },
        appContent: {
          scopeNode: scope.scopeNode,
          worldSize: derived.worldSize,
          appEdges: scope.appEdges,
          scopeBoundaryEdges: scope.boundaryEdges,
          edgeRendererDeps,
          visibleNodes: scope.visibleNodes,
          cameraScale: canvas.camera.scale,
          selectedAppNodeId: selection.selectedAppNodeId,
          layoutLocked: scope.layoutLocked,
          businessScopeId: scope.businessScope.id,
          renderNodeContent,
          onSelectAppNode: selection.onSelectAppNode,
          onSelectBusinessNode: selection.onSelectBusinessNode,
          onEnterNode: authoring.onEnterNode,
          onMoveStart: canvas.onMoveStart,
          onResizeStart: canvas.onResizeStart,
          onResizeModeToggle: canvas.onResizeModeToggle,
          onDisplayModeToggle: canvas.onDisplayModeToggle,
          focusedLeaf: derived.focusedLeaf,
          canAddRuntimeChild: derived.canAddRuntimeChild,
          onAddRuntimeChild: authoring.onAddRuntimeChild,
        },
        resizeControls: {
          scopeNode: scope.scopeNode,
          worldSize: derived.worldSize,
          selected: selection.selectedAppNodeId === scope.scopeNode.id,
          onResizeStart: canvas.onScopeResizeStart,
          onResizeModeToggle: canvas.onResizeModeToggle,
        },
      }}
      actions={{
        onWheel: canvas.onWheel,
        onViewportPointerDown: canvas.onViewportPointerDown,
        onToggleLegend: navigation.onToggleLegend,
        onNavigateParent: navigation.onNavigateParent,
        onNavigateFrame: navigation.onNavigateFrame,
        onDismissToast: () => feedback.setToast(""),
      }}
    />
  );
}
