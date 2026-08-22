/** Renders relation nodes or a camera-controlled free-layout world of workspace projections. */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import type { RelationElementRequest, WorkspacePoint } from "../contracts/package-types.ts";
import type { RelationRef } from "../../relation/index.ts";
import type { RelationNode } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { normalizeFreeLayout, screenToWorld, type FreeLayoutWorkspaceViews } from "../workspace/view-state.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import { NodeCreator, type CreatorChoice } from "./node-creator.tsx";
import { WorkspaceWindow } from "./workspace-window.tsx";
import styles from "../view/relation-host.module.css";

type Gesture = { kind: "pan" | "wire"; pointerId: number; start: WorkspacePoint; camera: FreeLayoutWorkspaceViews["camera"]; moved: boolean; origin?: RelationRef };
const pointIn = (element: HTMLElement, clientX: number, clientY: number) => { const rect = element.getBoundingClientRect(); return { x: clientX - rect.left, y: clientY - rect.top }; };
const isFree = (views: unknown) => Boolean(views && typeof views === "object" && ["free-layout", "parallel-projections"].includes(String((views as { kind?: unknown }).kind)));

export function NodeCanvas({ workspace, elements, nodeTypes, pluginManager, onSelectionChange, onRequest, onViewsChange, onInvokeCreator, onOpenPluginManager, onClosePluginManager }: {
  workspace: WorkspaceSession; elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry; pluginManager?: ReactNode;
  onSelectionChange: (selection: string[]) => void; onRequest: (request: RelationElementRequest) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void; onInvokeCreator: (creatorId: string, point: WorkspacePoint, origin?: RelationRef) => void;
  onOpenPluginManager: (point: WorkspacePoint) => void; onClosePluginManager: () => void;
}) {
  const nodes = Object.values(workspace.graph.nodes), roots = workspace.rootNodeIds.map((id) => workspace.graph.nodes[id]).filter(Boolean);
  const free = isFree(workspace.views), normalized = useMemo(() => normalizeFreeLayout(workspace.views, workspace.rootNodeIds), [workspace.views, workspace.rootNodeIds]);
  const [previewCamera, setPreviewCamera] = useState<FreeLayoutWorkspaceViews["camera"]>(), [creator, setCreator] = useState<{ screen: WorkspacePoint; world: WorkspacePoint; origin?: RelationRef }>();
  const [wire, setWire] = useState<{ from: WorkspacePoint; to: WorkspacePoint }>(), viewport = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | undefined>(undefined), space = useRef(false);
  const touches = useRef(new Map<number, WorkspacePoint>()), pinch = useRef<{ distance: number; world: WorkspacePoint; camera: FreeLayoutWorkspaceViews["camera"] } | undefined>(undefined);
  const views = previewCamera ? { ...normalized, camera: previewCamera } : normalized;
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space") space.current = true; if (event.key === "Escape") { setCreator(undefined); setWire(undefined); } };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") space.current = false; };
    addEventListener("keydown", down); addEventListener("keyup", up); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, []);
  const scopedSelections = workspace.scopedSelections ?? {};
  const hasWorkspaceProjection = roots.some((node) => nodeTypes.projections().some((projection) => projection.purpose === "workspace" && (() => { try { return projection.matches(node, workspace.graph); } catch { return true; } })()));
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
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!free || event.button !== 0 && event.button !== 1) return;
    const path = event.nativeEvent.composedPath() as HTMLElement[], port = path.find((item) => item?.dataset?.relationOriginNode);
    if (!port && path.some((item) => item?.dataset?.nodeId)) return;
    const element = viewport.current!, start = pointIn(element, event.clientX, event.clientY);
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, start);
      if (touches.current.size === 2) { const [a, b] = [...touches.current.values()], center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), world: screenToWorld(center, views), camera: views.camera }; gesture.current = undefined; }
    }
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
    if (current.kind === "pan") { if (current.moved) onViewsChange(views); setPreviewCamera(undefined); }
    else { setWire(undefined); if (current.moved) setCreator({ screen, world: screenToWorld(screen, views), origin: current.origin }); }
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!free) return; event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const point = pointIn(event.currentTarget, event.clientX, event.clientY), before = screenToWorld(point, views);
      const scale = Math.max(.5, Math.min(2, views.camera.scale * Math.exp(-event.deltaY * .002)));
      persistCamera({ scale, x: point.x - before.x * scale, y: point.y - before.y * scale });
    } else persistCamera({ ...views.camera, x: views.camera.x - event.deltaX, y: views.camera.y - event.deltaY });
  };
  const fit = () => {
    const frames = [...Object.values(views.projections), ...Object.values(views.systemWindows).map((item) => item.frame)]; if (!frames.length || !viewport.current) return;
    const minX = Math.min(...frames.map((item) => item.x)), minY = Math.min(...frames.map((item) => item.y));
    const maxX = Math.max(...frames.map((item) => item.x + item.width)), maxY = Math.max(...frames.map((item) => item.y + item.height));
    const scale = Math.max(.5, Math.min(2, Math.min((viewport.current.clientWidth - 112) / (maxX - minX), (viewport.current.clientHeight - 112) / (maxY - minY))));
    persistCamera({ scale, x: 56 - minX * scale, y: 56 - minY * scale });
  };
  if (!free) return <LegacyCanvas workspace={workspace} roots={roots} nodes={nodes} hasWorkspaceProjection={hasWorkspaceProjection} elements={elements} nodeTypes={nodeTypes} pluginManager={pluginManager} onSelectionChange={onSelectionChange} onRequest={onRequest} onOpenPluginManager={onOpenPluginManager} onClosePluginManager={onClosePluginManager} />;
  return <section className={styles.canvasWrap} data-testid="relation-workspace">
    <div className={styles.canvasInfo}>RelationGraph · revision {workspace.graph.revision} · {nodes.length} 个节点 · {status}</div>
    <div ref={viewport} className={`${styles.canvas} ${styles.freeViewport}`} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = undefined; setWire(undefined); }} onWheel={wheel}>
      <div className={styles.freeWorld} style={{ width: views.world.width, height: views.world.height, transform: `translate(${views.camera.x}px,${views.camera.y}px) scale(${views.camera.scale})` }}>
        {roots.map((node) => <WorkspaceWindow key={node.id} id={node.id} frame={views.projections[node.id]} views={views} onFrame={(frame) => onRequest({ kind: "set-workspace-window", windowId: node.id, frame })}>
          <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={views} graph={workspace.graph} node={node} selection={scopedSelections[node.id] ?? workspace.selection} purpose="workspace" elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
        </WorkspaceWindow>)}
        {Object.values(views.systemWindows).map((item) => <WorkspaceWindow key={item.id} id={item.id} frame={item.frame} views={views} system onFrame={(frame) => onRequest({ kind: "set-workspace-window", windowId: item.id, frame })} onClose={onClosePluginManager}>{pluginManager}</WorkspaceWindow>)}
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
