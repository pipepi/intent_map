/** 使用普通节点窗口外壳呈现临时 Creator。 */
import type { WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { NodeCreator, type CreatorChoice } from "./node-creator.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import { WindowContentScaleControls } from "./workspace-window-chrome.tsx";

type CreatorWindowProps = {
  candidates: CreatorChoice[];
  frame: WorkspaceWindowFrame;
  views: FreeLayoutWorkspaceViews;
  onCancel: () => void;
  onChoose: (choice: CreatorChoice) => void;
  onFrame: (frame: WorkspaceWindowFrame) => void;
};

export const creatorFrameAt = (
  point: WorkspacePoint,
  views: Pick<FreeLayoutWorkspaceViews, "world">,
): WorkspaceWindowFrame => {
  const width = 420;
  const height = 520;
  return {
    x: Math.max(0, Math.min(views.world.width - width, point.x - width / 2)),
    y: Math.max(0, Math.min(views.world.height - height, point.y - 40)),
    width,
    height,
    resizeMode: "simple",
    contentScale: 1,
  };
};

export function CreatorWindow({
  candidates,
  frame,
  views,
  onCancel,
  onChoose,
  onFrame,
}: CreatorWindowProps) {
  return <WorkspaceWindow
    id="host.transient.creator"
    frame={frame}
    views={views}
    active
    front
    onClose={onCancel}
    onFrame={onFrame}
  >
    <NodeCreator
      candidates={candidates}
      onCancel={onCancel}
      onChoose={onChoose}
    />
    <WindowContentScaleControls
      frame={frame}
      subject="创建器"
      onFrame={onFrame}
    />
  </WorkspaceWindow>;
}
