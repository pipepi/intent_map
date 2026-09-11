/** 让所有系统插件复用普通节点的窗口外壳与内容缩放控件。 */
import type { WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginSurface,
  SystemPluginWindow as SystemPluginWindowState,
  SystemPluginWorkspace,
} from "../contracts/system-plugin.ts";
import type { FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { WorkspaceWindow } from "./workspace-window.tsx";
import { WindowContentScaleControls } from "./workspace-window-chrome.tsx";

type SystemPluginWindowProps = {
  active?: boolean;
  front?: boolean;
  plugins: SystemPluginCanvasBridge;
  services: unknown;
  surface: SystemPluginSurface;
  views: FreeLayoutWorkspaceViews;
  window: SystemPluginWindowState;
  workspace?: SystemPluginWorkspace;
  onActivate?: () => void;
  onClose: () => void;
  onFrame: (frame: WorkspaceWindowFrame) => void;
};

export function SystemPluginWindowView({
  active,
  front,
  plugins,
  services,
  surface,
  views,
  window,
  workspace,
  onActivate,
  onClose,
  onFrame,
}: SystemPluginWindowProps) {
  const Renderer = plugins.Renderer;

  return <WorkspaceWindow
    id={window.id}
    frame={window.frame}
    views={views}
    active={active}
    front={front}
    onActivate={onActivate}
    onFrame={onFrame}
    onClose={onClose}
  >
    <Renderer
      window={window}
      surface={surface}
      workspace={workspace}
      services={services}
    />
    {/* 系统插件只提供内容，缩放行为由可信宿主统一管理。 */}
    <WindowContentScaleControls
      frame={window.frame}
      subject="系统插件"
      onFrame={onFrame}
    />
  </WorkspaceWindow>;
}
