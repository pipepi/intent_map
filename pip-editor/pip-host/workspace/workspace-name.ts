/** 从工作区来源和已安装 A5 catalog 推导用户可读名称。 */
import type { PortableNodeMap } from "../packages/node-map-package.ts";
import type { WorkspaceSession } from "./workspace-store.ts";

export const workspaceName = (
  workspace: WorkspaceSession,
  nodeMaps: PortableNodeMap[],
) => workspace.source.id === "host.new-tab"
  ? "新工作区"
  : nodeMaps.find(
    (item) => item.contentSha256 === workspace.source.contentSha256,
  )?.nodeMap.manifest.name ?? workspace.source.id;
