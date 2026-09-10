/** 自由工作区相机的缩放和适配控制。 */
import type { FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { WindowScaleControls } from "./workspace-window-chrome.tsx";

type WorkspaceCameraControlsProps = {
  fit: () => void;
  persistCamera: (camera: FreeLayoutWorkspaceViews["camera"]) => void;
  views: FreeLayoutWorkspaceViews;
};

export function WorkspaceCameraControls({
  fit,
  persistCamera,
  views,
}: WorkspaceCameraControlsProps) {
  return <WindowScaleControls
    scale={views.camera.scale}
    onZoomOut={() => persistCamera({
      ...views.camera,
      scale: Math.max(.5, views.camera.scale - .1),
    })}
    onZoomIn={() => persistCamera({
      ...views.camera,
      scale: Math.min(2, views.camera.scale + .1),
    })}
    onFit={fit}
  />;
}

