/** 渲染不使用自由布局窗口模型的旧工作区。 */
import { useRef, useState } from "react";
import type { Pip } from "../../pip/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  PipElementRequest,
  WorkspacePoint} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow} from "../contracts/system-plugin.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import {
  normalizeFreeLayout} from "../workspace/view-state.ts";
import { PipNodeRenderer } from "../projection/projection-renderer.tsx";
import type { CreatorChoice } from "./node-creator.tsx";
import { CreatorWindow, creatorFrameAt } from "./creator-window.tsx";
import { SystemPluginWindowView } from "./system-plugin-window.tsx";
import { PipDropZone } from "./pip-drop-zone.tsx";
import styles from "./pip-host.module.css";

type LegacyCanvasProps = {
  creatorChoices: CreatorChoice[];
  elements: ElementPluginRegistry;
  hasWorkspaceProjection: boolean;
  nodeTypes: NodeTypePluginRegistry;
  nodes: Pip[];
  onChooseCreator: (choice: CreatorChoice, point: WorkspacePoint) => void;
  onCloseSystemPlugin: (window: SystemPluginWindow) => void;
  onRequest: (request: PipElementRequest) => void;
  onPipDrop: (files: File[], point: WorkspacePoint) => void;
  onUnsupportedPipDrop: (files: File[]) => void;
  onSelectionChange: (selection: string[]) => void;
  roots: Pip[];
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
  onPipDrop,
  onUnsupportedPipDrop,
  onSelectionChange,
  roots,
  systemPlugins,
  systemPluginServices,
  workspace,
}: LegacyCanvasProps) {
  const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<WorkspacePoint | undefined>(undefined);
  const [creator, setCreator] = useState<{
    point: WorkspacePoint;
    frame?: import("../contracts/package-types.ts").WorkspaceWindowFrame;
  }>();

  return <section
    className={styles.canvasWrap}
    data-testid="pip-workspace"
  >
    <PipDropZone
      ref={canvas}
      tabIndex={-1}
      data-canvas-shortcuts
      className={`${styles.canvas} ${
        hasWorkspaceProjection
          ? styles.workspaceProjectionGrid
          : styles.pipGrid
      }`}
      pointFromScreen={(screen) => screen}
      onPipFiles={onPipDrop}
      onUnsupportedFiles={onUnsupportedPipDrop}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const interactive = target.matches(
          "input,textarea,select,button,a,[contenteditable=true]",
        );
        if (event.code !== "Space" || interactive || event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        setCreator({
          point: {
            x: event.currentTarget.clientWidth / 2,
            y: event.currentTarget.clientHeight / 2,
          },
        });
      }}
      onPointerDown={(event) => {
        const path = event.nativeEvent.composedPath() as HTMLElement[];
        const overNode = path.some((item) => item?.dataset?.nodeId);
        if (!overNode) event.currentTarget.focus({ preventScroll: true });
        if (
          !event.altKey ||
          overNode
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
        if (moved >= 4) setCreator({ point });
      }}
    >
      {hasWorkspaceProjection
        ? roots.map((node) => <article
          key={node.id}
          data-node-id={node.id}
          className={styles.workspaceProjection}
        >
          <PipNodeRenderer
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
          <PipNodeRenderer
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
        这个独立工作区没有 Pip。
      </div>}

      {Object.values(views.systemWindows).map((item) => <SystemPluginWindowView
        key={item.id}
        window={item}
        views={{ ...views, camera: { scale: 1, x: 0, y: 0 } }}
        plugins={systemPlugins}
        services={systemPluginServices}
        surface="workspace"
        workspace={workspace}
        onFrame={(frame) => onRequest({
          kind: "set-workspace-window",
          windowId: item.id,
          frame,
        })}
        onClose={() => onCloseSystemPlugin(item)}
      />)}

      {creator && <CreatorWindow
        candidates={creatorChoices}
        frame={creator.frame ?? creatorFrameAt(creator.point, views)}
        views={{ ...views, camera: { scale: 1, x: 0, y: 0 } }}
        onCancel={() => setCreator(undefined)}
        onChoose={(choice) => {
          onChooseCreator(choice, creator.point);
          setCreator(undefined);
        }}
        onFrame={(frame) => setCreator({ ...creator, frame })}
      />}
    </PipDropZone>
  </section>;
}
