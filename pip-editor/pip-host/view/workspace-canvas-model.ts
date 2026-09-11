import { graphNodes } from "../../pip/pip-model.ts";
/** 计算工作区画布的投影状态和 Creator 候选项。 */
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import { projectionForInstance } from "../projection/projection-instance.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import type { SystemPluginCanvasBridge } from "../contracts/system-plugin.ts";
import type { CreatorChoice } from "./node-creator.tsx";
import type { CreatorPosition } from "./workspace-canvas-pointer.ts";

export const workspaceHasProjection = (
  workspace: WorkspaceSession,
  nodeTypes: NodeTypePluginRegistry) => workspace.rootNodeIds.some((nodeId) => {
  const node = graphNodes(workspace.graph)[nodeId];
  if (!node) return false;
  if (projectionForInstance(node, nodeTypes.projections())) return true;
  return nodeTypes.projections().some((projection) => {
    if (projection.purpose !== "workspace") return false;
    try {
      return projection.matches(node, workspace.graph);
    } catch {
      return true;
    }
  });
});

export function workspaceSelectionStatus(
  workspace: WorkspaceSession,
  nodeTypes: NodeTypePluginRegistry,
  hasWorkspaceProjection: boolean) {
  const displayName = (nodeId: string) => {
    const node = graphNodes(workspace.graph)[nodeId];
    if (!node) return nodeId;
    for (const descriptor of nodeTypes.types()) {
      try {
        if (!descriptor.matches?.(node, workspace.graph)) continue;
        const label = descriptor.label?.(node, workspace.graph).trim();
        if (label) return label;
      } catch {
        continue;
      }
    }
    return nodeId;
  };

  if (!hasWorkspaceProjection) {
    return `${workspace.selection.length} 个已选`;
    }
    const selections = workspace.scopedSelections ?? {};
    return workspace.rootNodeIds.map((nodeId) => `${displayName(nodeId)} → ${
      selections[nodeId]?.map(displayName).join(", ") || "未选择"
    }`).join(" · ");
}
export function workspaceCreatorChoices(
  workspace: WorkspaceSession,
  nodeTypes: NodeTypePluginRegistry,
  systemPlugins: SystemPluginCanvasBridge,
  creator?: CreatorPosition,
): CreatorChoice[] {
  const systemChoices: CreatorChoice[] = systemPlugins.creatorChoices(
    "workspace",
    workspace,
  );
  const nodeChoices = nodeTypes.creators().filter((item) => {
    try {
      return item.accepts({
        workspaceId: workspace.id,
        graph: workspace.graph,
        rootNodeIds: workspace.rootNodeIds,
        worldPosition: creator?.world ?? { x: 0, y: 0 },
        origin: creator?.origin,
      });
    } catch {
      return false;
    }
  }).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    category: item.category,
    icon: item.icon,
    provider: "node-type" as const,
  }));
  return [...systemChoices, ...nodeChoices];
}
