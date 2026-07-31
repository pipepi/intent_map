"use client";

import { createApplicationDocument, type IntentDocumentV3, type IntentNode } from "../runtime/model";
import { clone, findNode, freePanelContext, removeNode, uid } from "./tree-utils";

export interface ApplicationNodeActionDeps {
  documentState: IntentDocumentV3;
  scopeNode: IntentNode;
  businessRoot: IntentNode;
  selectedAppNodeId: string;
  updateDocumentNode: (id: string, updater: (node: IntentNode) => IntentNode) => void;
  commitDocument: (next: IntentDocumentV3) => void;
  setNavigationStack: (stack: ReturnType<typeof freePanelContext>["navigationStack"]) => void;
  setSelectedAppNodeId: (id: string) => void;
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, string>,
  ) => void;
}

export function useApplicationNodeActions({
  documentState,
  scopeNode,
  businessRoot,
  selectedAppNodeId,
  updateDocumentNode,
  commitDocument,
  setNavigationStack,
  setSelectedAppNodeId,
  dispatchRuntimeEvent,
}: ApplicationNodeActionDeps) {
  const addRuntimeChild = () => {
    const node: IntentNode = {
      id: uid("node"),
      name: "新子节点",
      description: "当前叶子节点内部的新管道节点。",
      kind: "composite",
      inputs: [],
      outputs: [],
      children: [],
      position: { x: 180, y: 150 },
      size: { width: 280, height: 180 },
      resizeMode: "simple",
      displayMode: "minimized",
    };
    updateDocumentNode(scopeNode.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), node],
      canvasSize: scope.canvasSize ?? { width: 1000, height: 700 },
    }));
  };

  const duplicateAppNode = () => {
    const selected = findNode(scopeNode, selectedAppNodeId);
    if (!selected || selected.id === scopeNode.id) return;
    const duplicate: IntentNode = {
      ...clone(selected),
      id: uid("view"),
      name: `${selected.name} · 副本`,
      position: {
        x: selected.position.x + 42,
        y: selected.position.y + 42,
      },
      implementation: selected.implementation
        ? { ...selected.implementation, core: false }
        : undefined,
    };
    updateDocumentNode(scopeNode.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), duplicate],
    }));
    setSelectedAppNodeId(duplicate.id);
  };

  const deleteAppNode = () => {
    const selected = findNode(scopeNode, selectedAppNodeId);
    if (!selected || selected.id === scopeNode.id) return;
    if (
      selected.implementation?.core &&
      !window.confirm(`「${selected.name}」是核心节点。确认删除？可通过“重置应用节点图”恢复。`)
    ) {
      return;
    }
    updateDocumentNode(scopeNode.id, (scope) => removeNode(scope, selected.id));
    setSelectedAppNodeId(scopeNode.children?.[0]?.id ?? scopeNode.id);
  };

  const resetApplicationGraph = () => {
    if (!window.confirm("重置全部应用节点布局和系统绑定？业务意图与模块快照会保留。")) return;
    const reset = createApplicationDocument(
      clone(businessRoot),
      clone(documentState.publishedModules),
    );
    const restored = freePanelContext(reset);
    commitDocument(reset);
    setNavigationStack(restored.navigationStack);
    setSelectedAppNodeId("current_container");
    dispatchRuntimeEvent("DOCUMENT_LOADED", "application_root", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
  };

  return {
    addRuntimeChild,
    duplicateAppNode,
    deleteAppNode,
    resetApplicationGraph,
  };
}
