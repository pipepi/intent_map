/** 只负责宿主 Tab、桌面和工作区全屏视图之间的呈现切换。 */
import { useEffect, useRef, type DragEvent, type ReactNode } from "react";
import type { WorkspacePoint } from "../contracts/package-types.ts";
import type { ReturnTypeOfSystemPlugins } from "../use-system-plugins.ts";
import {
  tabStripHeightAfterWorkspaceDrop,
  WORKSPACE_TAB_STRIP_HEIGHT,
  type HostCanvasState,
  type HostViewportSize,
  type HostPresentationStore,
} from "../workspace/host-presentation-store.ts";
import { screenToWorld } from "../workspace/view-state.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { HostCanvas } from "./host-canvas.tsx";
import styles from "./pip-host.module.css";
import { WORKSPACE_DRAG_MIME, WorkspaceTabs } from "./workspace-tabs.tsx";

type PipHostSurfaceProps = {
  active?: WorkspaceSession;
  activeWorkspaceId?: string;
  creatorRequest: number;
  focused?: WorkspaceSession;
  host: HostCanvasState;
  hostStore: HostPresentationStore;
  nameFor: (workspace: WorkspaceSession) => string;
  renderWorkspace: (workspace: WorkspaceSession, autoFocus: boolean) => ReactNode;
  systemPlugins: ReturnTypeOfSystemPlugins;
  tabWorkspaces: WorkspaceSession[];
  workspaces: WorkspaceSession[];
  onActivateTab: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (
    point: WorkspacePoint,
    viewport: HostViewportSize,
  ) => void;
  onFocusWorkspace: (workspaceId: string) => void;
  onOpenCreator: () => void;
  onReorder: (workspaceId: string, beforeId?: string) => void;
  onWorkspaceDrop: (
    workspaceId: string,
    point: WorkspacePoint,
    viewport: HostViewportSize,
  ) => void;
};

export function PipHostSurface({
  active,
  activeWorkspaceId,
  creatorRequest,
  focused,
  host,
  hostStore,
  nameFor,
  renderWorkspace,
  systemPlugins,
  tabWorkspaces,
  workspaces,
  onActivateTab,
  onCloseWorkspace,
  onCreateWorkspace,
  onFocusWorkspace,
  onOpenCreator,
  onReorder,
  onWorkspaceDrop,
}: PipHostSurfaceProps) {
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const publishViewport = () => {
      const rect = element.getBoundingClientRect();
      hostStore.setViewport({
        width: rect.width,
        height: rect.height - (
          tabWorkspaces.length ? WORKSPACE_TAB_STRIP_HEIGHT : 0
        ),
      });
    };
    publishViewport();
    const observer = new ResizeObserver(publishViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hostStore, tabWorkspaces.length]);

  const drop = (event: DragEvent<HTMLElement>) => {
    const id = event.dataTransfer.getData(WORKSPACE_DRAG_MIME);
    if (!id || !workspaces.some((item) => item.id === id)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const tabStripHeight = tabStripHeightAfterWorkspaceDrop(
      tabWorkspaces.map((workspace) => workspace.id),
      id,
    );
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - tabStripHeight,
    };
    const point = screenToWorld(screen, {
      kind: "free-layout",
      world: host.world,
      camera: host.camera,
      projections: {},
      systemWindows: host.systemWindows,
    });
    onWorkspaceDrop(id, point, {
      width: rect.width,
      height: rect.height - tabStripHeight,
    });
  };

  return <section
    ref={surface}
    className={`${styles.workspaceArea} ${
      tabWorkspaces.length ? "" : styles.workspaceAreaBare
    }`}
    onDragOver={(event) => {
      if (event.dataTransfer.types.includes(WORKSPACE_DRAG_MIME)) {
        event.preventDefault();
      }
    }}
    onDrop={drop}
  >
    {tabWorkspaces.length > 0 && <WorkspaceTabs
        workspaces={tabWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        nameFor={nameFor}
        onActivate={onActivateTab}
        onClose={onCloseWorkspace}
        onNew={onOpenCreator}
        onReorder={onReorder}
      />}
    {active
      ? renderWorkspace(active, true)
      : <HostCanvas
        creatorRequest={creatorRequest}
        focusedWorkspace={focused}
        host={host}
        hostStore={hostStore}
        renderWorkspace={renderWorkspace}
        systemPlugins={systemPlugins.canvas}
        systemPluginServices={systemPlugins.servicesFor(focused)}
        workspaces={workspaces}
        onCreateWorkspace={onCreateWorkspace}
        onFocusWorkspace={onFocusWorkspace}
        onOpenSystemPlugin={systemPlugins.openHost}
        onPipDrop={systemPlugins.importAtHost}
        onUnsupportedPipDrop={systemPlugins.rejectImport}
        onRestoreWorkspaceTab={onActivateTab}
        onCloseSystemPlugin={systemPlugins.closeHost}
      />}
  </section>;
}
