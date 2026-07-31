"use client";

import { useEffect, useMemo } from "react";

import {
  getBusinessRoot,
  getContainerSurface,
  nodeDisplayMode,
  scopeCameraKey,
  updateSurface,
  type IntentDocumentV3,
  type ScopeAddress,
} from "../runtime/model";
import { MINIMIZED_NODE_SIZE } from "../runtime/node-renderer";
import { projectIntentTree } from "../runtime/projection";
import { deriveBusinessVisualEdges } from "../runtime/business-canvas";
import { deriveNodeBindingEdges } from "../runtime/panel-pipelines";
import { aggregateEdges, deriveScopeBoundaryEdges } from "./bindings";
import { collectValidationIssues } from "./validation";
import { findNode, nodeSize } from "./tree-utils";

export interface UseScopeSessionOptions {
  documentState: IntentDocumentV3;
  businessScopeId: string;
  selectedBusinessNodeId: string;
  layoutLocked: boolean;
  updateDocument: (updater: (active: IntentDocumentV3) => IntentDocumentV3) => void;
  navigationStack: ScopeAddress[];
}

export function useScopeSession({
  documentState,
  businessScopeId,
  selectedBusinessNodeId,
  layoutLocked,
  updateDocument,
  navigationStack,
}: UseScopeSessionOptions) {

  const freeContainer = getContainerSurface(
    documentState,
    "panel-free-layout",
    "free-layout-container",
  );
  const appRoot = useMemo(
    () =>
      projectIntentTree(
        documentState.rootIntent,
        documentState.businessRootId,
        freeContainer?.projections ?? {},
      ),
    [documentState.businessRootId, documentState.rootIntent, freeContainer?.projections],
  );
  const businessRoot = useMemo(
    () => getBusinessRoot({ ...documentState, rootIntent: appRoot }),
    [appRoot, documentState],
  );
  const activeAddress = useMemo(
    () => navigationStack.at(-1) ?? ({ domain: "app", nodeId: appRoot.id } as const),
    [appRoot.id, navigationStack],
  );
  const isBusinessScope = activeAddress.domain === "business";
  const scopeNode = useMemo(
    () =>
      activeAddress.domain === "business"
        ? findNode(businessRoot, activeAddress.nodeId) ?? businessRoot
        : findNode(appRoot, activeAddress.nodeId) ?? appRoot,
    [activeAddress, appRoot, businessRoot],
  );
  const businessScope = useMemo(
    () =>
      isBusinessScope
        ? scopeNode
        : findNode(businessRoot, businessScopeId) ?? businessRoot,
    [businessRoot, businessScopeId, isBusinessScope, scopeNode],
  );
  const selectedBusinessNode =
    findNode(businessRoot, selectedBusinessNodeId) ?? businessScope;

  useEffect(() => {
    updateDocument((active) =>
      updateSurface(
        active,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          if (
            scopeCameraKey(surface.scope) === scopeCameraKey(activeAddress) &&
            surface.nodeLayoutLocked === layoutLocked &&
            surface.navigationStack.map(scopeCameraKey).join("/") ===
              navigationStack.map(scopeCameraKey).join("/")
          ) {
            return surface;
          }
          return {
            ...surface,
            scope: activeAddress,
            navigationStack,
            nodeLayoutLocked: layoutLocked,
          };
        },
      ),
    );
  }, [activeAddress, layoutLocked, navigationStack, updateDocument]);

  const appEdges = useMemo(
    () => aggregateEdges(deriveNodeBindingEdges(scopeNode)),
    [scopeNode],
  );
  const scopeBoundaryEdges = useMemo(
    () => deriveScopeBoundaryEdges(scopeNode),
    [scopeNode],
  );
  const businessVisualEdges = useMemo(
    () => deriveBusinessVisualEdges(businessScope),
    [businessScope],
  );
  const validationIssues = useMemo(
    () => collectValidationIssues(businessScope),
    [businessScope],
  );
  const visibleNodes = useMemo(() => scopeNode.children ?? [], [scopeNode.children]);
  const scopeMinimized =
    !isBusinessScope && nodeDisplayMode(scopeNode) === "minimized";
  const activeCameraKey = scopeCameraKey(activeAddress);
  const scopeCanvasProjection =
    freeContainer?.projections[activeCameraKey]?.nodeLayouts[scopeNode.id];
  const scopeWorldSize = useMemo(
    () =>
      scopeMinimized
        ? MINIMIZED_NODE_SIZE
        : scopeCanvasProjection
          ? {
              width: scopeCanvasProjection.frame.width,
              height: scopeCanvasProjection.frame.height,
            }
          : scopeNode.canvasSize ?? {
              width: Math.max(
                900,
                ...visibleNodes.map(
                  (node) => node.position.x + nodeSize(node).width + 100,
                ),
              ),
              height: Math.max(
                600,
                ...visibleNodes.map(
                  (node) => node.position.y + nodeSize(node).height + 100,
                ),
              ),
            },
    [scopeCanvasProjection, scopeMinimized, scopeNode.canvasSize, visibleNodes],
  );
  const scopePath = useMemo(
    () =>
      navigationStack.map((address) => {
        const root = address.domain === "business" ? businessRoot : appRoot;
        return (
          findNode(root, address.nodeId)?.name ??
          (address.domain === "business" ? "业务作用域" : "应用作用域")
        );
      }),
    [appRoot, businessRoot, navigationStack],
  );

  return {
    navigationStack,
    freeContainer,
    appRoot,
    businessRoot,
    activeAddress,
    isBusinessScope,
    scopeNode,
    businessScope,
    selectedBusinessNode,
    appEdges,
    scopeBoundaryEdges,
    businessVisualEdges,
    validationIssues,
    visibleNodes,
    scopeMinimized,
    activeCameraKey,
    scopeWorldSize,
    scopePath,
  };
}
