/** A5 egress: serializes the current workspace as a thin or portable Node Map PIP. */
import type { NodeMap } from "../contracts/package-types.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { encodeNodeMapPackage, type PortableNodeMap } from "./node-map-package.ts";
import { exportedWorkspaceViews } from "../workspace/view-state.ts";

export type ExportNodeMapOptions = {
  source: PortableNodeMap;
  portable?: boolean;
};

export function exportNodeMap(workspace: WorkspaceSession, options: ExportNodeMapOptions) {
  const nodeMap: NodeMap = {
    manifest: structuredClone(options.source.nodeMap.manifest),
    graph: structuredClone(workspace.graph),
    workspace: { views: exportedWorkspaceViews(workspace.views), initialSelection: [...workspace.selection] },
  };
  return encodeNodeMapPackage({
    nodeMap,
    nodeTypes: options.portable === false ? [] : options.source.nodeTypes,
    elementPlugins: options.portable === false ? [] : options.source.elementPlugins,
    runtimePackages: options.portable === false ? [] : options.source.runtimePackages,
  });
}

export async function exportNativeNodeMap(a5Bytes: Uint8Array): Promise<Blob> {
  const response = await fetch("/__pip/export-native", {
    method: "POST",
    headers: { "content-type": "application/vnd.intent-map.pip" },
    body: Uint8Array.from(a5Bytes).buffer,
  });
  if (!response.ok) throw new Error(await response.text() || "当前宿主不支持原生 Node Map 导出");
  return response.blob();
}
