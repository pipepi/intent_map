/** RelationHost 的领域动作：串行执行命令，并分发 A3 发出的宿主请求。 */
import type { JsonValue, RelationRef } from "../relation/index.ts";
import type { NodeTypePluginRegistry } from "./activation/node-type-registry.ts";
import type {
  RelationElementRequest,
  WorkspacePoint,
} from "./contracts/package-types.ts";
import type { ExecutionSessionManager } from "./execution/session-manager.ts";
import { presentedProjections } from "./projection/projection-instance.ts";
import {
  currentRoute,
  navigateProjection,
} from "./projection/projection-navigation.ts";
import {
  navigationForRoot,
  routeForProjection,
} from "./projection/projection-routes.ts";
import { normalizeFreeLayout } from "./workspace/view-state.ts";
import type {
  WorkspaceSession,
  WorkspaceSessionStore,
} from "./workspace/workspace-store.ts";

type CreatorInvoker = (
  creatorId: string,
  point: WorkspacePoint,
  input?: JsonValue,
  origin?: RelationRef,
) => Promise<void>;

type DispatchContext = {
  active: WorkspaceSession;
  commandQueues: Map<string, Promise<void>>;
  executionManager: ExecutionSessionManager;
  invokeCreator: CreatorInvoker;
  nodeTypes: NodeTypePluginRegistry;
  workspaceStore: WorkspaceSessionStore;
};

/**
 * 同一工作区中的 A4 command 必须串行执行。
 *
 * 每个 command 都从队列真正开始执行时读取最新图快照，避免两个异步命令
 * 同时基于同一个 revision 生成互相冲突的 RelationPatch。
 */
async function runCommand(
  request: Extract<RelationElementRequest, { kind: "command" }>,
  context: DispatchContext,
) {
  const { active, commandQueues, nodeTypes, workspaceStore } = context;
  const workspaceId = active.id;
  const previous = commandQueues.get(workspaceId) ?? Promise.resolve();

  const queued = previous.catch(() => undefined).then(async () => {
    const snapshot = workspaceStore
      .list()
      .find((workspace) => workspace.id === workspaceId);
    if (!snapshot) {
      throw new Error(`Unknown workspace ${workspaceId}`);
    }

    const command = nodeTypes.commands().get(request.commandId);
    if (!command) {
      throw new Error(`Unknown relation command ${request.commandId}`);
    }

    const patch = await command(request.input, snapshot.graph);
    workspaceStore.commitPatch(
      workspaceId,
      patch,
      nodeTypes.validators(),
    );
  });

  commandQueues.set(workspaceId, queued);
  try {
    await queued;
  } finally {
    if (commandQueues.get(workspaceId) === queued) {
      commandQueues.delete(workspaceId);
    }
  }
}

/** A3 只能表达请求；真正的图、窗口和执行状态修改统一由宿主完成。 */
export async function dispatchRelationElementRequest(
  request: RelationElementRequest,
  context: DispatchContext,
) {
  const {
    active,
    executionManager,
    invokeCreator,
    nodeTypes,
    workspaceStore,
  } = context;
  const workspaceId = active.id;

  switch (request.kind) {
    case "apply-patch":
      workspaceStore.commitPatch(
        workspaceId,
        request.patch,
        nodeTypes.validators(),
      );
      return;

    case "select":
      workspaceStore.select(workspaceId, request.nodeIds, request.scopeId);
      return;

    case "set-workspace-window":
      workspaceStore.setWindow(workspaceId, request.windowId, request.frame);
      return;

    case "set-execution-view": {
      const views = normalizeFreeLayout(active.views, active.rootNodeIds);
      const frame = views.projections[request.windowId];
      if (!frame) {
        throw new Error(`Unknown projection window ${request.windowId}`);
      }
      workspaceStore.setWindow(workspaceId, request.windowId, {
        ...frame,
        execution: structuredClone(request.state),
      });
      return;
    }

    case "close-workspace-root":
      workspaceStore.closeProjectionRoot(workspaceId, request.nodeId);
      return;

    case "navigate-projection": {
      const views = normalizeFreeLayout(active.views, active.rootNodeIds);
      const windowId = views.activeWindowId;
      const frame = windowId ? views.projections[windowId] : undefined;
      if (!windowId || !frame) {
        throw new Error(
          "Projection navigation requires an active workspace window",
        );
      }

      const navigation = navigationForRoot(
        windowId,
        active.graph,
        nodeTypes,
        frame.navigation,
      );
      const route = navigation ? currentRoute(navigation) : undefined;
      const parent = route
        ? active.graph.nodes[route.projectionNodeId]
        : undefined;
      const isPresentedChild = parent
        ? presentedProjections(parent, active.graph).some(
          ({ projectionNodeId }) =>
            projectionNodeId === request.projectionNodeId,
        )
        : false;

      if (
        !navigation ||
        route?.scope !== "children" ||
        !parent ||
        !isPresentedChild
      ) {
        throw new Error(
          "Projection is not a direct child of the active internal view",
        );
      }

      const target = routeForProjection(
        request.projectionNodeId,
        active.graph,
        nodeTypes,
        {
          parentInternalProjectionId: parent.id,
          childProjectionId: request.projectionNodeId,
        },
      );
      if (!target) {
        throw new Error("Projection cannot be promoted to self-workspace");
      }

      workspaceStore.setWindow(workspaceId, windowId, {
        ...frame,
        navigation: navigateProjection(navigation, target),
      });
      return;
    }

    case "invoke-creator":
      await invokeCreator(
        request.creatorId,
        request.worldPosition,
        request.input,
        request.origin,
      );
      return;

    case "command":
      await runCommand(request, context);
      return;

    case "start-execution": {
      const sessionId = await executionManager.start({
        workspaceId,
        graph: active.graph,
        targetNodeId: request.targetNodeId,
        triggerNodeId: request.triggerNodeId,
        value: request.input,
        continuous: request.continuous,
      });
      const views = normalizeFreeLayout(active.views, active.rootNodeIds);
      const windowId = views.activeWindowId;
      const frame = windowId ? views.projections[windowId] : undefined;
      if (windowId && frame) {
        workspaceStore.setWindow(workspaceId, windowId, {
          ...frame,
          execution: {
            ...(frame.execution ?? {
              flowLayerVisible: true,
              followActiveEvent: false,
            }),
            sessionId,
          },
        });
      }
      return;
    }

    case "push-execution-frame":
      await executionManager.push(request.sessionId, request.input);
      return;

    case "close-execution-input":
      executionManager.close(request.sessionId);
      return;

    case "cancel-execution":
      executionManager.cancel(request.sessionId);
      return;

    case "persist-execution-result":
      workspaceStore.commitPatch(
        workspaceId,
        executionManager.persistencePatch(
          request.sessionId,
          active.graph.revision,
        ),
        nodeTypes.validators(),
      );
  }
}
