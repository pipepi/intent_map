/** 管理不进入业务 RelationGraph 的宿主桌面布局。 */
import type { WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { SystemPluginWindow } from "../contracts/system-plugin.ts";

export type WorkspacePresentationMode = "tab" | "window";
export type WorkspaceWindowAnchor = "center" | "top-left";
export type HostViewportSize = { width: number; height: number };

export type WorkspaceHostWindow = {
  id: string;
  workspaceId: string;
  frame: WorkspaceWindowFrame;
};

export type HostCanvasState = {
  world: { width: number; height: number };
  camera: { scale: number; x: number; y: number };
  workspaceWindows: Record<string, WorkspaceHostWindow>;
  systemWindows: Record<string, SystemPluginWindow>;
  activeWindowId?: string;
  frontWindowId?: string;
};

const DEFAULT_FRAME = {
  width: 1120,
  height: 720,
  resizeMode: "full" as const,
};
const VIEWPORT_MARGIN = 64;
export const WORKSPACE_TAB_STRIP_HEIGHT = 42;

/** 拖放完成后若已无固定 Tab，宿主画布会立即占满原 Tab 栏区域。 */
export const tabStripHeightAfterWorkspaceDrop = (
  workspaceIds: string[],
  droppedWorkspaceId: string,
) => workspaceIds.some((workspaceId) => workspaceId !== droppedWorkspaceId)
  ? WORKSPACE_TAB_STRIP_HEIGHT
  : 0;

export const createHostCanvasState = (): HostCanvasState => ({
  world: { width: 2600, height: 1600 },
  camera: { scale: 1, x: 0, y: 0 },
  workspaceWindows: {},
  systemWindows: {},
});

const centeredFrame = (
  state: HostCanvasState,
  point: WorkspacePoint,
  base: Pick<WorkspaceWindowFrame, "width" | "height" | "resizeMode">,
): WorkspaceWindowFrame => ({
  ...base,
  x: Math.max(
    0,
    Math.min(state.world.width - base.width, point.x - base.width / 2),
  ),
  y: Math.max(
    0,
    Math.min(state.world.height - base.height, point.y - base.height / 2),
  ),
  contentScale: 1,
});

const frameAtPoint = (
  point: WorkspacePoint,
  base: Pick<WorkspaceWindowFrame, "width" | "height" | "resizeMode">,
): WorkspaceWindowFrame => ({
  ...base,
  x: point.x,
  y: point.y,
  resizeMode: "full",
  contentScale: 1,
});

const workspaceFrameForViewport = (
  state: HostCanvasState,
  viewport?: HostViewportSize,
) => {
  if (!viewport) return DEFAULT_FRAME;
  // 边距按屏幕像素计算，再换算为宿主世界尺寸。
  const availableWidth = (
    viewport.width - VIEWPORT_MARGIN * 2
  ) / state.camera.scale;
  const availableHeight = (
    viewport.height - VIEWPORT_MARGIN * 2
  ) / state.camera.scale;
  return {
    ...DEFAULT_FRAME,
    width: Math.max(360, Math.min(DEFAULT_FRAME.width, availableWidth)),
    height: Math.max(420, Math.min(DEFAULT_FRAME.height, availableHeight)),
  };
};

const visibleCenter = (
  state: HostCanvasState,
  viewport?: HostViewportSize,
): WorkspacePoint => {
  if (!viewport) return { x: 650, y: 440 };
  return {
    x: (viewport.width / 2 - state.camera.x) / state.camera.scale,
    y: (viewport.height / 2 - state.camera.y) / state.camera.scale,
  };
};

export class HostPresentationStore {
  #value: HostCanvasState;
  #viewport?: HostViewportSize;
  readonly #publish: (state: HostCanvasState) => void;

  constructor(publish: (state: HostCanvasState) => void) {
    this.#value = createHostCanvasState();
    this.#publish = publish;
  }

  snapshot() {
    return this.#value;
  }

  #replace(next: HostCanvasState) {
    this.#value = next;
    this.#publish(next);
  }

  setCamera(camera: HostCanvasState["camera"]) {
    this.#replace({ ...this.#value, camera: structuredClone(camera) });
  }

  /** 可视区域只辅助新窗口布局，不属于需要发布或导出的宿主布局。 */
  setViewport(viewport: HostViewportSize) {
    if (
      Number.isFinite(viewport.width) &&
      Number.isFinite(viewport.height) &&
      viewport.width > 0 &&
      viewport.height > 0
    ) {
      this.#viewport = { ...viewport };
    }
  }

  presentWorkspace(
    workspaceId: string,
    point?: WorkspacePoint,
    anchor: WorkspaceWindowAnchor = "center",
    viewport?: HostViewportSize,
  ) {
    const id = `host.workspace.${workspaceId}`;
    const existing = this.#value.workspaceWindows[workspaceId];
    const base = existing?.frame ?? workspaceFrameForViewport(
      this.#value,
      viewport ?? this.#viewport,
    );
    const target = point ?? visibleCenter(
      this.#value,
      viewport ?? this.#viewport,
    );
    // 宿主工作区窗口默认开放八向缩放；Tab 拖入时还以释放点为左上角。
    // 已存在窗口再次呈现时，居中分支会保留用户最后选择的缩放模式。
    const frame = anchor === "top-left"
      ? frameAtPoint(target, base)
      : centeredFrame(this.#value, target, base);
    this.#replace({
      ...this.#value,
      workspaceWindows: {
        ...this.#value.workspaceWindows,
        [workspaceId]: { id, workspaceId, frame },
      },
      activeWindowId: id,
      frontWindowId: id,
    });
  }

  restoreWorkspaceTab(workspaceId: string) {
    const workspaceWindows = { ...this.#value.workspaceWindows };
    const windowId = workspaceWindows[workspaceId]?.id;
    delete workspaceWindows[workspaceId];
    this.#replace({
      ...this.#value,
      workspaceWindows,
      activeWindowId: this.#value.activeWindowId === windowId
        ? undefined
        : this.#value.activeWindowId,
      frontWindowId: this.#value.frontWindowId === windowId
        ? undefined
        : this.#value.frontWindowId,
    });
  }

  removeWorkspace(workspaceId: string) {
    this.restoreWorkspaceTab(workspaceId);
  }

  setWindow(windowId: string, frame: WorkspaceWindowFrame) {
    const workspace = Object.values(this.#value.workspaceWindows).find(
      (item) => item.id === windowId,
    );
    if (workspace) {
      this.#replace({
        ...this.#value,
        workspaceWindows: {
          ...this.#value.workspaceWindows,
          [workspace.workspaceId]: { ...workspace, frame },
        },
      });
      return;
    }
    const system = this.#value.systemWindows[windowId];
    if (!system) throw new Error(`Unknown host window ${windowId}`);
    this.#replace({
      ...this.#value,
      systemWindows: {
        ...this.#value.systemWindows,
        [windowId]: { ...system, frame },
      },
    });
  }

  activateWindow(windowId: string) {
    this.#replace({
      ...this.#value,
      activeWindowId: windowId,
      frontWindowId: windowId,
    });
  }

  clearActiveWindow() {
    this.#replace({ ...this.#value, activeWindowId: undefined });
  }

  openSystemWindow(
    window: Omit<SystemPluginWindow, "frame">,
    point: WorkspacePoint,
    defaultFrame: Pick<WorkspaceWindowFrame, "width" | "height" | "resizeMode">,
  ) {
    const existing = this.#value.systemWindows[window.id];
    const frame = centeredFrame(
      this.#value,
      point,
      existing?.frame ?? defaultFrame,
    );
    this.#replace({
      ...this.#value,
      systemWindows: {
        ...this.#value.systemWindows,
        [window.id]: { ...window, frame },
      },
      activeWindowId: window.id,
      frontWindowId: window.id,
    });
  }

  closeSystemWindow(windowId: string) {
    const systemWindows = { ...this.#value.systemWindows };
    delete systemWindows[windowId];
    this.#replace({
      ...this.#value,
      systemWindows,
      activeWindowId: this.#value.activeWindowId === windowId
        ? undefined
        : this.#value.activeWindowId,
      frontWindowId: this.#value.frontWindowId === windowId
        ? undefined
        : this.#value.frontWindowId,
    });
  }
}
