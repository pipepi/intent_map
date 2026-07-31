"use client";

import type { ComponentProps, ReactNode } from "react";

import type { IntentDocumentV3 } from "../runtime/model";
import { EditorWorkspace } from "./editor-workspace";
import { useWorkspaceViewActions } from "./use-workspace-view-actions";

type WorkspaceProps = ComponentProps<typeof EditorWorkspace>;

export interface DocumentWorkspaceCapability {
  fileInputRef: WorkspaceProps["fileInputRef"];
  onImportDocument: WorkspaceProps["onImportDocument"];
  document: WorkspaceProps["document"];
  renderNodeContent: WorkspaceProps["renderNodeContent"];
}

export interface WorkspaceAuthoringCapability {
  onUpdateInputBinding: WorkspaceProps["onUpdateInputBinding"];
  onUpdateOutputBinding: WorkspaceProps["onUpdateOutputBinding"];
  onAddBusinessChild: WorkspaceProps["onAddBusinessChild"];
}

export interface WorkspaceViewCapability {
  updateViewDocument: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
}

export interface WorkspaceFeedbackCapability {
  setToast: (message: string) => void;
}

export interface EditorWorkspaceContainerProps {
  document: DocumentWorkspaceCapability;
  authoring: WorkspaceAuthoringCapability;
  views: WorkspaceViewCapability;
  feedback: WorkspaceFeedbackCapability;
  canvas: ReactNode;
}

export function EditorWorkspaceContainer({
  document,
  authoring,
  views,
  feedback,
  canvas,
}: EditorWorkspaceContainerProps) {
  const viewActions = useWorkspaceViewActions({
    updateViewDocument: views.updateViewDocument,
    setToast: feedback.setToast,
  });
  return (
    <EditorWorkspace
      {...document}
      {...authoring}
      onFeedback={feedback.setToast}
      onWorkspaceChange={viewActions.onWorkspaceChange}
      onUpdateView={viewActions.onUpdateView}
      onSaveViewAs={viewActions.onSaveViewAs}
      canvas={canvas}
    />
  );
}
