"use client";

import { EditorWorkspaceContainer } from "./editor-workspace-container";
import { ScopeCanvasContainer } from "./scope-canvas-container";
import { useDocumentSession } from "./use-document-session";
import { useEditorAuthoringController } from "./use-editor-authoring-controller";
import { useEditorCanvasController } from "./use-editor-canvas-controller";
import { useEditorRuntimeController } from "./use-editor-runtime-controller";
import { useEditorUiSession } from "./use-editor-ui-session";
import { useNodeSurfaceController } from "./use-node-surface-controller";

export function IntentEditor() {
  const ui = useEditorUiSession();
  const document = useDocumentSession(ui.feedback.show);
  const canvas = useEditorCanvasController({ document, ui });
  const authoring = useEditorAuthoringController({ document, canvas, ui });
  const runtime = useEditorRuntimeController({
    document,
    canvas,
    authoring,
    ui,
  });
  const selection = ui.selection.bindBusiness(
    document.runtime.runtimeState.selectionId,
    document.runtime.setSelectedBusinessNodeId,
  );

  const renderNodeContent = useNodeSurfaceController({
    document: {
      documentState: document.model.document,
      history: document.model.history,
      future: document.model.future,
      dirty: document.model.dirty,
      pipIoPolicy: document.model.pipIoPolicy,
      setPipIoPolicy: document.setPipIoPolicy,
      savePipIoPolicyAsLocalDefault: document.savePipIoPolicyAsLocalDefault,
      exportDocument: document.io.exportDocument,
      exportPip: document.io.exportPip,
      updateDocumentNode: document.writes.updateNode,
    },
    scope: canvas.surface,
    selection: {
      selectedBusinessNode: canvas.authoring.selectedBusinessNode,
      selectedBusinessNodeId: selection.selectedBusinessNodeId,
      selectedAppNodeId: selection.selectedAppNodeId,
      setSelectedBusinessNodeId: selection.onSelectBusinessNode,
    },
    authoring: authoring.nodeSurface,
    navigation: authoring.navigation,
    runtime: runtime.surface,
    workspace: ui.workspace,
    feedback: { setToast: ui.feedback.show },
  });

  return (
    <EditorWorkspaceContainer
      document={{
        fileInputRef: document.io.fileInputRef,
        onImportDocument: document.io.importDocument,
        document: document.model.document,
        renderNodeContent,
      }}
      authoring={authoring.workspace}
      views={{ updateViewDocument: document.writes.rawView }}
      feedback={{ setToast: ui.feedback.show }}
      canvas={
        <ScopeCanvasContainer
          scope={canvas.scope}
          canvas={canvas.canvas}
          selection={selection}
          authoring={authoring.canvas}
          navigation={canvas.navigation}
          feedback={{
            toast: ui.feedback.toast,
            setToast: ui.feedback.show,
          }}
          renderNodeContent={renderNodeContent}
        />
      }
    />
  );
}
