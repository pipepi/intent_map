/** 渲染关系节点，或带工作区相机的自由布局投影世界。 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RelationRef } from "../../relation/index.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot,
  RelationElementRequest,
  WorkspacePoint,
} from "../contracts/package-types.ts";
import type {
  SystemPluginCanvasBridge,
  SystemPluginWindow,
} from "../contracts/system-plugin.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import {
  normalizeFreeLayout,
  screenToWorld,
  type FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";
import { LegacyWorkspaceCanvas } from "./legacy-workspace-canvas.tsx";
import { FreeWorkspaceCanvas } from "./free-workspace-canvas.tsx";
import {
  workspaceCreatorChoices,
  workspaceHasProjection,
  workspaceSelectionStatus,
} from "./workspace-canvas-model.ts";
import {
  useWorkspaceCanvasPointer,
  type CreationWire,
  type CreatorPosition,
} from "./workspace-canvas-pointer.ts";
import { useWorkspaceCanvasWheel } from "./workspace-canvas-wheel.ts";
type NodeCanvasProps = {
  autoFocus?: boolean;
  elements: ElementPluginRegistry;
  execution?: ExecutionContextSnapshot;
  nodeTypes: NodeTypePluginRegistry;
  onActivateWindow: (windowId: string) => void;
  onCloseSystemPlugin: (window: SystemPluginWindow) => void;
  onInvokeCreator: (
    creatorId: string,
    point: WorkspacePoint,
    origin?: RelationRef,
  ) => void;
  onOpenSystemPlugin: (pluginId: string, point: WorkspacePoint) => void;
  onRequest: (request: RelationElementRequest) => void;
  onSelectionChange: (selection: string[]) => void;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
  systemPlugins: SystemPluginCanvasBridge;
  systemPluginServices: unknown;
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
  autoFocus = true,
  elements,
  execution,
  nodeTypes,
  onActivateWindow,
  onCloseSystemPlugin,
  onInvokeCreator,
  onOpenSystemPlugin,
  onRequest,
  onSelectionChange,
  onViewsChange,
  systemPlugins,
  systemPluginServices,
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

    if (autoFocus) focusCanvas();
    const frame = autoFocus ? requestAnimationFrame(focusCanvas) : undefined;
    const timer = autoFocus ? setTimeout(focusCanvas, 160) : undefined;
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [autoFocus, free, workspace.id]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入控件和可编辑区域保留空格键的原生输入语义，不触发编辑器命令。
      const interactive = event.target instanceof HTMLElement && (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(
          event.target.tagName,
        ) || event.target.isContentEditable
      );
      // 空格键是编辑器级节点创建入口：在当前视口中心打开 Creator。
      if (event.code === "Space" && !interactive) {
        event.preventDefault();
        // 工作区窗口嵌套在宿主画布中，已消费的快捷键不能继续冒泡到宿主。
        event.stopPropagation();
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
    const element = viewport.current;
    element?.addEventListener("keydown", handleKeyDown);
    return () => element?.removeEventListener("keydown", handleKeyDown);
  }, [views]);
  const hasWorkspaceProjection = workspaceHasProjection(workspace, nodeTypes);
  const status = workspaceSelectionStatus(
    workspace,
    nodeTypes,
    hasWorkspaceProjection,
  );
  const creatorChoices = workspaceCreatorChoices(
    workspace,
    nodeTypes,
    systemPlugins,
    creator,
  );

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
      creatorChoices={creatorChoices.filter(
        (choice) => choice.provider === "system",
      )}
      systemPlugins={systemPlugins}
      systemPluginServices={systemPluginServices}
      onSelectionChange={onSelectionChange}
      onRequest={onRequest}
      onCloseSystemPlugin={onCloseSystemPlugin}
      onChooseCreator={(choice, point) => {
        onOpenSystemPlugin(choice.id, point);
      }}
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
    systemPlugins={systemPlugins}
    systemPluginServices={systemPluginServices}
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
    onCloseSystemPlugin={onCloseSystemPlugin}
    onRequest={onRequest}
    onChooseCreator={(choice) => {
      if (choice.provider === "system") {
        onOpenSystemPlugin(choice.id, creator!.world);
      } else {
        onInvokeCreator(choice.id, creator!.world, creator!.origin);
      }
      setCreator(undefined);
    }}
  />;
}
