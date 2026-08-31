/** 渲染不使用自由布局窗口模型的旧工作区。 */
import { useRef, useState, type ReactNode } from "react";
import type { RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  RelationElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { normalizeFreeLayout } from "../workspace/view-state.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import { NodeCreator } from "./node-creator.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import styles from "./relation-host.module.css";

type LegacyCanvasProps = {
  elements: ElementPluginRegistry;
  hasWorkspaceProjection: boolean;
  nodeTypes: NodeTypePluginRegistry;
  nodes: RelationNode[];
  onClosePluginManager: () => void;
  onOpenPluginManager: (point: WorkspacePoint) => void;
  onRequest: (request: RelationElementRequest) => void;
  onSelectionChange: (selection: string[]) => void;
  pluginManager?: ReactNode;
  roots: RelationNode[];
  workspace: WorkspaceSession;
};

const pointIn = (
  element: HTMLElement,
  clientX: number,
  clientY: number,
): WorkspacePoint => {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

export function LegacyWorkspaceCanvas({
  elements,
  hasWorkspaceProjection,
  nodeTypes,
  nodes,
  onClosePluginManager,
  onOpenPluginManager,
  onRequest,
  onSelectionChange,
  pluginManager,
  roots,
  workspace,
}: LegacyCanvasProps) {
  const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
  const drag = useRef<WorkspacePoint | undefined>(undefined);
  const [creatorPoint, setCreatorPoint] = useState<WorkspacePoint>();

  return <section
    className={styles.canvasWrap}
    data-testid="relation-workspace"
  >
    <div
      className={`${styles.canvas} ${
        hasWorkspaceProjection
          ? styles.workspaceProjectionGrid
          : styles.relationGrid
      }`}
      onPointerDown={(event) => {
        const path = event.nativeEvent.composedPath() as HTMLElement[];
        if (
          !event.altKey ||
          path.some((item) => item?.dataset?.nodeId)
        ) return;

        drag.current = pointIn(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        const point = pointIn(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
        const moved = Math.hypot(
          point.x - drag.current.x,
          point.y - drag.current.y,
        );
        drag.current = undefined;
        if (moved >= 4) setCreatorPoint(point);
      }}
    >
      {hasWorkspaceProjection
        ? roots.map((node) => <article
          key={node.id}
          data-node-id={node.id}
          className={styles.workspaceProjection}
        >
          <RelationNodeRenderer
            workspaceId={workspace.id}
            rootNodeIds={workspace.rootNodeIds}
            workspaceView={workspace.views}
            graph={workspace.graph}
            node={node}
            selection={workspace.selection}
            purpose="workspace"
            elements={elements}
            nodeTypes={nodeTypes}
            onRequest={onRequest}
          />
        </article>)
        : nodes.map((node) => <article
          key={node.id}
          data-node-id={node.id}
          className={`${styles.node} ${
            workspace.selection.includes(node.id) ? styles.selected : ""
          }`}
          onClick={() => onSelectionChange([node.id])}
        >
          <RelationNodeRenderer
            workspaceId={workspace.id}
            rootNodeIds={workspace.rootNodeIds}
            workspaceView={workspace.views}
            graph={workspace.graph}
            node={node}
            selection={workspace.selection}
            elements={elements}
            nodeTypes={nodeTypes}
            onRequest={onRequest}
          />
        </article>)}

      {!nodes.length && <div className={styles.empty}>
        这个独立工作区没有 RelationNode。
      </div>}

      {Object.values(views.systemWindows).map((item) => <WorkspaceWindow
        key={item.id}
        id={item.id}
        frame={item.frame}
        views={{ ...views, camera: { scale: 1, x: 0, y: 0 } }}
        system
        onFrame={(frame) => onRequest({
          kind: "set-workspace-window",
          windowId: item.id,
          frame,
        })}
        onClose={onClosePluginManager}
      >
        {pluginManager}
      </WorkspaceWindow>)}

      {creatorPoint && <NodeCreator
        point={creatorPoint}
        candidates={[{
          id: "host.plugin-manager",
          label: "插件管理器",
          description: "安装、禁用和导出 PIP",
          category: "系统",
          icon: "⚙",
          provider: "system",
        }]}
        onCancel={() => setCreatorPoint(undefined)}
        onChoose={() => {
          onOpenPluginManager(creatorPoint);
          setCreatorPoint(undefined);
        }}
      />}
    </div>
  </section>;
}
