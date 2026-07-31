"use client";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  businessScopeAddress,
  getBusinessRoot,
  scopeCameraKey,
  updatePanel,
  updateSurface,
  type IntentDocumentV3,
  type IntentNode,
  type ScopeAddress,
} from "../runtime/model";
import { findPath } from "./tree-utils";

export interface PanelNavigationActionDeps {
  appRoot: IntentNode;
  businessRoot: IntentNode;
  fitOnNextScopeRef: { current: boolean };
  setScopeLegendOpen: (open: boolean) => void;
  setNavigationStack: (stack: ScopeAddress[]) => void;
  setBusinessScopeId: (id: string) => void;
  setSelectedBusinessNodeId: (id: string) => void;
  updateViewDocument: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
}

export function usePanelNavigationActions({
  appRoot,
  businessRoot,
  fitOnNextScopeRef,
  setScopeLegendOpen,
  setNavigationStack,
  setBusinessScopeId,
  setSelectedBusinessNodeId,
  updateViewDocument,
}: PanelNavigationActionDeps) {
  const navigateToBusinessNode = (node: IntentNode) => {
    const path = findPath(businessRoot, node.id) ?? [businessRoot];
    fitOnNextScopeRef.current = true;
    setScopeLegendOpen(false);
    setNavigationStack([
      { domain: "app", nodeId: appRoot.id },
      ...path.map<ScopeAddress>((item) => ({
        domain: "business",
        nodeId: item.id,
        viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
      })),
    ]);
    setBusinessScopeId(node.id);
    setSelectedBusinessNodeId(node.id);
  };

  const selectPanelBusinessNode = (panelId: string, nodeId: string) => {
    updateViewDocument((active) =>
      updatePanel(active, panelId, (panel) => ({
        ...panel,
        selection: {
          nodeIds: [nodeId],
          primaryNodeId: nodeId,
          revision: panel.selection.revision + 1,
        },
      })),
    );
  };

  const navigatePanelBusinessNode = (
    panelId: string,
    containerSurfaceId: string,
    node: IntentNode,
  ) => {
    updateViewDocument((active) => {
      const root = getBusinessRoot(active);
      const path = findPath(root, node.id);
      if (!path) return active;
      const selected = updatePanel(active, panelId, (panel) => ({
        ...panel,
        selection: {
          nodeIds: [node.id],
          primaryNodeId: node.id,
          revision: panel.selection.revision + 1,
        },
      }));
      return updateSurface(selected, panelId, containerSurfaceId, (surface) => {
        if (surface.kind !== "current-container") return surface;
        const targetScope = businessScopeAddress(node.id);
        const targetKey = scopeCameraKey(targetScope);
        return {
          ...surface,
          scope: targetScope,
          navigationStack: path.map((item) => ({
            domain: "business" as const,
            nodeId: item.id,
            viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
          })),
          projections: {
            ...surface.projections,
            [targetKey]: {
              camera: { scale: 1, x: 12, y: 12 },
              nodeLayouts: surface.projections[targetKey]?.nodeLayouts ?? {},
            },
          },
        };
      });
    });
  };

  return {
    navigateToBusinessNode,
    selectPanelBusinessNode,
    navigatePanelBusinessNode,
  };
}
