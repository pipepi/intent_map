import type { CameraState, IntentDocumentV3 } from "../runtime/model";
import type { RuntimeCommandActions } from "./use-runtime-command-executor";

export interface RuntimeCommandActionDeps {
  document: {
    current: IntentDocumentV3;
    newDocument: () => void;
    requestImport: () => void;
    exportDocument: (source: IntentDocumentV3) => Promise<unknown>;
    undo: () => void;
    redo: () => void;
  };
  canvas: {
    autoLayout: () => void;
    fitScope: () => void;
    centerScopeAtScale: (scale: number) => CameraState | undefined;
    setScopeCamera: (next: CameraState, persist?: boolean) => void;
  };
  authoring: {
    publishModule: () => void;
    addBusinessChild: () => void;
    duplicateSelected: () => void;
    deleteSelected: () => void;
    duplicateAppNode: () => void;
    deleteAppNode: () => void;
    resetApplicationGraph: () => void;
  };
  runtime: { run: () => Promise<void>; stop: () => void };
  navigation: {
    canNavigateParent: boolean;
    navigateToParent: () => void;
  };
}

export function createRuntimeCommandActions({
  document,
  canvas,
  authoring,
  runtime,
  navigation,
}: RuntimeCommandActionDeps): RuntimeCommandActions {
  return {
    NEW_DOCUMENT: document.newDocument,
    IMPORT_REQUEST: document.requestImport,
    EXPORT_DOCUMENT: async () => {
      await document.exportDocument(document.current);
    },
    UNDO: document.undo,
    REDO: document.redo,
    AUTO_LAYOUT: canvas.autoLayout,
    PUBLISH_MODULE: authoring.publishModule,
    RUN_BUSINESS: runtime.run,
    STOP_BUSINESS: runtime.stop,
    ADD_BUSINESS_CHILD: authoring.addBusinessChild,
    DUPLICATE_NODE: authoring.duplicateSelected,
    DELETE_NODE: authoring.deleteSelected,
    DUPLICATE_APP_NODE: authoring.duplicateAppNode,
    DELETE_APP_NODE: authoring.deleteAppNode,
    RESET_APP_GRAPH: authoring.resetApplicationGraph,
    NAVIGATE_APP_PARENT: () => {
      if (navigation.canNavigateParent) navigation.navigateToParent();
    },
    FIT_SCOPE: canvas.fitScope,
    RESET_CAMERA: () => {
      const centered = canvas.centerScopeAtScale(1);
      if (centered) canvas.setScopeCamera(centered, true);
    },
  };
}
