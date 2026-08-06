"use client";

import type { IntentNode } from "../runtime/model";
import { renderNodeSurface, type NodeSurfaceDeps } from "./node-surfaces";

type Fields<K extends keyof NodeSurfaceDeps> = Pick<NodeSurfaceDeps, K>;

export interface EditorCapabilities {
  document: Fields<"documentState" | "history" | "future" | "dirty" | "pipIoPolicy" | "setPipIoPolicy" | "exportDocument" | "exportPip" | "updateDocumentNode">;
  scope: Fields<"appRoot" | "businessRoot" | "businessScope" | "scopeNode" | "validationIssues" | "layoutLocked" | "camera" | "navigationStack">;
  selection: Fields<"selectedBusinessNode" | "selectedBusinessNodeId" | "selectedAppNodeId" | "setSelectedBusinessNodeId">;
  authoring: Fields<"renameBusinessNode" | "bindingOptionsFor" | "updateInputBinding" | "outputBindingOptionsFor" | "updateOutputBinding" | "editPortSchema" | "addPortSchema" | "movePortSchema" | "duplicateBusinessNode" | "createLinkedBusinessNode" | "deleteBusinessNode" | "insertModule">;
  navigation: Fields<"navigateToBusinessNode" | "navigatePanelBusinessNode" | "selectPanelBusinessNode">;
  runtime: Fields<"runtimeState" | "eventTick" | "pendingEvents" | "pipelineTrace" | "lastCommands" | "dispatchRuntimeEvent" | "emit">;
  workspace: Fields<"search" | "setSearch">;
  feedback: Fields<"setToast">;
}

export function useNodeSurfaceController(capabilities: EditorCapabilities) {
  const deps: NodeSurfaceDeps = {
    ...capabilities.document,
    ...capabilities.scope,
    ...capabilities.selection,
    ...capabilities.authoring,
    ...capabilities.navigation,
    ...capabilities.runtime,
    ...capabilities.workspace,
    ...capabilities.feedback,
  };
  return (
    node: IntentNode,
    contextAddress?: { panelId: string; surfaceId: string },
  ) => renderNodeSurface(node, deps, contextAddress);
}
