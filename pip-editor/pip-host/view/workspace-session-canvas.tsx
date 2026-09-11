/** 把一个明确的 WorkspaceSession 绑定到业务画布，避免活动态串写。 */
import type { PipRef } from "../../pip/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  PipElementRequest,
  WorkspacePoint} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow} from "../contracts/system-plugin.ts";
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
    origin?: PipRef,
  ) => void;
  onOpenSystemPlugin: (pluginId: string, point: WorkspacePoint) => void;
  onPipDrop: (files: File[], point: WorkspacePoint) => void;
  onUnsupportedPipDrop: (files: File[]) => void;
  onRequest: (request: PipElementRequest) => void;
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
  onPipDrop,
  onUnsupportedPipDrop,
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
    onPipDrop={onPipDrop}
    onUnsupportedPipDrop={onUnsupportedPipDrop}
    onCloseSystemPlugin={onCloseSystemPlugin}
  />;
}
