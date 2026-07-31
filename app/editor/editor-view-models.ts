import { MINIMIZED_NODE_SIZE } from "../runtime/node-renderer";
import type { IntentNode } from "../runtime/model";
import type { BusinessScopeLayerDeps } from "./business-scope-layer";
import type { EdgeRendererDeps } from "./edge-renderer";

export const createBusinessLayerModel = (
  model: BusinessScopeLayerDeps,
): BusinessScopeLayerDeps => model;

export const createEdgeRendererModel = (
  model: EdgeRendererDeps,
): EdgeRendererDeps => model;

export interface CanvasDerivedModelOptions {
  scopeWorldSize: { width: number; height: number };
  scopeMinimized: boolean;
  navigationDepth: number;
  scopeNode: IntentNode;
  isBusinessScope: boolean;
  businessPipeCount: number;
  appPipeCount: number;
}

export function createCanvasDerivedModel({
  scopeWorldSize,
  scopeMinimized,
  navigationDepth,
  scopeNode,
  isBusinessScope,
  businessPipeCount,
  appPipeCount,
}: CanvasDerivedModelOptions) {
  const focusedLeaf = navigationDepth > 1 && !scopeNode.children?.length;
  return {
    worldSize: scopeWorldSize,
    renderedWorldSize: scopeMinimized ? MINIMIZED_NODE_SIZE : scopeWorldSize,
    focusedLeaf,
    canAddRuntimeChild:
      !isBusinessScope &&
      scopeNode.implementation?.key !== "current-container" &&
      focusedLeaf,
    derivedPipeCount: isBusinessScope ? businessPipeCount : appPipeCount,
  };
}
