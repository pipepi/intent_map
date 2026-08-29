import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ExecutionContextSnapshot, ProjectionNavigationState, RelationElementRequest, WorkspacePoint } from "../contracts/package-types.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import type { JsonValue } from "../../relation/index.ts";
import { currentRoute } from "./projection-navigation.ts";
import { projectionForInstance } from "./projection-instance.ts";
import { forwardRoute } from "./projection-routes.ts";
import { semanticProgress } from "./semantic-zoom.ts";
import { RelationNodeRenderer } from "./projection-renderer.tsx";
import { workspaceProjectionContext } from "./projection-context.ts";
import styles from "../view/relation-host.module.css";

type FlipFrame = { key: string; x: number; y: number; scaleX: number; scaleY: number; viewportWidth: number; viewportHeight: number };
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function SemanticProjection({ workspace, workspaceView, rootWindowId, navigation, contentOffset, execution, elements, nodeTypes, selection, onRequest }: {
  workspace: WorkspaceSession; rootWindowId: string; navigation: ProjectionNavigationState; elements: ElementPluginRegistry;
  workspaceView: JsonValue; contentOffset: WorkspacePoint; nodeTypes: NodeTypePluginRegistry; selection: string[]; onRequest: (request: RelationElementRequest) => void;
  execution?: ExecutionContextSnapshot;
}) {
  const viewport = useRef<HTMLDivElement>(null), [flip, setFlip] = useState<FlipFrame>();
  const route = currentRoute(navigation), current = workspace.graph.nodes[route.projectionNodeId];
  const forward = forwardRoute(navigation, workspace.graph, nodeTypes, navigation.semanticTargetProjectionId, selection[0]);
  const reverse = navigation.index > 0 ? navigation.entries[navigation.index - 1] : undefined;
  // Prepare the target before crossfade begins so custom elements and SVG do not mount on the threshold frame.
  const transition = navigation.semanticScale > 1.4 ? forward : navigation.semanticScale < .75 ? reverse : undefined;
  const transitionActive = Boolean(transition);
  const progress = semanticProgress(navigation.semanticScale);
  const semanticOrigin = navigation.semanticOrigin, pointerOrigin = semanticOrigin ? `${semanticOrigin.x}px ${semanticOrigin.y}px` : "center";
  const transitionKey = transition ? `${route.projectionNodeId}->${transition.projectionNodeId}` : "";
  const forwardFlip = navigation.semanticScale > 1;
  const flipChildId = forwardFlip ? transition?.enteredFrom?.childProjectionId : route.enteredFrom?.childProjectionId;
  useLayoutEffect(() => {
    const host = viewport.current;
    if (!host || !transitionKey || !flipChildId) { setFlip(undefined); return; }
    const card = [...host.querySelectorAll<HTMLElement>("[data-embedded-projection]")].find((item) => item.dataset.embeddedProjection === flipChildId);
    if (!card) { setFlip(undefined); return; }
    const outer = host.getBoundingClientRect(), inner = card.getBoundingClientRect();
    setFlip({ key: transitionKey, x: inner.left - outer.left, y: inner.top - outer.top, scaleX: inner.width / outer.width, scaleY: inner.height / outer.height, viewportWidth: outer.width, viewportHeight: outer.height });
  }, [flipChildId, forwardFlip, transitionKey]);
  if (!current) return <div className={styles.orphan}>导航目标 {route.projectionNodeId} 不存在</div>;
  const viewportFor = (node: typeof current) => projectionForInstance(node, nodeTypes.projections())?.zoomViewport ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const render = (entry: typeof route, opacity: number, target = false) => {
    const node = workspace.graph.nodes[entry.projectionNodeId]; if (!node) return null;
    const zoomViewport = viewportFor(node);
    const geometry = flip?.key === transitionKey ? flip : undefined;
    const targetTransform = geometry && forwardFlip
      ? `translate(${mix(geometry.x, 0, progress)}px,${mix(geometry.y, 0, progress)}px) scale(${mix(geometry.scaleX, 1, progress)},${mix(geometry.scaleY, 1, progress)})`
      : `scale(${.88 + progress * .12})`;
    const sourceTransform = "scale(1)";
    // The target keeps the same key when promoted to current, so React preserves its warmed DOM and only removes the faded source.
    return <div key={entry.projectionNodeId} className={`${styles.semanticLayer} ${target ? styles.semanticTarget : ""}`} style={{
      // Keep the current A3 (and its navigation) stable. The opaque target grows
      // over only the declared content viewport, then becomes current at commit.
      opacity: target ? opacity : 1,
      clipPath: target && transition ? `inset(${zoomViewport.top}px ${zoomViewport.right}px ${zoomViewport.bottom}px ${zoomViewport.left}px)` : undefined,
    }}><div className={styles.semanticMotion} style={{
      // A2 owns semantic scale only. A3 consumes the pan variables on its innermost spatial surface.
      transform: target ? targetTransform : sourceTransform,
      transformOrigin: geometry && target && forwardFlip ? "top left" : pointerOrigin,
      "--projection-pan-x": `${contentOffset.x}px`, "--projection-pan-y": `${contentOffset.y}px`,
      "--projection-origin-x": `${semanticOrigin?.x ?? 0}px`, "--projection-origin-y": `${semanticOrigin?.y ?? 0}px`,
      // Freeze the fading source at the exact transition boundary. Resetting it
      // to 1 here causes a visible 1.4→1 jump on the first crossfade frame.
      "--projection-zoom": target ? "1" : transition ? String(forwardFlip ? 1.4 : .75) : String(navigation.semanticScale),
    } as CSSProperties}>
      <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspaceView} graph={workspace.graph} node={node} selection={selection}
        purpose="workspace" projectionContext={workspaceProjectionContext(entry.scope)} execution={execution} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
    </div></div>;
  };
  return <div ref={viewport} className={styles.semanticViewport} data-root-window={rootWindowId}>
    {render(route, transitionActive ? 1 - progress : 1)}{transition && render(transition, transitionActive ? progress : 0, true)}
  </div>;
}
