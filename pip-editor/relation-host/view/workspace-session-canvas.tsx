/** 把一个明确的 WorkspaceSession 绑定到业务画布，避免活动态串写。 */
import type { RelationRef } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  RelationElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow,
} from "../contracts/system-plugin.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { NodeCanvas } from "./workspace-canvas.tsx";

type WorkspaceSessionCanvasProps = {
  autoFocus: boolean;
  elements: ElementPluginRegistry;
  execution: ExecutionContextSnapshot;
  nodeTypes: NodeTypePluginRegistry;
  systemPlugins: SystemPluginCanvasBridge;
  systemPluginServices: unknown;
  workspace: WorkspaceSession;
  onActivateWindow: (windowId: string) => void;
  onCloseSystemPlugin: (window: SystemPluginWindow) => void;
  onInvokeCreator: (
    creatorId: string,
    point: WorkspacePoint,
    origin?: RelationRef,
  ) => void;
  onOpenSystemPlugin: (pluginId: string, point: WorkspacePoint) => void;
  onRequest: (request: RelationElementRequest) => void;
  onSelectionChange: (selection: string[]) => void;
  onViewsChange: NodeCanvasProps["onViewsChange"];
};

type NodeCanvasProps = Parameters<typeof NodeCanvas>[0];

export function WorkspaceSessionCanvas({
  autoFocus,
  elements,
  execution,
  nodeTypes,
  systemPlugins,
  systemPluginServices,
  workspace,
  onActivateWindow,
  onCloseSystemPlugin,
  onInvokeCreator,
  onOpenSystemPlugin,
  onRequest,
  onSelectionChange,
  onViewsChange,
}: WorkspaceSessionCanvasProps) {
  return <NodeCanvas
    autoFocus={autoFocus}
    workspace={workspace}
    elements={elements}
    nodeTypes={nodeTypes}
    execution={{
      sessions: execution.sessions.filter(
        (item) => item.workspaceId === workspace.id,
      ),
      activeSessionId: execution.activeSessionId,
    }}
    systemPlugins={systemPlugins}
    systemPluginServices={systemPluginServices}
    onSelectionChange={onSelectionChange}
    onRequest={onRequest}
    onViewsChange={onViewsChange}
    onActivateWindow={onActivateWindow}
    onInvokeCreator={onInvokeCreator}
    onOpenSystemPlugin={onOpenSystemPlugin}
    onCloseSystemPlugin={onCloseSystemPlugin}
  />;
}
