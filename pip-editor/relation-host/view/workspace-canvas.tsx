/** 渲染关系节点，或带工作区相机的自由布局投影世界。 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RelationRef } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  RelationElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import { projectionForInstance } from "../projection/projection-instance.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import {
  normalizeFreeLayout,
  screenToWorld,
  type FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";
import { LegacyWorkspaceCanvas } from "./legacy-workspace-canvas.tsx";
import type { CreatorChoice } from "./node-creator.tsx";
import { FreeWorkspaceCanvas } from "./free-workspace-canvas.tsx";
import {
  useWorkspaceCanvasPointer,
  type CreationWire,
  type CreatorPosition,
} from "./workspace-canvas-pointer.ts";
import { useWorkspaceCanvasWheel } from "./workspace-canvas-wheel.ts";
type NodeCanvasProps = {
  elements: ElementPluginRegistry;
  execution?: ExecutionContextSnapshot;
  nodeTypes: NodeTypePluginRegistry;
  onActivateWindow: (windowId: string) => void;
  onClosePluginManager: () => void;
  onInvokeCreator: (
    creatorId: string,
    point: WorkspacePoint,
    origin?: RelationRef,
  ) => void;
  onOpenPluginManager: (point: WorkspacePoint) => void;
  onRequest: (request: RelationElementRequest) => void;
  onSelectionChange: (selection: string[]) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
  pluginManager?: ReactNode;
  workspace: WorkspaceSession;
};
const isFree = (views: unknown) => Boolean(
  views &&
  typeof views === "object" &&
  ["free-layout", "parallel-projections"].includes(
    String((views as { kind?: unknown }).kind),
  ),
);
export function NodeCanvas({
  elements,
  execution,
  nodeTypes,
  onActivateWindow,
  onClosePluginManager,
  onInvokeCreator,
  onOpenPluginManager,
  onRequest,
  onSelectionChange,
  onViewsChange,
  pluginManager,
  workspace,
}: NodeCanvasProps) {
  const nodes = Object.values(workspace.graph.nodes);
  const roots = workspace.rootNodeIds
    .map((id) => workspace.graph.nodes[id])
    .filter(Boolean);
  const free = isFree(workspace.views);
  const normalized = useMemo(
    () => normalizeFreeLayout(workspace.views, workspace.rootNodeIds),
    [workspace.views, workspace.rootNodeIds],
  );
  const [previewCamera, setPreviewCamera] = useState<
    FreeLayoutWorkspaceViews["camera"]
  >();
  const [creator, setCreator] = useState<CreatorPosition>();
  const [wire, setWire] = useState<CreationWire>();
  const viewport = useRef<HTMLDivElement>(null);
  const views = useMemo(
    () => previewCamera ? { ...normalized, camera: previewCamera } : normalized,
    [normalized, previewCamera],
  );
  const scopedSelections = useMemo(
    () => workspace.scopedSelections ?? {},
    [workspace.scopedSelections],
  );
  // 自由布局使用自己的 camera，浏览器残留滚动偏移必须始终归零。
  useEffect(() => {
    const element = viewport.current;
    if (!free || !element) return;
    element.scrollLeft = 0;
    element.scrollTop = 0;

    const focusCanvas = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (
        focused.matches("input,textarea,select,[contenteditable=true]") ||
        Boolean(focused.closest('[role="dialog"]'))
      );
      if (!editing) element.focus({ preventScroll: true });
    };

    focusCanvas();
    const frame = requestAnimationFrame(focusCanvas);
    const timer = setTimeout(focusCanvas, 160);
    addEventListener("pageshow", focusCanvas);
    addEventListener("focus", focusCanvas);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      removeEventListener("pageshow", focusCanvas);
      removeEventListener("focus", focusCanvas);
    };
  }, [free, workspace.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const interactive = event.target instanceof HTMLElement && (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(
          event.target.tagName,
        ) || event.target.isContentEditable
      );
      if (event.code === "Space" && !interactive) {
        event.preventDefault();
        if (event.repeat || !viewport.current) return;
        const screen = {
          x: viewport.current.clientWidth / 2,
          y: viewport.current.clientHeight / 2,
        };
        setCreator({ screen, world: screenToWorld(screen, views) });
      }
      if (event.key === "Escape") {
        setCreator(undefined);
        setWire(undefined);
      }
    };
    addEventListener("keydown", handleKeyDown);
    return () => removeEventListener("keydown", handleKeyDown);
  }, [views]);

  const hasWorkspaceProjection = roots.some((node) => {
    if (projectionForInstance(node, nodeTypes.projections())) return true;
    return nodeTypes.projections().some((projection) => {
      if (projection.purpose !== "workspace") return false;
      try {
        return projection.matches(node, workspace.graph);
      } catch {
        return true;
      }
    });
  });

  const displayName = (nodeId: string) => {
    const node = workspace.graph.nodes[nodeId];
    if (!node) return nodeId;
    for (const descriptor of nodeTypes.types()) {
      try {
        if (!descriptor.matches?.(node, workspace.graph)) continue;
        const label = descriptor.label?.(node, workspace.graph).trim();
        if (label) return label;
      } catch {
        continue;
      }
    }
    return nodeId;
  };

  const status = hasWorkspaceProjection
    ? roots.map((node) => `${displayName(node.id)} → ${
      scopedSelections[node.id]?.map(displayName).join(", ") || "未选择"
    }`).join(" · ")
    : `${workspace.selection.length} 个已选`;

  const creatorChoices = (): CreatorChoice[] => [{
    id: "host.plugin-manager",
    label: "插件管理器",
    description: "安装、禁用和导出 PIP",
    category: "系统",
    icon: "⚙",
    provider: "system",
  }, ...nodeTypes.creators().filter((item) => {
    try {
      return item.accepts({
        workspaceId: workspace.id,
        graph: workspace.graph,
        rootNodeIds: workspace.rootNodeIds,
        worldPosition: creator?.world ?? { x: 0, y: 0 },
        origin: creator?.origin,
      });
    } catch {
      return false;
    }
  }).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    category: item.category,
    icon: item.icon,
    provider: "node-type" as const,
  }))];

  const persistCamera = (next: FreeLayoutWorkspaceViews["camera"]) => {
    setPreviewCamera(undefined);
    onViewsChange({ ...normalized, camera: next });
  };

  useWorkspaceCanvasWheel({
    free,
    nodeTypes,
    normalized,
    onViewsChange,
    scopedSelections,
    setPreviewCamera,
    views,
    viewport,
    workspace,
  });
  const pointer = useWorkspaceCanvasPointer({
    free,
    onViewsChange,
    persistCamera,
    previewCamera,
    setCreator,
    setPreviewCamera,
    setWire,
    viewport,
    views,
  });

  const fit = () => {
    const frames = [
      ...Object.values(views.projections),
      ...Object.values(views.systemWindows).map((item) => item.frame),
    ];
    if (!frames.length || !viewport.current) return;
    const minX = Math.min(...frames.map((item) => item.x));
    const minY = Math.min(...frames.map((item) => item.y));
    const maxX = Math.max(...frames.map((item) => item.x + item.width));
    const maxY = Math.max(...frames.map((item) => item.y + item.height));
    const scale = Math.max(.5, Math.min(2, Math.min(
      viewport.current.clientWidth / (maxX - minX),
      viewport.current.clientHeight / (maxY - minY),
    )));
    persistCamera({ scale, x: -minX * scale, y: -minY * scale });
  };

  if (!free) {
    return <LegacyWorkspaceCanvas
      workspace={workspace}
      roots={roots}
      nodes={nodes}
      hasWorkspaceProjection={hasWorkspaceProjection}
      elements={elements}
      nodeTypes={nodeTypes}
      pluginManager={pluginManager}
      onSelectionChange={onSelectionChange}
      onRequest={onRequest}
      onOpenPluginManager={onOpenPluginManager}
      onClosePluginManager={onClosePluginManager}
    />;
  }

  return <FreeWorkspaceCanvas
    workspace={workspace}
    roots={roots}
    nodeCount={nodes.length}
    status={status}
    elements={elements}
    nodeTypes={nodeTypes}
    execution={execution}
    pluginManager={pluginManager}
    normalized={normalized}
    views={views}
    viewport={viewport}
    scopedSelections={scopedSelections}
    pointer={pointer}
    wire={wire}
    creator={creator}
    creatorChoices={creatorChoices}
    setCreator={setCreator}
    fit={fit}
    persistCamera={persistCamera}
    onViewsChange={onViewsChange}
    onActivateWindow={onActivateWindow}
    onClosePluginManager={onClosePluginManager}
    onRequest={onRequest}
    onChooseCreator={(id) => {
      if (id === "host.plugin-manager") {
        onOpenPluginManager(creator!.world);
      } else {
        onInvokeCreator(id, creator!.world, creator!.origin);
      }
      setCreator(undefined);
    }}
  />;
}
