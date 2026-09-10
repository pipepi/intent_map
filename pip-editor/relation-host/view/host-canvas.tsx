/** 渲染永久存在、且与业务 RelationGraph 隔离的宿主桌面。 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkspacePoint } from "../contracts/package-types.ts";
import type { SystemPluginCanvasBridge } from "../contracts/system-plugin.ts";
import type {
  HostCanvasState,
  HostViewportSize,
  HostPresentationStore,
} from "../workspace/host-presentation-store.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { screenToWorld, type FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { CreatorWindow, creatorFrameAt } from "./creator-window.tsx";
import type { CreatorChoice } from "./node-creator.tsx";
import styles from "./relation-host.module.css";
import {
  useWorkspaceCanvasPointer,
  type CreationWire,
  type CreatorPosition,
} from "./workspace-canvas-pointer.ts";
import { SystemPluginWindowView } from "./system-plugin-window.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import { PipDropZone } from "./pip-drop-zone.tsx";

type HostCanvasProps = {
  creatorRequest: number;
  focusedWorkspace?: WorkspaceSession;
  host: HostCanvasState;
  hostStore: HostPresentationStore;
  renderWorkspace: (workspace: WorkspaceSession, focused: boolean) => ReactNode;
  systemPlugins: SystemPluginCanvasBridge;
  systemPluginServices: unknown;
  workspaces: WorkspaceSession[];
  onCreateWorkspace: (
    point: WorkspacePoint,
    viewport: HostViewportSize,
  ) => void;
  onFocusWorkspace: (workspaceId: string) => void;
  onOpenSystemPlugin: (pluginId: string, point: WorkspacePoint) => void;
  onRestoreWorkspaceTab: (workspaceId: string) => void;
  onCloseSystemPlugin: (windowId: string) => void;
  onPipDrop: (files: File[], point: WorkspacePoint) => void;
  onUnsupportedPipDrop: (files: File[]) => void;
};

export function HostCanvas({
  creatorRequest,
  focusedWorkspace,
  host,
  hostStore,
  renderWorkspace,
  systemPlugins,
  systemPluginServices,
  workspaces,
  onCreateWorkspace,
  onFocusWorkspace,
  onOpenSystemPlugin,
  onRestoreWorkspaceTab,
  onCloseSystemPlugin,
  onPipDrop,
  onUnsupportedPipDrop,
}: HostCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [previewCamera, setPreviewCamera] = useState<HostCanvasState["camera"]>();
  const [creator, setCreator] = useState<CreatorPosition>();
  const [wire, setWire] = useState<CreationWire>();
  const camera = previewCamera ?? host.camera;
  const views = useMemo<FreeLayoutWorkspaceViews>(() => ({
    kind: "free-layout",
    world: host.world,
    camera,
    projections: {},
    systemWindows: host.systemWindows,
    activeWindowId: host.activeWindowId,
    frontWindowId: host.frontWindowId,
  }), [camera, host]);

  const persistCamera = (next: HostCanvasState["camera"]) => {
    setPreviewCamera(undefined);
    hostStore.setCamera(next);
  };
  const pointer = useWorkspaceCanvasPointer({
    free: true,
    onViewsChange: (next) => {
      hostStore.setCamera(next.camera);
      hostStore.clearActiveWindow();
    },
    persistCamera,
    previewCamera,
    setCreator,
    setPreviewCamera,
    setWire,
    viewport,
    views,
  });
  const choices: CreatorChoice[] = [
    {
      id: "host.create-workspace",
      label: "创建工作区",
      description: "创建独立的空白 RelationGraph 工作区",
      category: "工作区",
      icon: "◇",
      provider: "host",
    },
    ...systemPlugins.creatorChoices("host", focusedWorkspace),
  ];

  useEffect(() => {
    viewport.current?.focus({ preventScroll: true });
  }, []);

  const openCreatorAtCenter = () => {
    const element = viewport.current;
    if (!element) return;
    const screen = {
      x: element.clientWidth / 2,
      y: element.clientHeight / 2,
    };
    setCreator({ screen, world: screenToWorld(screen, views) });
  };

  const viewportSize = (): HostViewportSize => ({
    width: viewport.current?.clientWidth ?? 0,
    height: viewport.current?.clientHeight ?? 0,
  });

  useEffect(() => {
    if (creatorRequest > 0) openCreatorAtCenter();
    // 该计数器只表示外部新请求，不应因相机变化重复打开。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorRequest]);

  return <section className={styles.canvasWrap} data-testid="host-canvas">
    <PipDropZone
      ref={viewport}
      tabIndex={-1}
      data-canvas-shortcuts
      className={`${styles.canvas} ${styles.freeViewport}`}
      pointFromScreen={(screen) => screenToWorld(screen, views)}
      onPipFiles={onPipDrop}
      onUnsupportedFiles={onUnsupportedPipDrop}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        // 嵌套工作区拥有自己的快捷键；宿主只处理直接发生在宿主画布的事件。
        const owner = target.closest("[data-canvas-shortcuts]");
        if (owner !== event.currentTarget) return;
        const interactive = target.matches(
          "input,textarea,select,button,a,[contenteditable=true]",
        );
        if (event.code === "Space" && !interactive && !event.repeat) {
          event.preventDefault();
          openCreatorAtCenter();
        }
        if (event.key === "Escape") {
          setCreator(undefined);
          setWire(undefined);
        }
      }}
      onWheel={(event) => {
        const target = event.target as HTMLElement;
        const canvasOwner = target.closest("[data-canvas-shortcuts]");
        const path = event.nativeEvent.composedPath() as HTMLElement[];
        // 内层工作区拥有自己的相机；普通窗口内容则保留原生滚动。
        if (
          canvasOwner !== event.currentTarget ||
          path.some((item) => item?.dataset?.nodeId)
        ) return;
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const rect = event.currentTarget.getBoundingClientRect();
          const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          const world = screenToWorld(point, views);
          const scale = Math.max(.5, Math.min(2, camera.scale - event.deltaY * .002));
          persistCamera({
            scale,
            x: point.x - world.x * scale,
            y: point.y - world.y * scale,
          });
        } else {
          persistCamera({
            ...camera,
            x: camera.x - event.deltaX,
            y: camera.y - event.deltaY,
          });
        }
      }}
      onPointerDown={pointer.begin}
      onPointerMove={pointer.move}
      onPointerUp={pointer.end}
      onPointerCancel={pointer.cancel}
    >
      <div
        className={styles.freeWorld}
        style={{
          width: host.world.width,
          height: host.world.height,
          transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
        }}
      >
        {Object.values(host.workspaceWindows).map((item) => {
          const workspace = workspaces.find((value) => value.id === item.workspaceId);
          if (!workspace) return null;
          const focused = host.activeWindowId === item.id;
          return <WorkspaceWindow
            key={item.id}
            id={item.id}
            frame={item.frame}
            views={views}
            active={focused}
            front={host.frontWindowId === item.id}
            onActivate={() => {
              hostStore.activateWindow(item.id);
              onFocusWorkspace(workspace.id);
            }}
            onFrame={(frame) => hostStore.setWindow(item.id, frame)}
            onClose={() => onRestoreWorkspaceTab(workspace.id)}
          >
            {renderWorkspace(workspace, focused)}
          </WorkspaceWindow>;
        })}

        {Object.values(host.systemWindows).map((item) => <SystemPluginWindowView
          key={item.id}
          window={item}
          views={views}
          plugins={systemPlugins}
          services={systemPluginServices}
          surface="host"
          workspace={focusedWorkspace}
          active={host.activeWindowId === item.id}
          front={host.frontWindowId === item.id}
          onActivate={() => hostStore.activateWindow(item.id)}
          onFrame={(frame) => hostStore.setWindow(item.id, frame)}
          onClose={() => onCloseSystemPlugin(item.id)}
        />)}

        {creator && <CreatorWindow
          candidates={choices}
          frame={creator.frame ?? creatorFrameAt(creator.world, views)}
          views={views}
          onCancel={() => setCreator(undefined)}
          onChoose={(choice) => {
            if (choice.provider === "host") {
              onCreateWorkspace(creator.world, viewportSize());
            } else {
              onOpenSystemPlugin(choice.id, creator.world);
            }
            setCreator(undefined);
          }}
          onFrame={(frame) => setCreator({ ...creator, frame })}
        />}
      </div>

      {wire && <svg className={styles.creationWire}>
        <line x1={wire.from.x} y1={wire.from.y} x2={wire.to.x} y2={wire.to.y} />
        <circle cx={wire.to.x} cy={wire.to.y} r="5" />
      </svg>}
    </PipDropZone>
  </section>;
}
