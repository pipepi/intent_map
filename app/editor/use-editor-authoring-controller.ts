"use client";

import type { ComponentProps } from "react";

import type { BusinessScopeLayerDeps } from "./business-scope-layer";
import { EditorWorkspace } from "./editor-workspace";
import type { ScopeCanvasModel } from "./scope-canvas";
import type { DocumentSession } from "./use-document-session";
import type { EditorCanvasController } from "./use-editor-canvas-controller";
import type { EditorUiSession } from "./use-editor-ui-session";
import { useApplicationNodeActions } from "./use-application-node-actions";
import { useAuthoringSchemaActions } from "./use-authoring-schema-actions";
import { useBusinessAuthoringSession } from "./use-business-authoring-session";
import { usePanelNavigationActions } from "./use-panel-navigation-actions";

type WorkspaceProps = ComponentProps<typeof EditorWorkspace>;
type AppContent = ScopeCanvasModel["appContent"];

export interface WorkspaceAuthoringCapability {
  onUpdateInputBinding: WorkspaceProps["onUpdateInputBinding"];
  onUpdateOutputBinding: WorkspaceProps["onUpdateOutputBinding"];
  onAddBusinessChild: WorkspaceProps["onAddBusinessChild"];
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

export interface EditorAuthoringControllerDeps {
  document: DocumentSession;
  canvas: EditorCanvasController;
  ui: EditorUiSession;
}

export function useEditorAuthoringController({
  document,
  canvas,
  ui,
}: EditorAuthoringControllerDeps) {
  const { model, writes, runtime, setNavigationStack } = document;
  const context = canvas.authoring;
  const schema = useAuthoringSchemaActions({
    documentState: model.document,
    businessRoot: context.businessRoot,
    commitDocumentChange: writes.commitDocumentChange,
    updateDocumentNode: writes.updateNode,
    setToast: ui.feedback.show,
  });
  const panelNavigation = usePanelNavigationActions({
    appRoot: context.appRoot,
    businessRoot: context.businessRoot,
    fitOnNextScopeRef: context.fitOnNextScopeRef,
    setScopeLegendOpen: (open) => {
      if (!open) ui.legend.close();
    },
    setNavigationStack,
    setBusinessScopeId: runtime.setBusinessScopeId,
    setSelectedBusinessNodeId: runtime.setSelectedBusinessNodeId,
    updateViewDocument: writes.rawView,
  });
  const application = useApplicationNodeActions({
    documentState: model.document,
    scopeNode: context.scopeNode,
    businessRoot: context.businessRoot,
    selectedAppNodeId: ui.selection.appNodeId,
    updateDocumentNode: writes.updateNode,
    commitDocument: writes.rawCommit,
    setNavigationStack,
    setSelectedAppNodeId: ui.selection.selectAppNode,
    dispatchRuntimeEvent: runtime.dispatchRuntimeEvent,
  });
  const business = useBusinessAuthoringSession({
    refs: {
      viewportRef: context.viewportRef,
      cameraRef: context.cameraRef,
    },
    scope: {
      layoutLocked: context.layoutLocked,
      businessRoot: context.businessRoot,
      businessScope: context.businessScope,
      selectedBusinessNode: context.selectedBusinessNode,
    },
    document: {
      documentState: model.document,
      updateDocument: writes.updateTransient,
      checkpoint: writes.checkpoint,
      commit: writes.commitDocumentChange,
      updateDocumentNode: writes.updateNode,
      updateDocumentNodeView: context.updateDocumentNodeView,
      storeNodeProjection: context.storeNodeProjection,
    },
    selection: {
      setSelectedBusinessNodeId: runtime.setSelectedBusinessNodeId,
      selectPanelBusinessNode: panelNavigation.selectPanelBusinessNode,
    },
    bindings: {
      updateInputBinding: schema.updateInputBinding,
      updateOutputBinding: schema.updateOutputBinding,
    },
    runtime: { dispatchRuntimeEvent: runtime.dispatchRuntimeEvent },
    feedback: {
      setToast: ui.feedback.show,
      setPendingPipe: ui.pipe.setPending,
    },
  });

  const workspace: WorkspaceAuthoringCapability = {
    onUpdateInputBinding: schema.updateInputBinding,
    onUpdateOutputBinding: schema.updateOutputBinding,
    onAddBusinessChild: (scopeId: string) =>
      business.nodes.addChild(scopeId, false),
  };
  const canvasCapability: CanvasAuthoringCapability = {
    businessLayer: {
      pendingPipe: ui.pipe.pending,
      selectNode: runtime.setSelectedBusinessNodeId,
      enterNode: context.enterNode,
      moveNodeStart: business.geometry.moveStart,
      resizeNodeStart: business.geometry.resizeStart,
      toggleResizeMode: business.geometry.toggleResizeMode,
      toggleDisplayMode: business.geometry.toggleDisplayMode,
      updateInputBinding: schema.updateInputBinding,
      updateOutputBinding: schema.updateOutputBinding,
      setToast: ui.feedback.show,
      startPipeDrag: business.pipes.startDrag,
      addChild: business.nodes.addChild,
    },
    updateInputBinding: schema.updateInputBinding,
    onEnterNode: context.enterNode,
    onAddRuntimeChild: application.addRuntimeChild,
  };

  return {
    workspace,
    canvas: canvasCapability,
    nodeSurface: {
      ...schema,
      duplicateBusinessNode: business.nodes.duplicate,
      createLinkedBusinessNode: business.nodes.createLinked,
      deleteBusinessNode: business.nodes.remove,
      insertModule: business.modules.insert,
    },
    navigation: panelNavigation,
    commands: {
      publishModule: business.modules.publish,
      addBusinessChild: () => business.nodes.addChild(),
      duplicateSelected: business.nodes.duplicateSelected,
      deleteSelected: business.nodes.removeSelected,
      duplicateAppNode: application.duplicateAppNode,
      deleteAppNode: application.deleteAppNode,
      resetApplicationGraph: application.resetApplicationGraph,
    },
  };
}

export type EditorAuthoringController = ReturnType<
  typeof useEditorAuthoringController
>;
