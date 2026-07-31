"use client";

import { useEffect, useRef } from "react";

import type { CameraState, IntentDocumentV3, IntentNode } from "../runtime/model";
import { findNode } from "./tree-utils";

export interface EditorShortcutOptions {
  dirty: boolean;
  undo: () => void;
  redo: () => void;
  exportDocument: (document: IntentDocumentV3) => Promise<unknown>;
  enterNode: (node: IntentNode) => void;
  navigateToParent: () => void;
  fitScope: () => void;
  centerScopeAtScale: (scale: number) => CameraState | undefined;
  setScopeCamera: (next: CameraState, persist?: boolean) => void;
  deleteAppNode: () => void;
  documentState: IntentDocumentV3;
  visibleNodes: IntentNode[];
  isBusinessScope: boolean;
  scopeNode: IntentNode;
  businessScope: IntentNode;
  selectedAppNodeId: string;
  selectedBusinessNodeId: string;
  navigationStackLength: number;
}

export function useEditorShortcuts(options: EditorShortcutOptions) {
  const latest = useRef(options);

  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const actions = latest.current;
      const target = event.target as HTMLElement | null;
      const isEditing = !!(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      );
      if (event.key === "Escape" && actions.navigationStackLength > 1) {
        actions.navigateToParent();
        return;
      }
      const key = event.key.toLowerCase();
      if (!isEditing && (event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (!isEditing && (event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        actions.redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        void actions.exportDocument(actions.documentState);
        return;
      }
      if (!isEditing && event.key === "Enter") {
        const pool = actions.isBusinessScope
          ? (actions.businessScope.children ?? [])
          : actions.visibleNodes;
        const selected = pool.find(
          (node) =>
            node.id ===
            (actions.isBusinessScope
              ? actions.selectedBusinessNodeId
              : actions.selectedAppNodeId),
        );
        if (selected) actions.enterNode(selected);
        return;
      }
      if (!isEditing && (event.key === "Delete" || event.key === "Backspace")) {
        if (
          !actions.isBusinessScope &&
          findNode(actions.scopeNode, actions.selectedAppNodeId)
        ) {
          event.preventDefault();
          actions.deleteAppNode();
        }
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        actions.fitScope();
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        const centered = actions.centerScopeAtScale(1);
        if (centered) actions.setScopeCamera(centered, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const warning = (event: BeforeUnloadEvent) => {
      if (options.dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [options.dirty]);
}
