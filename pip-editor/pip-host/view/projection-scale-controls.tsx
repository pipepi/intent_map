/** 将投影内部缩放统一呈现在普通节点窗口的外部控制栏。 */
import type { Pip } from "../../pip/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ProjectionNavigationState,
  WorkspaceWindowFrame} from "../contracts/package-types.ts";
import { projectionFrameAtScale } from "../projection/projection-scale.ts";
import { WindowScaleControls } from "./workspace-window-chrome.tsx";

type ProjectionScaleControlsProps = {
  frame: WorkspaceWindowFrame;
  graph: Pip;
  navigation: ProjectionNavigationState;
  nodeTypes: NodeTypePluginRegistry;
  selection: string[];
  onChange: (frame: WorkspaceWindowFrame) => void;
  onFit: () => void;
};

export function ProjectionScaleControls({
  frame,
  graph,
  navigation,
  nodeTypes,
  selection,
  onChange,
  onFit,
}: ProjectionScaleControlsProps) {
  const changeScale = (scale: number) => onChange(projectionFrameAtScale(
    frame,
    navigation,
    scale,
    graph,
    nodeTypes,
    selection,
  ));

  return <WindowScaleControls
    scale={navigation.semanticScale}
    subject="投影"
    onZoomOut={() => changeScale(navigation.semanticScale - .1)}
    onZoomIn={() => changeScale(navigation.semanticScale + .1)}
    onFit={onFit}
  />;
}
