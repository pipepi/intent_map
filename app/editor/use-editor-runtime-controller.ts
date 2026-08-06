"use client";

import type { RuntimeCommand } from "../runtime/registry";
import { createRuntimeCommandActions } from "./runtime-command-actions";
import type { DocumentSession } from "./use-document-session";
import type { EditorAuthoringController } from "./use-editor-authoring-controller";
import type { EditorCanvasController } from "./use-editor-canvas-controller";
import type { EditorUiSession } from "./use-editor-ui-session";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useRuntimeCommandExecutor } from "./use-runtime-command-executor";

export interface EditorRuntimeControllerDeps {
  document: DocumentSession;
  canvas: EditorCanvasController;
  authoring: EditorAuthoringController;
  ui: EditorUiSession;
}

export function useEditorRuntimeController({
  document,
  canvas,
  authoring,
  ui,
}: EditorRuntimeControllerDeps) {
  const { model, io, historyActions, runtime } = document;
  useEditorShortcuts({
    dirty: model.dirty,
    undo: historyActions.undo,
    redo: historyActions.redo,
    exportDocument: io.exportDocument,
    enterNode: canvas.authoring.enterNode,
    navigateToParent: canvas.navigation.onNavigateParent,
    fitScope: canvas.commands.fit,
    centerScopeAtScale: canvas.commands.centerAt100Percent,
    setScopeCamera: canvas.commands.resetCamera,
    deleteAppNode: authoring.commands.deleteAppNode,
    documentState: model.document,
    visibleNodes: canvas.scope.visibleNodes,
    isBusinessScope: canvas.scope.isBusiness,
    scopeNode: canvas.scope.scopeNode,
    businessScope: canvas.scope.businessScope,
    selectedAppNodeId: ui.selection.appNodeId,
    selectedBusinessNodeId: runtime.runtimeState.selectionId,
    navigationStackLength: model.navigationStack.length,
  });

  const commandActions = createRuntimeCommandActions({
    document: {
      current: model.document,
      newDocument: io.newDocument,
      requestImport: () => io.fileInputRef.current?.click(),
      exportDocument: io.exportDocument,
      undo: historyActions.undo,
      redo: historyActions.redo,
    },
    canvas: {
      autoLayout: canvas.commands.autoLayout,
      fitScope: canvas.commands.fit,
      centerScopeAtScale: canvas.commands.centerAt100Percent,
      setScopeCamera: canvas.commands.resetCamera,
    },
    authoring: authoring.commands,
    navigation: {
      canNavigateParent: model.navigationStack.length > 1,
      navigateToParent: canvas.navigation.onNavigateParent,
    },
  });
  useRuntimeCommandExecutor(runtime.lastCommands, commandActions);

  const emit = (command: RuntimeCommand) => {
    runtime.dispatchRuntimeEvent(
      command.type,
      command.source ?? "renderer",
      command.payload,
    );
  };

  return {
    surface: {
      runtimeState: runtime.runtimeState,
      eventTick: runtime.eventTick,
      pendingEvents: runtime.pendingEvents,
      pipelineTrace: runtime.pipelineTrace,
      lastCommands: runtime.lastCommands,
      dispatchRuntimeEvent: runtime.dispatchRuntimeEvent,
      emit,
    },
  };
}
