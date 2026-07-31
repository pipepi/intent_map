"use client";

import { updatePanel, type IntentDocumentV3, type WorkspaceState } from "../runtime/model";
import { clone, uid } from "./tree-utils";

export interface WorkspaceViewActionDeps {
  updateViewDocument: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
  setToast: (message: string) => void;
}

export function useWorkspaceViewActions({
  updateViewDocument,
  setToast,
}: WorkspaceViewActionDeps) {
  const onWorkspaceChange = (workspace: WorkspaceState) => {
    updateViewDocument((active) => ({ ...active, workspaceState: workspace }));
  };

  const onUpdateView = (panelId: string) => {
    updateViewDocument((active) => {
      const panel = active.workspaceState.panels.find(
        (candidate) => candidate.id === panelId,
      );
      if (!panel) return active;
      return {
        ...active,
        views: active.views.map((item) =>
          item.id === panel.viewId
            ? {
                ...item,
                layoutLocked: panel.layoutLocked,
                surfaceTemplates: clone(panel.surfaces),
              }
            : item,
        ),
      };
    });
    setToast("已用当前 Panel 实例更新 View");
  };

  const onSaveViewAs = (panelId: string) => {
    const name = window.prompt("新 View 名称");
    if (!name?.trim()) return;
    updateViewDocument((active) => {
      const panel = active.workspaceState.panels.find(
        (candidate) => candidate.id === panelId,
      );
      const sourceView = active.views.find((item) => item.id === panel?.viewId);
      if (!panel || !sourceView) return active;
      const viewId = uid("view");
      const withPanel = updatePanel(active, panelId, (candidate) => ({
        ...candidate,
        viewId,
      }));
      return {
        ...withPanel,
        views: [
          ...withPanel.views,
          {
            ...sourceView,
            id: viewId,
            name: name.trim(),
            layoutLocked: panel.layoutLocked,
            surfaceTemplates: clone(panel.surfaces),
          },
        ],
      };
    });
    setToast(`已另存 View：${name.trim()}`);
  };

  return { onWorkspaceChange, onUpdateView, onSaveViewAs };
}
