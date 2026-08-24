/** Renders relation nodes or a camera-controlled free-layout world of workspace projections. */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ExecutionContextSnapshot, RelationElementRequest, WorkspacePoint } from "../contracts/package-types.ts";
import type { RelationRef } from "../../relation/index.ts";
import type { RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { normalizeFreeLayout, panWindowContent, screenToWorld, zoomWindowContentAt, type FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import { SemanticProjection } from "../projection/semantic-projection.tsx";
import { ProjectionNavbar } from "./projection-navbar.tsx";
import { forwardRoute, navigationForRoot } from "../projection/projection-routes.ts";
import { applySemanticScale } from "../projection/semantic-zoom.ts";
import { projectionForInstance } from "../projection/projection-instance.ts";
import { NodeCreator, type CreatorChoice } from "./node-creator.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import styles from "../view/relation-host.module.css";

type Gesture = { kind: "pan" | "wire"; pointerId: number; start: WorkspacePoint; camera: FreeLayoutWorkspaceViews["camera"]; moved: boolean; origin?: RelationRef };
type SemanticGesture = { routeKey: string; scale: number; switched: boolean };
const pointIn = (element: HTMLElement, clientX: number, clientY: number) => { const rect = element.getBoundingClientRect(); return { x: clientX - rect.left, y: clientY - rect.top }; };
const isFree = (views: unknown) => Boolean(views && typeof views === "object" && ["free-layout", "parallel-projections"].includes(String((views as { kind?: unknown }).kind)));

export function NodeCanvas({ workspace, elements, nodeTypes, execution, pluginManager, onSelectionChange, onRequest, onViewsChange, onActivateWindow, onInvokeCreator, onOpenPluginManager, onClosePluginManager }: {
  workspace: WorkspaceSession; elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry; pluginManager?: ReactNode;
  execution?: ExecutionContextSnapshot;
  onSelectionChange: (selection: string[]) => void; onRequest: (request: RelationElementRequest) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void; onActivateWindow: (windowId: string) => void; onInvokeCreator: (creatorId: string, point: WorkspacePoint, origin?: RelationRef) => void;
  onOpenPluginManager: (point: WorkspacePoint) => void; onClosePluginManager: () => void;
}) {
  const nodes = Object.values(workspace.graph.nodes), roots = workspace.rootNodeIds.map((id) => workspace.graph.nodes[id]).filter(Boolean);
  const free = isFree(workspace.views), normalized = useMemo(() => normalizeFreeLayout(workspace.views, workspace.rootNodeIds), [workspace.views, workspace.rootNodeIds]);
  const [previewCamera, setPreviewCamera] = useState<FreeLayoutWorkspaceViews["camera"]>(), [creator, setCreator] = useState<{ screen: WorkspacePoint; world: WorkspacePoint; origin?: RelationRef }>();
  const [wire, setWire] = useState<{ from: WorkspacePoint; to: WorkspacePoint }>(), viewport = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | undefined>(undefined);
  const touches = useRef(new Map<number, WorkspacePoint>()), pinch = useRef<{ distance: number; world: WorkspacePoint; camera: FreeLayoutWorkspaceViews["camera"] } | undefined>(undefined);
  const settleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>()), semanticGestures = useRef(new Map<string, SemanticGesture>());
  const views = useMemo(() => previewCamera ? { ...normalized, camera: previewCamera } : normalized, [normalized, previewCamera]);
  useEffect(() => {
    const element = viewport.current;
    if (!free || !element) return;
    // Free layout owns panning through its camera; stale native scroll offsets would move every window outside the viewport.
    element.scrollLeft = 0; element.scrollTop = 0;
    const focusCanvas = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (focused.matches("input,textarea,select,[contenteditable=true]") || Boolean(focused.closest('[role="dialog"]')));
      if (!editing) element.focus({ preventScroll: true });
    };
    focusCanvas();
    const frame = requestAnimationFrame(focusCanvas), timer = setTimeout(focusCanvas, 160);
    addEventListener("pageshow", focusCanvas); addEventListener("focus", focusCanvas);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); removeEventListener("pageshow", focusCanvas); removeEventListener("focus", focusCanvas); };
  }, [free, workspace.id]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const interactive = event.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(event.target.tagName) || event.target.isContentEditable);
      if (event.code === "Space" && !interactive) {
        event.preventDefault(); if (event.repeat || !viewport.current) return;
        const screen = { x: viewport.current.clientWidth / 2, y: viewport.current.clientHeight / 2 };
        setCreator({ screen, world: screenToWorld(screen, views) });
      }
      if (event.key === "Escape") { setCreator(undefined); setWire(undefined); }
    };
    addEventListener("keydown", down); return () => removeEventListener("keydown", down);
  }, [views]);
  const scopedSelections = useMemo(() => workspace.scopedSelections ?? {}, [workspace.scopedSelections]);
  const hasWorkspaceProjection = roots.some((node) => Boolean(projectionForInstance(node, nodeTypes.projections())) || nodeTypes.projections().some((projection) => projection.purpose === "workspace" && (() => { try { return projection.matches(node, workspace.graph); } catch { return true; } })()));
  const displayName = (nodeId: string) => {
    const node = workspace.graph.nodes[nodeId]; if (!node) return nodeId;
    for (const descriptor of nodeTypes.types()) try { if (descriptor.matches?.(node, workspace.graph)) { const label = descriptor.label?.(node, workspace.graph).trim(); if (label) return label; } } catch { continue; }
    return nodeId;
  };
  const status = hasWorkspaceProjection ? roots.map((node) => `${displayName(node.id)} → ${scopedSelections[node.id]?.map(displayName).join(", ") || "未选择"}`).join(" · ") : `${workspace.selection.length} 个已选`;
  const creatorChoices = (): CreatorChoice[] => [{ id: "host.plugin-manager", label: "插件管理器", description: "安装、禁用和导出 PIP", category: "系统", icon: "⚙", provider: "system" }, ...nodeTypes.creators().filter((item) => {
    try { return item.accepts({ workspaceId: workspace.id, graph: workspace.graph, rootNodeIds: workspace.rootNodeIds, worldPosition: creator?.world ?? { x: 0, y: 0 }, origin: creator?.origin }); } catch { return false; }
  }).map((item) => ({ id: item.id, label: item.label, description: item.description, category: item.category, icon: item.icon, provider: "node-type" as const }))];
  const persistCamera = (next: FreeLayoutWorkspaceViews["camera"]) => { setPreviewCamera(undefined); onViewsChange({ ...normalized, camera: next }); };
  useEffect(() => {
    const element = viewport.current; if (!free || !element) return;
    const handle = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const path = event.composedPath() as HTMLElement[], window = path.find((item) => item?.dataset?.nodeId), windowId = window?.dataset.nodeId;
      const frame = windowId ? views.projections[windowId] : undefined, activeProjection = Boolean(windowId && frame && views.activeWindowId === windowId);
      if (event.ctrlKey || event.metaKey) {
        if (windowId && frame && activeProjection) {
          const navigation = navigationForRoot(windowId, workspace.graph, nodeTypes, frame.navigation);
          if (navigation) {
            const focused = path.find((item) => item?.dataset?.embeddedProjection)?.dataset.embeddedProjection;
            const selection = scopedSelections[windowId] ?? workspace.selection, route = navigation.entries[navigation.index];
            const gestureKey = `${workspace.id}:${windowId}`, routeKey = `${navigation.index}:${route.projectionNodeId}:${route.context}`;
            const previous = semanticGestures.current.get(gestureKey);
            const finishGesture = () => {
              const old = settleTimers.current.get(gestureKey); if (old) clearTimeout(old);
              settleTimers.current.set(gestureKey, setTimeout(() => {
                // Ending a pinch only closes its accumulator. The chosen scale remains until reset or route navigation.
                semanticGestures.current.delete(gestureKey); settleTimers.current.delete(gestureKey);
              }, 220));
            };
            // A continuous pinch may cross one semantic boundary only; later wheel frames wait for the next gesture.
            if (previous?.switched) { finishGesture(); return; }
            const gesture = previous?.routeKey === routeKey ? previous : { routeKey, scale: navigation.semanticScale, switched: false };
            const scale = gesture.scale * Math.exp(-event.deltaY * .002); gesture.scale = scale;
            const forward = forwardRoute(navigation, workspace.graph, nodeTypes, focused, selection[0]);
            const next = applySemanticScale(navigation, scale, forward);
            gesture.switched = next.index !== navigation.index; if (gesture.switched) gesture.scale = 1;
            semanticGestures.current.set(gestureKey, gesture);
            const surface = path.find((item) => item?.dataset?.projectionSurface !== undefined);
            const semanticViewport = path.find((item) => item?.dataset?.rootWindow === windowId);
            const unhintedNavigation = { ...next }; delete unhintedNavigation.semanticTargetProjectionId;
            const nextNavigation = !gesture.switched && semanticViewport ? {
              ...unhintedNavigation, semanticOrigin: pointIn(semanticViewport, event.clientX, event.clientY),
              ...(forward ? { semanticTargetProjectionId: forward.projectionNodeId } : {}),
            } : next;
            const nextFrame = !gesture.switched && surface ? zoomWindowContentAt(
              { ...frame, navigation: nextNavigation }, pointIn(surface, event.clientX, event.clientY), navigation.semanticScale, next.semanticScale,
            ) : { ...frame, navigation: nextNavigation };
            onViewsChange({ ...normalized, projections: { ...normalized.projections, [windowId]: nextFrame } });
            finishGesture();
            return;
          }
        }
        const point = pointIn(element, event.clientX, event.clientY), before = screenToWorld(point, views);
        const scale = Math.max(.5, Math.min(2, views.camera.scale * Math.exp(-event.deltaY * .002)));
        setPreviewCamera(undefined); onViewsChange({ ...normalized, camera: { scale, x: point.x - before.x * scale, y: point.y - before.y * scale } });
      } else if (windowId && frame && activeProjection) {
        onViewsChange({ ...normalized, projections: { ...normalized.projections, [windowId]: panWindowContent(frame, { x: event.deltaX, y: event.deltaY }) } });
      } else {
        setPreviewCamera(undefined);
        onViewsChange({
          ...normalized,
          activeWindowId: windowId ? normalized.activeWindowId : undefined,
          camera: { ...views.camera, x: views.camera.x - event.deltaX, y: views.camera.y - event.deltaY },
        });
      }
    };
    element.addEventListener("wheel", handle, { passive: false });
    return () => element.removeEventListener("wheel", handle);
  }, [free, nodeTypes, normalized, onViewsChange, scopedSelections, views, workspace.graph, workspace.id, workspace.selection]);
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!free || event.button !== 0 && event.button !== 1) return;
    const path = event.nativeEvent.composedPath() as HTMLElement[], port = path.find((item) => item?.dataset?.relationOriginNode);
    const element = viewport.current!, start = pointIn(element, event.clientX, event.clientY);
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, start);
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()], center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Touches inside a projection still belong to the canvas once a second finger arrives.
        pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), world: screenToWorld(center, views), camera: views.camera };
        gesture.current = undefined; event.preventDefault(); element.setPointerCapture(event.pointerId); return;
      }
      // Preserve one-finger controls and scrolling inside the projected application.
      if (path.some((item) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(item?.tagName) || item?.dataset?.nodeId)) return;
    }
    if (path.some((item) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(item?.tagName))) return;
    if (!port && path.some((item) => item?.dataset?.nodeId)) return;
    element.focus({ preventScroll: true });
    const origin = port ? { nodeId: port.dataset.relationOriginNode!, relationId: port.dataset.relationOriginRelation ?? "identity" } : undefined;
    const kind = origin || event.altKey && event.button === 0 ? "wire" : "pan";
    event.preventDefault(); element.setPointerCapture(event.pointerId); if (!pinch.current) gesture.current = { kind, pointerId: event.pointerId, start, camera: views.camera, moved: false, origin };
    if (kind === "wire") setWire({ from: start, to: start });
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointIn(viewport.current!, event.clientX, event.clientY);
    if (event.pointerType === "touch" && touches.current.has(event.pointerId)) touches.current.set(event.pointerId, point);
    if (pinch.current && touches.current.size >= 2) { const [a, b] = [...touches.current.values()], center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale = Math.max(.5, Math.min(2, pinch.current.camera.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance)); setPreviewCamera({ scale, x: center.x - pinch.current.world.x * scale, y: center.y - pinch.current.world.y * scale }); return; }
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    const dx = point.x - current.start.x, dy = point.y - current.start.y;
    if (Math.hypot(dx, dy) >= 4) current.moved = true;
    if (current.kind === "wire") setWire({ from: current.start, to: point });
    else setPreviewCamera({ ...current.camera, x: current.camera.x + dx, y: current.camera.y + dy });
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") touches.current.delete(event.pointerId);
    if (pinch.current) { if (touches.current.size < 2) { pinch.current = undefined; if (previewCamera) persistCamera(previewCamera); } return; }
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    const screen = pointIn(viewport.current!, event.clientX, event.clientY); gesture.current = undefined;
    if (current.kind === "pan") { onViewsChange({ ...views, activeWindowId: undefined }); setPreviewCamera(undefined); }
    else { setWire(undefined); if (current.moved) setCreator({ screen, world: screenToWorld(screen, views), origin: current.origin }); }
  };
  const cancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") touches.current.delete(event.pointerId);
    if (pinch.current && touches.current.size < 2) { pinch.current = undefined; if (previewCamera) persistCamera(previewCamera); }
    gesture.current = undefined; setWire(undefined);
  };
  const fit = () => {
    const frames = [...Object.values(views.projections), ...Object.values(views.systemWindows).map((item) => item.frame)]; if (!frames.length || !viewport.current) return;
    const minX = Math.min(...frames.map((item) => item.x)), minY = Math.min(...frames.map((item) => item.y));
    const maxX = Math.max(...frames.map((item) => item.x + item.width)), maxY = Math.max(...frames.map((item) => item.y + item.height));
    const scale = Math.max(.5, Math.min(2, Math.min(viewport.current.clientWidth / (maxX - minX), viewport.current.clientHeight / (maxY - minY))));
    persistCamera({ scale, x: -minX * scale, y: -minY * scale });
  };
  if (!free) return <LegacyCanvas workspace={workspace} roots={roots} nodes={nodes} hasWorkspaceProjection={hasWorkspaceProjection} elements={elements} nodeTypes={nodeTypes} pluginManager={pluginManager} onSelectionChange={onSelectionChange} onRequest={onRequest} onOpenPluginManager={onOpenPluginManager} onClosePluginManager={onClosePluginManager} />;
  return <section className={styles.canvasWrap} data-testid="relation-workspace">
    <div className={styles.canvasInfo}>RelationGraph · revision {workspace.graph.revision} · {nodes.length} 个节点 · {status}</div>
    <div ref={viewport} tabIndex={-1} className={`${styles.canvas} ${styles.freeViewport}`} onScroll={(event) => { event.currentTarget.scrollLeft = 0; event.currentTarget.scrollTop = 0; }}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
      <div className={styles.freeWorld} style={{ width: views.world.width, height: views.world.height, transform: `translate(${views.camera.x}px,${views.camera.y}px) scale(${views.camera.scale})` }}>
        {roots.map((node) => {
          const frame = views.projections[node.id], navigation = navigationForRoot(node.id, workspace.graph, nodeTypes, frame.navigation);
          const executionView = frame.execution ?? { flowLayerVisible: true, followActiveEvent: false };
          const setNavigation = (next: NonNullable<typeof navigation>) => onRequest({ kind: "set-workspace-window", windowId: node.id, frame: { ...frame, navigation: next } });
          const resetProjection = () => navigation && onViewsChange({
            ...normalized,
            projections: { ...normalized.projections, [node.id]: { ...frame, contentOffset: { x: 0, y: 0 }, navigation: { ...navigation, semanticScale: 1 } } },
          });
          return <WorkspaceWindow key={node.id} id={node.id} frame={frame} views={views} active={views.activeWindowId === node.id} front={views.frontWindowId === node.id} onActivate={() => onActivateWindow(node.id)} onFrame={(next) => onRequest({ kind: "set-workspace-window", windowId: node.id, frame: next })}>
            {navigation ? <div className={styles.projectionShell}><ProjectionNavbar navigation={navigation} resizeMode={frame.resizeMode} execution={execution} executionView={executionView} graph={workspace.graph} nodeTypes={nodeTypes} onChange={setNavigation}
              onReset={resetProjection}
              onClose={() => onRequest({ kind: "close-workspace-root", nodeId: node.id })} />
              <SemanticProjection workspace={workspace} rootWindowId={node.id} navigation={navigation} contentOffset={frame.contentOffset ?? { x: 0, y: 0 }} execution={execution} elements={elements} nodeTypes={nodeTypes} selection={scopedSelections[node.id] ?? workspace.selection} onRequest={onRequest} /></div>
              : <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={views} graph={workspace.graph} node={node} selection={scopedSelections[node.id] ?? workspace.selection} purpose="workspace" execution={execution} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />}
          </WorkspaceWindow>;
        })}
        {Object.values(views.systemWindows).map((item) => <WorkspaceWindow key={item.id} id={item.id} frame={item.frame} views={views} system active={views.activeWindowId === item.id} front={views.frontWindowId === item.id} onActivate={() => onActivateWindow(item.id)} onFrame={(frame) => onRequest({ kind: "set-workspace-window", windowId: item.id, frame })} onClose={onClosePluginManager}>{pluginManager}</WorkspaceWindow>)}
      </div>
      {wire && <svg className={styles.creationWire}><line x1={wire.from.x} y1={wire.from.y} x2={wire.to.x} y2={wire.to.y} /><circle cx={wire.to.x} cy={wire.to.y} r="5" /></svg>}
      {creator && <NodeCreator point={creator.screen} candidates={creatorChoices()} onCancel={() => setCreator(undefined)} onChoose={(id) => { if (id === "host.plugin-manager") onOpenPluginManager(creator.world); else onInvokeCreator(id, creator.world, creator.origin); setCreator(undefined); }} />}
      <div className={styles.cameraControls}><button onClick={() => persistCamera({ ...views.camera, scale: Math.max(.5, views.camera.scale - .1) })}>−</button><span>{Math.round(views.camera.scale * 100)}%</span><button onClick={() => persistCamera({ ...views.camera, scale: Math.min(2, views.camera.scale + .1) })}>+</button><button onClick={fit}>适应</button></div>
    </div>
  </section>;
}

function LegacyCanvas({ workspace, roots, nodes, hasWorkspaceProjection, elements, nodeTypes, pluginManager, onSelectionChange, onRequest, onOpenPluginManager, onClosePluginManager }: {
  workspace: WorkspaceSession; roots: RelationNode[]; nodes: RelationNode[]; hasWorkspaceProjection: boolean;
  elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry; pluginManager?: ReactNode; onSelectionChange: (selection: string[]) => void; onRequest: (request: RelationElementRequest) => void;
  onOpenPluginManager: (point: WorkspacePoint) => void; onClosePluginManager: () => void;
}) {
  const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds), drag = useRef<WorkspacePoint | undefined>(undefined), [creatorPoint, setCreatorPoint] = useState<WorkspacePoint>();
  return <section className={styles.canvasWrap} data-testid="relation-workspace"><div className={`${styles.canvas} ${hasWorkspaceProjection ? styles.workspaceProjectionGrid : styles.relationGrid}`}
    onPointerDown={(event) => { if (!event.altKey || (event.nativeEvent.composedPath() as HTMLElement[]).some((item) => item?.dataset?.nodeId)) return; drag.current = pointIn(event.currentTarget, event.clientX, event.clientY); event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={(event) => { if (!drag.current) return; const point = pointIn(event.currentTarget, event.clientX, event.clientY), moved = Math.hypot(point.x - drag.current.x, point.y - drag.current.y); drag.current = undefined; if (moved >= 4) setCreatorPoint(point); }}>
    {hasWorkspaceProjection ? roots.map((node) => <article key={node.id} data-node-id={node.id} className={styles.workspaceProjection}><RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspace.views} graph={workspace.graph} node={node} selection={workspace.selection} purpose="workspace" elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} /></article>) : nodes.map((node) => <article key={node.id} data-node-id={node.id} className={`${styles.node} ${workspace.selection.includes(node.id) ? styles.selected : ""}`} onClick={() => onSelectionChange([node.id])}><RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspace.views} graph={workspace.graph} node={node} selection={workspace.selection} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} /></article>)}
    {!nodes.length && <div className={styles.empty}>这个独立工作区没有 RelationNode。</div>}
    {Object.values(views.systemWindows).map((item) => <WorkspaceWindow key={item.id} id={item.id} frame={item.frame} views={{ ...views, camera: { scale: 1, x: 0, y: 0 } }} system onFrame={(frame) => onRequest({ kind: "set-workspace-window", windowId: item.id, frame })} onClose={onClosePluginManager}>{pluginManager}</WorkspaceWindow>)}
    {creatorPoint && <NodeCreator point={creatorPoint} candidates={[{ id: "host.plugin-manager", label: "插件管理器", description: "安装、禁用和导出 PIP", category: "系统", icon: "⚙", provider: "system" }]} onCancel={() => setCreatorPoint(undefined)} onChoose={() => { onOpenPluginManager(creatorPoint); setCreatorPoint(undefined); }} />}
  </div></section>;
}
