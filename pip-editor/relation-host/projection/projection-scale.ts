/** 普通投影窗口通过宿主按钮缩放时使用的纯状态转换。 */
import type { RelationGraph } from "../../relation/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ProjectionNavigationState,
  WorkspaceWindowFrame,
} from "../contracts/package-types.ts";
import { zoomWindowContentAt } from "../workspace/view-state.ts";
import { forwardRoute } from "./projection-routes.ts";
import { applySemanticScale } from "./semantic-zoom.ts";

export function projectionFrameAtScale(
  frame: WorkspaceWindowFrame,
  navigation: ProjectionNavigationState,
  scale: number,
  graph: RelationGraph,
  nodeTypes: NodeTypePluginRegistry,
  selection: string[],
): WorkspaceWindowFrame {
  const forward = forwardRoute(
    navigation,
    graph,
    nodeTypes,
    undefined,
    selection[0],
  );
  const nextNavigation = applySemanticScale(navigation, scale, forward);
  const nextFrame = {
    ...frame,
    navigation: nextNavigation,
  };

  if (nextNavigation.index !== navigation.index) return nextFrame;
  return zoomWindowContentAt(
    nextFrame,
    {
      x: frame.width / 2,
      y: frame.height / 2,
    },
    navigation.semanticScale,
    nextNavigation.semanticScale,
  );
}
