import { graphRevision, graphNodes } from "../../pip/pip-model.ts";
/** 只负责自由布局画布的窗口树与浮层渲染。 */
import type { PointerEventHandler, RefObject } from "react";
import type { Pip } from "../../pip/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  PipElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow,
} from "../contracts/system-plugin.ts";
import { projectionForInstance } from "../projection/projection-instance.ts";
import { navigationForRoot } from "../projection/projection-routes.ts";
import { PipNodeRenderer } from "../projection/projection-renderer.tsx";
import { SemanticProjection } from "../projection/semantic-projection.tsx";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import type {
  FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";
import { screenToWorld } from "../workspace/view-state.ts";
import type { CreatorChoice } from "./node-creator.tsx";
import { CreatorWindow, creatorFrameAt } from "./creator-window.tsx";
import { ProjectionNavbar } from "./projection-navbar.tsx";
import styles from "./pip-host.module.css";
import type {
  CreationWire,
  CreatorPosition,
} from "./workspace-canvas-pointer.ts";
import { SystemPluginWindowView } from "./system-plugin-window.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import { ProjectionScaleControls } from "./projection-scale-controls.tsx";
import { PipDropZone } from "./pip-drop-zone.tsx";
import { WorkspaceCameraControls } from "./workspace-camera-controls.tsx";

type FreeWorkspaceCanvasProps = {
  creator?: CreatorPosition;
  creatorChoices: CreatorChoice[];
  elements: ElementPluginRegistry;
  execution?: ExecutionContextSnapshot;
  fit: () => void;
  nodeCount: number;
  nodeTypes: NodeTypePluginRegistry;
  normalized: FreeLayoutWorkspaceViews;
  onActivateWindow: (windowId: string) => void;
  onChooseCreator: (choice: CreatorChoice) => void;
  onCloseSystemPlugin: (window: SystemPluginWindow) => void;
  onRequest: (request: PipElementRequest) => void;
  onPipDrop: (files: File[], point: WorkspacePoint) => void;
  onUnsupportedPipDrop: (files: File[]) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
  persistCamera: (camera: FreeLayoutWorkspaceViews["camera"]) => void;
  pointer: {
    begin: PointerEventHandler<HTMLDivElement>;
    cancel: PointerEventHandler<HTMLDivElement>;
    end: PointerEventHandler<HTMLDivElement>;
    move: PointerEventHandler<HTMLDivElement>;
  };
  roots: Pip[];
  scopedSelections: Record<string, string[]>;
  setCreator: (creator: CreatorPosition | undefined) => void;
  status: string;
  systemPlugins: SystemPluginCanvasBridge;
  systemPluginServices: unknown;
  viewport: RefObject<HTMLDivElement | null>;
  views: FreeLayoutWorkspaceViews;
  wire?: CreationWire;
  workspace: WorkspaceSession;
};

export function FreeWorkspaceCanvas({
  creator,
  creatorChoices,
  elements,
  execution,
  fit,
  nodeCount,
  nodeTypes,
  normalized,
  onActivateWindow,
  onChooseCreator,
  onCloseSystemPlugin,
  onRequest,
  onPipDrop,
  onUnsupportedPipDrop,
  onViewsChange,
  persistCamera,
  pointer,
  roots,
  scopedSelections,
  setCreator,
  status,
  systemPlugins,
  systemPluginServices,
  viewport,
  views,
  wire,
  workspace,
}: FreeWorkspaceCanvasProps) {
  return <section className={styles.canvasWrap} data-testid="pip-workspace">
    <div className={styles.canvasInfo} data-workspace-status>
      Pip · revision {graphRevision(workspace.graph)} · {nodeCount} 个节点 · {status}
    </div>
    <PipDropZone
      ref={viewport}
      tabIndex={-1}
      data-canvas-shortcuts
      className={`${styles.canvas} ${styles.freeViewport}`} pointFromScreen={(screen) => screenToWorld(screen, views)} onPipFiles={onPipDrop} onUnsupportedFiles={onUnsupportedPipDrop} onScroll={(event) => {
            event.currentTarget.scrollLeft = 0;
            event.currentTarget.scrollTop = 0;
        }} onPointerDown={pointer.begin} onPointerMove={pointer.move} onPointerUp={pointer.end} onPointerCancel={pointer.cancel}>
      <div className={styles.freeWorld} style={{
            width: views.world.width,
            height: views.world.height,
            transform: `translate(${views.camera.x}px,${views.camera.y}px) scale(${views.camera.scale})`,
        }}>
        {roots.map((node) => {
            const frame = views.projections[node.id];
            const navigation = navigationForRoot(
            node.id,
            workspace.graph,
            nodeTypes,
            frame.navigation,
          );
            const routeNode = navigation && graphNodes(workspace.graph)[navigation.entries[navigation.index]?.projectionNodeId ?? ""];
            const pluginChrome = Boolean(
            routeNode && projectionForInstance(routeNode, nodeTypes.projections())
              ?.windowChrome === "plugin",
          );
            const executionView = frame.execution ?? {
            flowLayerVisible: true,
            followActiveEvent: false,
          };
            const setNavigation = (next: NonNullable<typeof navigation>) => {
            onRequest({
              kind: "set-workspace-window",
              windowId: node.id,
              frame: { ...frame, navigation: next },
            });
          };
            const resetProjection = () => navigation && onViewsChange({
            ...normalized,
            projections: {
              ...normalized.projections,
              [node.id]: {
                ...frame,
                contentOffset: { x: 0, y: 0 },
                navigation: { ...navigation, semanticScale: 1 },
              },
            },
          });
            return <WorkspaceWindow key={node.id} id={node.id} frame={frame} views={views} active={views.activeWindowId === node.id} front={views.frontWindowId === node.id} onActivate={() => onActivateWindow(node.id)} onFrame={(next) => onRequest({
                    kind: "set-workspace-window",
                    windowId: node.id,
                    frame: next,
                })} onClose={() => onRequest({
                    kind: "close-workspace-root",
                    nodeId: node.id,
                })}>
            {navigation
                    ? <div className={`${styles.projectionShell} ${
                pluginChrome ? styles.pluginChrome : ""
              }`}>
                {!pluginChrome && <ProjectionNavbar navigation={navigation} execution={execution} executionView={executionView} graph={workspace.graph} nodeTypes={nodeTypes} onChange={setNavigation}/>}
                <SemanticProjection workspace={workspace} workspaceView={{
                            ...normalized,
                            projections: {
                                ...normalized.projections,
                                [node.id]: { ...frame, navigation },
                            },
                        }} rootWindowId={node.id} navigation={navigation} contentOffset={frame.contentOffset ?? { x: 0, y: 0 }} execution={execution} elements={elements} nodeTypes={nodeTypes} selection={scopedSelections[node.id] ?? workspace.selection} onRequest={onRequest}/>
                <ProjectionScaleControls frame={frame} graph={workspace.graph} navigation={navigation} nodeTypes={nodeTypes} selection={scopedSelections[node.id] ?? workspace.selection} onChange={(next) => onRequest({
                            kind: "set-workspace-window",
                            windowId: node.id,
                            frame: next,
                        })} onFit={resetProjection}/>
              </div>
                    : <PipNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={views} graph={workspace.graph} node={node} selection={scopedSelections[node.id] ?? workspace.selection} purpose="workspace" execution={execution} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest}/>}
          </WorkspaceWindow>;
        })}

        {Object.values(views.systemWindows).map((item) => <SystemPluginWindowView key={item.id} window={item} views={views} plugins={systemPlugins} services={systemPluginServices} surface="workspace" workspace={workspace} active={views.activeWindowId === item.id} front={views.frontWindowId === item.id} onActivate={() => onActivateWindow(item.id)} onFrame={(frame) => onRequest({
                kind: "set-workspace-window",
                windowId: item.id,
                frame,
            })} onClose={() => onCloseSystemPlugin(item)}/>)}

        {creator && <CreatorWindow candidates={creatorChoices} frame={creator.frame ?? creatorFrameAt(creator.world, views)} views={views} onCancel={() => setCreator(undefined)} onChoose={onChooseCreator} onFrame={(frame) => setCreator({ ...creator, frame })}/>}
      </div>

      {wire && <svg className={styles.creationWire}>
        <line x1={wire.from.x} y1={wire.from.y} x2={wire.to.x} y2={wire.to.y}/>
        <circle cx={wire.to.x} cy={wire.to.y} r="5"/>
      </svg>}

      <WorkspaceCameraControls views={views} persistCamera={persistCamera} fit={fit}/>
    </PipDropZone>
  </section>;
}
