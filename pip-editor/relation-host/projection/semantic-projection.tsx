import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ProjectionNavigationState, RelationElementRequest, WorkspacePoint } from "../contracts/package-types.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { currentRoute } from "./projection-navigation.ts";
import { forwardRoute } from "./projection-routes.ts";
import { semanticProgress } from "./semantic-zoom.ts";
import { RelationNodeRenderer } from "./projection-renderer.tsx";
import styles from "../view/relation-host.module.css";

type FlipFrame = { key: string; x: number; y: number; scaleX: number; scaleY: number; viewportWidth: number; viewportHeight: number };
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function SemanticProjection({ workspace, rootWindowId, navigation, contentOffset, elements, nodeTypes, selection, onRequest }: {
  workspace: WorkspaceSession; rootWindowId: string; navigation: ProjectionNavigationState; elements: ElementPluginRegistry;
  contentOffset: WorkspacePoint; nodeTypes: NodeTypePluginRegistry; selection: string[]; onRequest: (request: RelationElementRequest) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null), [flip, setFlip] = useState<FlipFrame>();
  const route = currentRoute(navigation), current = workspace.graph.nodes[route.projectionNodeId];
  const forward = forwardRoute(navigation, workspace.graph, nodeTypes, navigation.semanticTargetProjectionId, selection[0]);
  const reverse = navigation.index > 0 ? navigation.entries[navigation.index - 1] : undefined;
  // Prepare the target before crossfade begins so custom elements and SVG do not mount on the threshold frame.
  const transition = navigation.semanticScale > 1.4 ? forward : navigation.semanticScale < .75 ? reverse : undefined;
  const transitionActive = navigation.semanticScale > 1.5 || navigation.semanticScale < .7;
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
  const render = (entry: typeof route, opacity: number, target = false) => {
    const node = workspace.graph.nodes[entry.projectionNodeId]; if (!node) return null;
    const geometry = flip?.key === transitionKey ? flip : undefined, reverseFlip = Boolean(geometry && !forwardFlip);
    const targetTransform = geometry && forwardFlip
      ? `translate(${mix(geometry.x, 0, progress)}px,${mix(geometry.y, 0, progress)}px) scale(${mix(geometry.scaleX, 1, progress)},${mix(geometry.scaleY, 1, progress)})`
      : `scale(${navigation.semanticScale < .7 ? 1 : .88 + progress * .12})`;
    const sourceTransform = reverseFlip
      ? `translate(${mix(0, geometry!.x, progress)}px,${mix(0, geometry!.y, progress)}px) scale(${mix(1, geometry!.scaleX, progress)},${mix(1, geometry!.scaleY, progress)})`
      : transition ? `scale(${forwardFlip ? 1 + progress * .04 : 1 - progress * .08})` : "scale(1)";
    // The target keeps the same key when promoted to current, so React preserves its warmed DOM and only removes the faded source.
    return <div key={entry.projectionNodeId} className={`${styles.semanticLayer} ${target ? styles.semanticTarget : ""}`} style={{
      opacity,
      // A2 owns semantic scale only. A3 consumes the pan variables on its innermost spatial surface.
      transform: target ? targetTransform : sourceTransform,
      transformOrigin: geometry && (target && forwardFlip || !target && reverseFlip) ? "top left" : pointerOrigin,
      "--projection-pan-x": `${contentOffset.x}px`, "--projection-pan-y": `${contentOffset.y}px`,
      // Spatial A3 elements own ordinary zoom; A2 transforms only during a semantic route transition.
      "--projection-zoom": target ? "1" : String(navigation.semanticScale),
    } as CSSProperties}>
      <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspace.views} graph={workspace.graph} node={node} selection={selection}
        purpose="workspace" projectionContext={{ kind: entry.context }} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
    </div>;
  };
  return <div ref={viewport} className={styles.semanticViewport} data-root-window={rootWindowId}>
    {render(route, transitionActive ? 1 - progress : 1)}{transition && render(transition, transitionActive ? progress : 0, true)}
  </div>;
}
