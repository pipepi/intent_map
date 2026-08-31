/** 让窗口内容把辅助控件投送到通用 WorkspaceWindow 外部控制栏。 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { WorkspaceWindowFrame } from "../contracts/package-types.ts";
import canvasStyles from "./relation-host.module.css";
import windowStyles from "./workspace-window.module.css";

export type WorkspaceWindowChromeTargets = {
  top?: HTMLElement;
  bottom?: HTMLElement;
};

export const WorkspaceWindowChromeContext = createContext<
  WorkspaceWindowChromeTargets | undefined
>(undefined);

export function useWorkspaceWindowChromeTargets() {
  const [targets, setTargets] = useState<WorkspaceWindowChromeTargets>({});
  const setTop = useCallback((element: HTMLSpanElement | null) => {
    setTargets((current) => ({
      ...current,
      top: element ?? undefined,
    }));
  }, []);
  const setBottom = useCallback((element: HTMLSpanElement | null) => {
    setTargets((current) => ({
      ...current,
      bottom: element ?? undefined,
    }));
  }, []);
  return { targets, setTop, setBottom };
}

type WindowScaleControlsProps = {
  scale: number;
  subject?: string;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

type ControlsProps = WindowScaleControlsProps & {
  className: string;
  subject: string;
};

const controls = ({
  className,
  scale,
  subject,
  onFit,
  onZoomIn,
  onZoomOut,
}: ControlsProps): ReactNode => <div className={className}>
  <button
    type="button"
    onClick={onZoomOut}
    aria-label={`缩小${subject}`}
  >−</button>
  <span>{Math.round(scale * 100)}%</span>
  <button
    type="button"
    onClick={onZoomIn}
    aria-label={`放大${subject}`}
  >+</button>
  <button
    type="button"
    onClick={onFit}
    aria-label={`适应${subject}`}
  >适应</button>
</div>;

export function WindowScaleControls({
  scale,
  subject = "工作区",
  onFit,
  onZoomIn,
  onZoomOut,
}: WindowScaleControlsProps) {
  const targets = useContext(WorkspaceWindowChromeContext);
  if (!targets) {
    return controls({
      className: canvasStyles.cameraControls,
      scale,
      subject,
      onFit,
      onZoomIn,
      onZoomOut,
    });
  }

  return <>
    {targets.top && createPortal(controls({
      className: windowStyles.windowCameraControls,
      scale,
      subject,
      onFit,
      onZoomIn,
      onZoomOut,
    }), targets.top)}
    {targets.bottom && createPortal(controls({
      className: windowStyles.windowCameraControls,
      scale,
      subject,
      onFit,
      onZoomIn,
      onZoomOut,
    }), targets.bottom)}
  </>;
}

type WindowContentScaleControlsProps = {
  frame: WorkspaceWindowFrame;
  subject: string;
  onFrame: (frame: WorkspaceWindowFrame) => void;
};

const clampContentScale = (scale: number) => Math.max(
  .5,
  Math.min(2, Math.round(scale * 10) / 10),
);

/** 普通内容窗口统一使用 frame.contentScale，不把外壳状态交给内容组件。 */
export function WindowContentScaleControls({
  frame,
  subject,
  onFrame,
}: WindowContentScaleControlsProps) {
  const scale = frame.contentScale ?? 1;
  const setScale = (next: number) => onFrame({
    ...frame,
    contentScale: clampContentScale(next),
  });

  return <WindowScaleControls
    scale={scale}
    subject={subject}
    onZoomOut={() => setScale(scale - .1)}
    onZoomIn={() => setScale(scale + .1)}
    onFit={() => setScale(1)}
  />;
}
