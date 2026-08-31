/** 只负责自由布局画布的窗口树与浮层渲染。 */
import type { PointerEventHandler, RefObject } from "react";
import type { RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  RelationElementRequest,
} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow,
} from "../contracts/system-plugin.ts";
import { projectionForInstance } from "../projection/projection-instance.ts";
import { navigationForRoot } from "../projection/projection-routes.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import { SemanticProjection } from "../projection/semantic-projection.tsx";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import type {
  FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";
import { NodeCreator, type CreatorChoice } from "./node-creator.tsx";
import { ProjectionNavbar } from "./projection-navbar.tsx";
import styles from "./relation-host.module.css";
import type {
  CreationWire,
  CreatorPosition,
} from "./workspace-canvas-pointer.ts";
import { WorkspaceWindow } from "./workspace-window.tsx";

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
  onRequest: (request: RelationElementRequest) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
  persistCamera: (camera: FreeLayoutWorkspaceViews["camera"]) => void;
  pointer: {
    begin: PointerEventHandler<HTMLDivElement>;
    cancel: PointerEventHandler<HTMLDivElement>;
    end: PointerEventHandler<HTMLDivElement>;
    move: PointerEventHandler<HTMLDivElement>;
  };
  roots: RelationNode[];
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
  const SystemPluginRenderer = systemPlugins.Renderer;
  return <section className={styles.canvasWrap} data-testid="relation-workspace">
    <div className={styles.canvasInfo}>
      RelationGraph · revision {workspace.graph.revision} · {nodeCount} 个节点 · {status}
    </div>
    <div
      ref={viewport}
      tabIndex={-1}
      className={`${styles.canvas} ${styles.freeViewport}`}
      onScroll={(event) => {
        event.currentTarget.scrollLeft = 0;
        event.currentTarget.scrollTop = 0;
      }}
      onPointerDown={pointer.begin}
      onPointerMove={pointer.move}
      onPointerUp={pointer.end}
      onPointerCancel={pointer.cancel}
    >
      <div
        className={styles.freeWorld}
        style={{
          width: views.world.width,
          height: views.world.height,
          transform: `translate(${views.camera.x}px,${views.camera.y}px) scale(${views.camera.scale})`,
        }}
      >
        {roots.map((node) => {
          const frame = views.projections[node.id];
          const navigation = navigationForRoot(
            node.id,
            workspace.graph,
            nodeTypes,
            frame.navigation,
          );
          const routeNode = navigation && workspace.graph.nodes[
            navigation.entries[navigation.index]?.projectionNodeId ?? ""
          ];
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

          return <WorkspaceWindow
            key={node.id}
            id={node.id}
            frame={frame}
            views={views}
            active={views.activeWindowId === node.id}
            front={views.frontWindowId === node.id}
            onActivate={() => onActivateWindow(node.id)}
            onFrame={(next) => onRequest({
              kind: "set-workspace-window",
              windowId: node.id,
              frame: next,
            })}
            onClose={() => onRequest({
              kind: "close-workspace-root",
              nodeId: node.id,
            })}
          >
            {navigation
              ? <div className={`${styles.projectionShell} ${
                pluginChrome ? styles.pluginChrome : ""
              }`}>
                {!pluginChrome && <ProjectionNavbar
                  navigation={navigation}
                  execution={execution}
                  executionView={executionView}
                  graph={workspace.graph}
                  nodeTypes={nodeTypes}
                  onChange={setNavigation}
                  onReset={resetProjection}
                />}
                <SemanticProjection
                  workspace={workspace}
                  workspaceView={{
                    ...normalized,
                    projections: {
                      ...normalized.projections,
                      [node.id]: { ...frame, navigation },
                    },
                  }}
                  rootWindowId={node.id}
                  navigation={navigation}
                  contentOffset={frame.contentOffset ?? { x: 0, y: 0 }}
                  execution={execution}
                  elements={elements}
                  nodeTypes={nodeTypes}
                  selection={scopedSelections[node.id] ?? workspace.selection}
                  onRequest={onRequest}
                />
              </div>
              : <RelationNodeRenderer
                workspaceId={workspace.id}
                rootNodeIds={workspace.rootNodeIds}
                workspaceView={views}
                graph={workspace.graph}
                node={node}
                selection={scopedSelections[node.id] ?? workspace.selection}
                purpose="workspace"
                execution={execution}
                elements={elements}
                nodeTypes={nodeTypes}
                onRequest={onRequest}
              />}
          </WorkspaceWindow>;
        })}

        {Object.values(views.systemWindows).map((item) => <WorkspaceWindow
          key={item.id}
          id={item.id}
          frame={item.frame}
          views={views}
          active={views.activeWindowId === item.id}
          front={views.frontWindowId === item.id}
          onActivate={() => onActivateWindow(item.id)}
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
      </div>

      {wire && <svg className={styles.creationWire}>
        <line
          x1={wire.from.x}
          y1={wire.from.y}
          x2={wire.to.x}
          y2={wire.to.y}
        />
        <circle cx={wire.to.x} cy={wire.to.y} r="5" />
      </svg>}

      {creator && <NodeCreator
        point={creator.screen}
        candidates={creatorChoices}
        onCancel={() => setCreator(undefined)}
        onChoose={onChooseCreator}
      />}

      <div className={styles.cameraControls}>
        <button onClick={() => persistCamera({
          ...views.camera,
          scale: Math.max(.5, views.camera.scale - .1),
        })}>−</button>
        <span>{Math.round(views.camera.scale * 100)}%</span>
        <button onClick={() => persistCamera({
          ...views.camera,
          scale: Math.min(2, views.camera.scale + .1),
        })}>+</button>
        <button onClick={fit}>适应</button>
      </div>
    </div>
  </section>;
}
