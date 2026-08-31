/** 渲染不使用自由布局窗口模型的旧工作区。 */
import { useRef, useState } from "react";
import type { RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  RelationElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow,
} from "../contracts/system-plugin.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import {
  normalizeFreeLayout,
} from "../workspace/view-state.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import { NodeCreator, type CreatorChoice } from "./node-creator.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import styles from "./relation-host.module.css";

type LegacyCanvasProps = {
  creatorChoices: CreatorChoice[];
  elements: ElementPluginRegistry;
  hasWorkspaceProjection: boolean;
  nodeTypes: NodeTypePluginRegistry;
  nodes: RelationNode[];
  onChooseCreator: (choice: CreatorChoice, point: WorkspacePoint) => void;
  onCloseSystemPlugin: (window: SystemPluginWindow) => void;
  onRequest: (request: RelationElementRequest) => void;
  onSelectionChange: (selection: string[]) => void;
  roots: RelationNode[];
  systemPlugins: SystemPluginCanvasBridge;
  systemPluginServices: unknown;
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
  creatorChoices,
  elements,
  hasWorkspaceProjection,
  nodeTypes,
  nodes,
  onChooseCreator,
  onCloseSystemPlugin,
  onRequest,
  onSelectionChange,
  roots,
  systemPlugins,
  systemPluginServices,
  workspace,
}: LegacyCanvasProps) {
  const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
  const SystemPluginRenderer = systemPlugins.Renderer;
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
        onFrame={(frame) => onRequest({
          kind: "set-workspace-window",
          windowId: item.id,
          frame,
        })}
        onClose={() => onCloseSystemPlugin(item)}
      >
        <SystemPluginRenderer
          window={item}
          workspace={workspace}
          services={systemPluginServices}
        />
      </WorkspaceWindow>)}

      {creatorPoint && <NodeCreator
        point={creatorPoint}
        candidates={creatorChoices}
        onCancel={() => setCreatorPoint(undefined)}
        onChoose={(choice) => {
          onChooseCreator(choice, creatorPoint);
          setCreatorPoint(undefined);
        }}
      />}
    </div>
  </section>;
}
