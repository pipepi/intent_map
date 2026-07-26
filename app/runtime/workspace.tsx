"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type {
  ContainerSurface,
  FeaturePanelSurface,
  IntentDocumentV3,
  IntentNode,
  NormalizedFrame,
  PanelInstance,
  SurfaceInstance,
  WorkspaceState,
} from "./model";
import { NodeProjection } from "./node-renderer";
import { BusinessGraphProjection } from "./business-graph-projection";
import {
  BUSINESS_PORT_ROW,
  BUSINESS_PORT_TOP,
  businessNodeSize,
  clampBusinessNodePosition,
  resizeBusinessNodeGeometry,
} from "./business-canvas";
import {
  defaultNodeProjectionLayout,
  projectIntentTree,
} from "./projection";
import { cameraForTouchGesture } from "./camera";
import { derivePanelPipelineEdges } from "./panel-pipelines";
import {
  businessScopeAddress,
  getBusinessRoot,
  isCoreWorkspacePanel,
  nodeDisplayMode,
  removeWorkspacePanel,
  scopeCameraKey,
} from "./model";

type WorkspaceProps = {
  document: IntentDocumentV3;
  freeCanvas: ReactNode;
  onWorkspaceChange: (workspace: WorkspaceState) => void;
  onUpdateView: (panelId: string) => void;
  onSaveViewAs: (panelId: string) => void;
  renderNodeContent: (
    node: IntentNode,
    context: { panelId: string; surfaceId: string },
  ) => ReactNode;
  onUpdateInputBinding: (
    nodeId: string,
    portId: string,
    value: string,
  ) => void;
  onAddBusinessChild: (scopeId: string) => void;
};

type DragTarget =
  | { kind: "panel"; panelId: string }
  | { kind: "surface"; panelId: string; surfaceId: string };

const findNode = (node: IntentNode, id: string): IntentNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return undefined;
};

const findPath = (
  node: IntentNode,
  id: string,
  path: string[] = [],
): string[] | undefined => {
  const next = [...path, node.id];
  if (node.id === id) return next;
  for (const child of node.children ?? []) {
    const match = findPath(child, id, next);
    if (match) return match;
  }
  return undefined;
};

const clampFrame = (frame: NormalizedFrame): NormalizedFrame => ({
  x: Math.max(0, Math.min(1 - frame.width, frame.x)),
  y: Math.max(0, Math.min(1 - frame.height, frame.y)),
  width: Math.max(0.12, Math.min(1 - frame.x, frame.width)),
  height: Math.max(0.12, Math.min(1 - frame.y, frame.height)),
});

const frameStyle = (frame: NormalizedFrame): CSSProperties => ({
  left: `${frame.x * 100}%`,
  top: `${frame.y * 100}%`,
  width: `${frame.width * 100}%`,
  height: `${frame.height * 100}%`,
});

const updatePanel = (
  workspace: WorkspaceState,
  panelId: string,
  updater: (panel: PanelInstance) => PanelInstance,
): WorkspaceState => ({
  ...workspace,
  activePanelId: panelId,
  panels: workspace.panels.map((panel) =>
    panel.id === panelId ? updater(panel) : panel,
  ),
});

const updateSurface = (
  workspace: WorkspaceState,
  panelId: string,
  surfaceId: string,
  updater: (surface: SurfaceInstance) => SurfaceInstance,
): WorkspaceState =>
  updatePanel(workspace, panelId, (panel) => ({
    ...panel,
    surfaces: panel.surfaces.map((surface) =>
      surface.id === surfaceId ? updater(surface) : surface,
    ),
  }));

type MeasuredPipelinePoint = { x: number; y: number };

const sameMeasuredPoints = (
  left: Record<string, MeasuredPipelinePoint>,
  right: Record<string, MeasuredPipelinePoint>,
) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(
    ([key, point]) =>
      right[key]?.x === point.x && right[key]?.y === point.y,
  );

function PanelPipelineOverlay({
  root,
  panel,
}: {
  root: IntentNode;
  panel: PanelInstance;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 1000 });
  const [measuredPoints, setMeasuredPoints] = useState<
    Record<string, MeasuredPipelinePoint>
  >({});
  const edges = useMemo(
    () => derivePanelPipelineEdges(root, panel),
    [root, panel],
  );

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const body = overlay?.parentElement;
    if (!overlay || !body) return;

    const measure = () => {
      const bodyRect = body.getBoundingClientRect();
      const nextSize = {
        width: Math.max(1, bodyRect.width),
        height: Math.max(1, bodyRect.height),
      };
      const nextPoints: Record<string, MeasuredPipelinePoint> = {};
      const surfaces = Array.from(
        body.querySelectorAll<HTMLElement>("[data-surface-id]"),
      );
      const findPortCenter = (
        surfaceId: string | undefined,
        kind: "input" | "output",
        nodeId: string,
        portId: string,
      ) => {
        if (!surfaceId) return;
        const surface = surfaces.find(
          (candidate) => candidate.dataset.surfaceId === surfaceId,
        );
        const port = Array.from(
          surface?.querySelectorAll<HTMLElement>("[data-port-kind]") ?? [],
        ).find(
          (candidate) =>
            candidate.dataset.portKind === kind &&
            candidate.dataset.portNode === nodeId &&
            candidate.dataset.portId === portId,
        );
        const dot = port?.querySelector<HTMLElement>("i");
        if (!dot) return;
        const rect = dot.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - bodyRect.left,
          y: rect.top + rect.height / 2 - bodyRect.top,
        };
      };

      for (const edge of edges) {
        const source = findPortCenter(
          edge.sourceSurfaceId,
          "output",
          edge.sourceNodeId,
          edge.sourcePortId,
        );
        const target = findPortCenter(
          edge.targetSurfaceId,
          "input",
          edge.targetNodeId,
          edge.targetPortId,
        );
        if (source) nextPoints[`${edge.id}:source`] = source;
        if (target) nextPoints[`${edge.id}:target`] = target;
      }
      setSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
      setMeasuredPoints((current) =>
        sameMeasuredPoints(current, nextPoints) ? current : nextPoints,
      );
    };

    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    body
      .querySelectorAll<HTMLElement>("[data-surface-id]")
      .forEach((surface) => observer.observe(surface));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [edges]);

  if (!edges.length) return null;
  return (
    <svg
      ref={overlayRef}
      className="panel-pipeline-overlay"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {edges.map((edge) => {
        const source = measuredPoints[`${edge.id}:source`] ?? {
          x: edge.source.x * size.width,
          y: edge.source.y * size.height,
        };
        const target = measuredPoints[`${edge.id}:target`] ?? {
          x: edge.target.x * size.width,
          y: edge.target.y * size.height,
        };
        const bend = Math.max(55, Math.abs(target.x - source.x) * 0.42);
        const highlighted =
          panel.selection.primaryNodeId === edge.sourceNodeId ||
          panel.selection.primaryNodeId === edge.targetNodeId ||
          panel.activeContainerSurfaceId === edge.sourceSurfaceId ||
          panel.activeContainerSurfaceId === edge.targetSurfaceId;
        return (
          <g
            key={edge.id}
            className={`panel-pipeline channel-${edge.channel} ${
              highlighted ? "highlighted" : ""
            }`}
            data-source-surface={edge.sourceSurfaceId ?? ""}
            data-target-surface={edge.targetSurfaceId ?? ""}
          >
            <path
              d={`M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`}
            />
            {edge.source.boundary && (
              <circle
                className="pipeline-boundary-stub"
                cx={source.x}
                cy={source.y}
                r="7"
              />
            )}
            {edge.target.boundary && (
              <circle
                className="pipeline-boundary-stub"
                cx={target.x}
                cy={target.y}
                r="7"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Workspace({
  document,
  freeCanvas,
  onWorkspaceChange,
  onUpdateView,
  onSaveViewAs,
  renderNodeContent,
  onUpdateInputBinding,
  onAddBusinessChild,
}: WorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerTouchPointersRef = useRef(
    new Map<string, Map<number, { x: number; y: number }>>(),
  );
  const containerTouchGesturesRef = useRef(
    new Map<
      string,
      {
        startCamera: { scale: number; x: number; y: number };
        startCenter: { x: number; y: number };
        startDistance?: number;
      }
    >(),
  );
  const [pendingContainerPipe, setPendingContainerPipe] = useState<{
    surfaceId: string;
    sourceNodeId: string;
    sourcePortId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [focusedSurface, setFocusedSurface] = useState<{
    panelId: string;
    surfaceId: string;
  } | null>(null);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(
    null,
  );
  const effectivePanelId = document.workspaceState.panels.some(
    (panel) => panel.id === focusedPanelId,
  )
    ? focusedPanelId
    : document.workspaceState.activePanelId;
  const businessRoot = getBusinessRoot(document);
  const currentContainerNode = findNode(
    document.rootIntent,
    "current_container",
  );
  const workspaceUid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

  const duplicateActivePanel = () => {
    const source = document.workspaceState.panels.find(
      (panel) => panel.id === effectivePanelId,
    );
    if (!source) return;
    const suffix = workspaceUid("copy");
    const surfaceIds = new Map(
      source.surfaces.map((surface) => [
        surface.id,
        `${surface.id}_${suffix}`,
      ]),
    );
    const surfaces = source.surfaces.map<SurfaceInstance>((surface) => {
      const id = surfaceIds.get(surface.id)!;
      if (surface.kind === "current-container") {
        return { ...surface, id, title: `${surface.title} · 副本` };
      }
      return {
        ...surface,
        id,
        contextSource:
          surface.contextSource.mode === "fixed-container"
            ? {
                mode: "fixed-container",
                surfaceId:
                  surfaceIds.get(surface.contextSource.surfaceId) ??
                  surface.contextSource.surfaceId,
              }
            : surface.contextSource,
      };
    });
    const panelId = workspaceUid("panel");
    onWorkspaceChange({
      activePanelId: panelId,
      panels: [
        ...document.workspaceState.panels,
        {
          ...source,
          id: panelId,
          title: `${source.title} · 副本`,
          frame: clampFrame({
            ...source.frame,
            x: source.frame.x + 0.025,
            y: source.frame.y + 0.025,
          }),
          zIndex:
            Math.max(
              0,
              ...document.workspaceState.panels.map((panel) => panel.zIndex),
            ) + 1,
          activeContainerSurfaceId: source.activeContainerSurfaceId
            ? surfaceIds.get(source.activeContainerSurfaceId)
            : undefined,
          surfaces,
        },
      ],
    });
  };

  const addContainerSurface = (panel: PanelInstance) => {
    const active = panel.surfaces.find(
      (surface) =>
        surface.id === panel.activeContainerSurfaceId &&
        surface.kind === "current-container",
    );
    const id = workspaceUid("container");
    const surface: ContainerSurface =
      active?.kind === "current-container"
        ? {
            ...active,
            id,
            title: "当前容器",
            frame: clampFrame({
              ...active.frame,
              x: active.frame.x + 0.04,
              y: active.frame.y + 0.04,
            }),
            zIndex: Math.max(0, ...panel.surfaces.map((item) => item.zIndex)) + 1,
          }
        : {
            kind: "current-container",
            id,
            title: "当前容器",
            frame: { x: 0.25, y: 0.08, width: 0.5, height: 0.55 },
            zIndex: 1,
            scope: businessScopeAddress(businessRoot.id),
            navigationStack: [businessScopeAddress(businessRoot.id)],
            projections: {
              [scopeCameraKey(businessScopeAddress(businessRoot.id))]: {
                camera: { scale: 0.55, x: 12, y: 12 },
                nodeLayouts: {},
              },
            },
            nodeLayoutLocked: false,
            localState: {},
          };
    onWorkspaceChange(
      updatePanel(document.workspaceState, panel.id, (candidate) => ({
        ...candidate,
        activeContainerSurfaceId: id,
        surfaces: [...candidate.surfaces, surface],
      })),
    );
  };

  const addFeatureSurface = (panel: PanelInstance, featureNodeId: string) => {
    const node = findNode(document.rootIntent, featureNodeId);
    if (!node || node.kind !== "renderer") return;
    const id = workspaceUid(featureNodeId);
    const offset = (panel.surfaces.length % 5) * 0.025;
    const surface: FeaturePanelSurface = {
      kind: "feature-panel",
      id,
      featureNodeId,
      title: node.name,
      frame: {
        x: 0.08 + offset,
        y: 0.1 + offset,
        width: 0.34,
        height: 0.4,
      },
      zIndex: Math.max(0, ...panel.surfaces.map((item) => item.zIndex)) + 1,
      viewport: {
        camera: { scale: 1, x: 0, y: 0 },
        fitMode: "auto",
      },
      contextSource: { mode: "follow-active-container" },
      subject: { mode: "follow-panel-selection" },
      localState: {},
    };
    onWorkspaceChange(
      updatePanel(document.workspaceState, panel.id, (candidate) => ({
        ...candidate,
        surfaces: [...candidate.surfaces, surface],
      })),
    );
  };

  const removeSurfaceFromPanel = (
    panel: PanelInstance,
    surfaceId: string,
  ) => {
    onWorkspaceChange(
      updatePanel(document.workspaceState, panel.id, (candidate) => {
        const surfaces = candidate.surfaces.filter(
          (surface) => surface.id !== surfaceId,
        );
        return {
          ...candidate,
          surfaces,
          activeContainerSurfaceId:
            candidate.activeContainerSurfaceId === surfaceId
              ? surfaces.find(
                  (surface) => surface.kind === "current-container",
                )?.id
              : candidate.activeContainerSurfaceId,
        };
      }),
    );
  };

  const beginDrag = (
    target: DragTarget,
    frame: NormalizedFrame,
    event: ReactPointerEvent,
  ) => {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    const panel = document.workspaceState.panels.find(
      (candidate) => candidate.id === target.panelId,
    );
    if (!stage || !panel || panel.layoutLocked) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const bounds =
      target.kind === "panel"
        ? stage.getBoundingClientRect()
        : (
            event.currentTarget.closest(".workspace-panel-body") as HTMLElement
          )?.getBoundingClientRect();
    if (!bounds) return;

    const move = (moveEvent: PointerEvent) => {
      const next = clampFrame({
        ...frame,
        x: frame.x + (moveEvent.clientX - start.x) / bounds.width,
        y: frame.y + (moveEvent.clientY - start.y) / bounds.height,
      });
      if (target.kind === "panel") {
        onWorkspaceChange(
          updatePanel(document.workspaceState, target.panelId, (item) => ({
            ...item,
            frame: next,
          })),
        );
      } else {
        onWorkspaceChange(
          updateSurface(
            document.workspaceState,
            target.panelId,
            target.surfaceId,
            (surface) => ({ ...surface, frame: next }),
          ),
        );
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const beginResize = (
    target: DragTarget,
    frame: NormalizedFrame,
    event: ReactPointerEvent,
  ) => {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    const panel = document.workspaceState.panels.find(
      (candidate) => candidate.id === target.panelId,
    );
    if (!stage || !panel || panel.layoutLocked) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const bounds =
      target.kind === "panel"
        ? stage.getBoundingClientRect()
        : (
            event.currentTarget.closest(".workspace-panel-body") as HTMLElement
          )?.getBoundingClientRect();
    if (!bounds) return;
    const move = (moveEvent: PointerEvent) => {
      const next = clampFrame({
        ...frame,
        width: frame.width + (moveEvent.clientX - start.x) / bounds.width,
        height: frame.height + (moveEvent.clientY - start.y) / bounds.height,
      });
      if (target.kind === "panel") {
        onWorkspaceChange(
          updatePanel(document.workspaceState, target.panelId, (item) => ({
            ...item,
            frame: next,
          })),
        );
      } else {
        onWorkspaceChange(
          updateSurface(
            document.workspaceState,
            target.panelId,
            target.surfaceId,
            (surface) => ({ ...surface, frame: next }),
          ),
        );
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const selectNode = (
    panelId: string,
    nodeId: string,
    sourceContainerId?: string,
  ) => {
    onWorkspaceChange(
      updatePanel(document.workspaceState, panelId, (panel) => ({
        ...panel,
        activeContainerSurfaceId:
          sourceContainerId ?? panel.activeContainerSurfaceId,
        selection: {
          nodeIds: [nodeId],
          primaryNodeId: nodeId,
          revision: panel.selection.revision + 1,
        },
      })),
    );
  };

  const navigateContainer = (
    panelId: string,
    surface: ContainerSurface,
    nodeId: string,
  ) => {
    const path = findPath(businessRoot, nodeId);
    if (!path) return;
    const navigationStack = path.map(businessScopeAddress);
    onWorkspaceChange(
      updateSurface(
        updatePanel(document.workspaceState, panelId, (panel) => ({
          ...panel,
          activeContainerSurfaceId: surface.id,
          selection: {
            nodeIds: [nodeId],
            primaryNodeId: nodeId,
            revision: panel.selection.revision + 1,
          },
        })),
        panelId,
        surface.id,
        (candidate) =>
          candidate.kind === "current-container"
            ? {
                ...candidate,
                scope: businessScopeAddress(nodeId),
                navigationStack,
              }
            : candidate,
      ),
    );
  };

  const renderContainer = (
    panel: PanelInstance,
    surface: ContainerSurface,
  ) => {
    const projectedRoot = projectIntentTree(
      document.rootIntent,
      document.businessRootId,
      surface.projections,
    );
    const projectedBusinessRoot = getBusinessRoot({
      ...document,
      rootIntent: projectedRoot,
    });
    const scope = findNode(projectedBusinessRoot, surface.scope.nodeId);
    const projectionKey = scopeCameraKey(surface.scope);
    const camera = surface.projections[projectionKey]?.camera ?? {
      scale: 0.55,
      x: 12,
      y: 12,
    };
    const updateCamera = (nextCamera: typeof camera) =>
      onWorkspaceChange(
        updateSurface(
          document.workspaceState,
          panel.id,
          surface.id,
          (candidate) => {
            if (candidate.kind !== "current-container") return candidate;
            return {
              ...candidate,
              projections: {
                ...candidate.projections,
                [projectionKey]: {
                  camera: nextCamera,
                  nodeLayouts:
                    candidate.projections[projectionKey]?.nodeLayouts ?? {},
                },
              },
            };
          },
        ),
      );
    const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!event.ctrlKey) {
        updateCamera({
          ...camera,
          x: camera.x - event.deltaX,
          y: camera.y - event.deltaY,
        });
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const scale = Math.max(
        0.5,
        Math.min(2, camera.scale * Math.exp(-event.deltaY * 0.002)),
      );
      const worldX = (pointer.x - camera.x) / camera.scale;
      const worldY = (pointer.y - camera.y) / camera.scale;
      updateCamera({
        scale,
        x: pointer.x - worldX * scale,
        y: pointer.y - worldY * scale,
      });
    };
    const handleTouchPointer = (
      phase: "down" | "move" | "up",
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      if (event.pointerType !== "touch") return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const points =
        containerTouchPointersRef.current.get(surface.id) ?? new Map();
      containerTouchPointersRef.current.set(surface.id, points);
      if (phase === "up") {
        points.delete(event.pointerId);
        containerTouchGesturesRef.current.delete(surface.id);
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      points.set(event.pointerId, point);
      const values = [...points.values()];
      const center =
        values.length > 1
          ? {
              x: (values[0].x + values[1].x) / 2,
              y: (values[0].y + values[1].y) / 2,
            }
          : values[0];
      const distance =
        values.length > 1
          ? Math.hypot(
              values[1].x - values[0].x,
              values[1].y - values[0].y,
            )
          : undefined;
      const gesture = containerTouchGesturesRef.current.get(surface.id);
      if (phase === "down" || !gesture) {
        containerTouchGesturesRef.current.set(surface.id, {
          startCamera: camera,
          startCenter: center,
          startDistance: distance,
        });
        return;
      }
      updateCamera(
        cameraForTouchGesture(
          gesture.startCamera,
          gesture.startCenter,
          center,
          gesture.startDistance,
          distance,
          0.5,
          2,
        ),
      );
    };
    if (!scope) {
      return <div className="surface-empty">当前容器节点已不存在</div>;
    }
    const storedWorldSizes = surface.localState.scopeWorldSizes as
      | Record<string, { width: number; height: number }>
      | undefined;
    const storedResizeModes = surface.localState.scopeResizeModes as
      | Record<string, "simple" | "full">
      | undefined;
    const worldSize =
      storedWorldSizes?.[projectionKey] ??
      scope.canvasSize ??
      { width: 1400, height: 850 };
    const containerResizeMode =
      storedResizeModes?.[projectionKey] === "full" ? "full" : "simple";
    const moveContainer = (event: ReactPointerEvent<HTMLElement>) => {
      if (surface.nodeLayoutLocked || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const origin = { x: event.clientX, y: event.clientY };
      const startCamera = { ...camera };
      const move = (moveEvent: PointerEvent) =>
        updateCamera({
          ...startCamera,
          x: startCamera.x + moveEvent.clientX - origin.x,
          y: startCamera.y + moveEvent.clientY - origin.y,
        });
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };
    const resizeContainer = (
      direction: Parameters<typeof resizeBusinessNodeGeometry>[1],
      event: ReactPointerEvent<HTMLSpanElement>,
    ) => {
      if (surface.nodeLayoutLocked || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const origin = { x: event.clientX, y: event.clientY };
      const startCamera = { ...camera };
      const contentMinimum = (scope.children ?? []).reduce(
        (minimum, node) => {
          const size = businessNodeSize(node);
          return {
            width: Math.max(minimum.width, node.position.x + size.width + 80),
            height: Math.max(minimum.height, node.position.y + size.height + 60),
          };
        },
        { width: 640, height: 420 },
      );
      const move = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - origin.x) / camera.scale;
        const dy = (moveEvent.clientY - origin.y) / camera.scale;
        let width = worldSize.width;
        let height = worldSize.height;
        if (direction.includes("e")) {
          width = Math.max(contentMinimum.width, worldSize.width + dx);
        }
        if (direction.includes("s")) {
          height = Math.max(contentMinimum.height, worldSize.height + dy);
        }
        if (direction.includes("w")) {
          width = Math.max(contentMinimum.width, worldSize.width - dx);
        }
        if (direction.includes("n")) {
          height = Math.max(contentMinimum.height, worldSize.height - dy);
        }
        onWorkspaceChange(
          updateSurface(
            document.workspaceState,
            panel.id,
            surface.id,
            (candidate) => {
              if (candidate.kind !== "current-container") return candidate;
              return {
                ...candidate,
                projections: {
                  ...candidate.projections,
                  [projectionKey]: {
                    camera: {
                      ...startCamera,
                      x: direction.includes("w")
                        ? startCamera.x +
                          (worldSize.width - width) * startCamera.scale
                        : startCamera.x,
                      y: direction.includes("n")
                        ? startCamera.y +
                          (worldSize.height - height) * startCamera.scale
                        : startCamera.y,
                    },
                    nodeLayouts:
                      candidate.projections[projectionKey]?.nodeLayouts ?? {},
                  },
                },
                localState: {
                  ...candidate.localState,
                  scopeWorldSizes: {
                    ...((candidate.localState.scopeWorldSizes as Record<
                      string,
                      { width: number; height: number }
                    >) ?? {}),
                    [projectionKey]: { width, height },
                  },
                },
              };
            },
          ),
        );
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };
    const toggleContainerResizeMode = () =>
      onWorkspaceChange(
        updateSurface(
          document.workspaceState,
          panel.id,
          surface.id,
          (candidate) =>
            candidate.kind === "current-container"
              ? {
                  ...candidate,
                  localState: {
                    ...candidate.localState,
                    scopeResizeModes: {
                      ...((candidate.localState.scopeResizeModes as Record<
                        string,
                        "simple" | "full"
                      >) ?? {}),
                      [projectionKey]:
                        containerResizeMode === "simple" ? "full" : "simple",
                    },
                  },
                }
              : candidate,
        ),
      );
    const storeLayout = (node: IntentNode) =>
      onWorkspaceChange(
        updateSurface(
          document.workspaceState,
          panel.id,
          surface.id,
          (candidate) => {
            if (candidate.kind !== "current-container") return candidate;
            const projection = candidate.projections[projectionKey] ?? {
              camera,
              nodeLayouts: {},
            };
            return {
              ...candidate,
              projections: {
                ...candidate.projections,
                [projectionKey]: {
                  ...projection,
                  nodeLayouts: {
                    ...projection.nodeLayouts,
                    [node.id]: defaultNodeProjectionLayout(node),
                  },
                },
              },
            };
          },
        ),
      );
    const moveNode = (
      node: IntentNode,
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      if (event.pointerType === "touch") return;
      event.stopPropagation();
      if (
        surface.nodeLayoutLocked ||
        event.button !== 0
      ) {
        return;
      }
      const origin = { x: event.clientX, y: event.clientY };
      const start = { ...node.position };
      const size = businessNodeSize(node);
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        const position = clampBusinessNodePosition(
          start,
          {
            x: moveEvent.clientX - origin.x,
            y: moveEvent.clientY - origin.y,
          },
          camera.scale,
          size,
          worldSize,
        );
        storeLayout({ ...node, position });
      };
      const finish = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
    };
    const resizeNode = (
      node: IntentNode,
      direction: Parameters<typeof resizeBusinessNodeGeometry>[1],
      event: ReactPointerEvent<HTMLSpanElement>,
    ) => {
      event.stopPropagation();
      if (surface.nodeLayoutLocked || event.button !== 0) return;
      const origin = { x: event.clientX, y: event.clientY };
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        const geometry = resizeBusinessNodeGeometry(
          node,
          direction,
          {
            x: moveEvent.clientX - origin.x,
            y: moveEvent.clientY - origin.y,
          },
          camera.scale,
          worldSize,
        );
        storeLayout({
          ...node,
          position: geometry.position,
          size: geometry.size,
        });
      };
      const finish = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
    };
    const startPipe = (
      node: IntentNode,
      port: IntentNode["outputs"][number],
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const viewport = event.currentTarget.closest<HTMLElement>(
        ".surface-business-viewport",
      );
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const toWorld = (clientX: number, clientY: number) => ({
        x: (clientX - rect.left - camera.x) / camera.scale,
        y: (clientY - rect.top - camera.y) / camera.scale,
      });
      const size = businessNodeSize(node);
      const outputIndex = Math.max(
        0,
        node.outputs.findIndex((output) => output.id === port.id),
      );
      const pending = {
        surfaceId: surface.id,
        sourceNodeId: node.id,
        sourcePortId: port.id,
        from: {
          x: node.position.x + size.width,
          y:
            node.position.y +
            BUSINESS_PORT_TOP +
            outputIndex * BUSINESS_PORT_ROW +
            BUSINESS_PORT_ROW / 2,
        },
        to: toWorld(event.clientX, event.clientY),
      };
      setPendingContainerPipe(pending);
      const move = (moveEvent: PointerEvent) =>
        setPendingContainerPipe((active) =>
          active?.surfaceId === surface.id
            ? {
                ...active,
                to: toWorld(moveEvent.clientX, moveEvent.clientY),
              }
            : active,
        );
      const finish = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        setPendingContainerPipe(null);
        const target = window.document
          .elementFromPoint(upEvent.clientX, upEvent.clientY)
          ?.closest<HTMLElement>("[data-port-kind='input']");
        const targetNodeId = target?.dataset.portNode;
        const targetPortId = target?.dataset.portId;
        if (!targetNodeId || !targetPortId || targetNodeId === node.id) return;
        onUpdateInputBinding(
          targetNodeId,
          targetPortId,
          `ref:${node.id}:${port.id}`,
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
    };
    const outsideSelection =
      panel.selection.primaryNodeId &&
      !findNode(scope, panel.selection.primaryNodeId);
    return (
      <div className="surface-container-content">
        <nav
          onPointerDown={(event) =>
            beginDrag(
              {
                kind: "surface",
                panelId: panel.id,
                surfaceId: surface.id,
              },
              surface.frame,
              event,
            )
          }
        >
          <button
            disabled={surface.navigationStack.length <= 1}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              const parent = surface.navigationStack.at(-2);
              if (parent) navigateContainer(panel.id, surface, parent.nodeId);
            }}
          >
            ←
          </button>
          <strong>{scope.name}</strong>
          <span>
            {Math.round(camera.scale * 100)}
            %
          </span>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              onWorkspaceChange(
                updateSurface(
                  document.workspaceState,
                  panel.id,
                  surface.id,
                  (candidate) =>
                    candidate.kind === "current-container"
                      ? {
                          ...candidate,
                          projections: {
                            ...candidate.projections,
                            [projectionKey]: {
                              nodeLayouts:
                                candidate.projections[projectionKey]
                                  ?.nodeLayouts ?? {},
                              camera: {
                                ...camera,
                                scale: Math.max(0.5, camera.scale - 0.1),
                              },
                            },
                          },
                        }
                      : candidate,
                ),
              )
            }
          >
            −
          </button>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              onWorkspaceChange(
                updateSurface(
                  document.workspaceState,
                  panel.id,
                  surface.id,
                  (candidate) =>
                    candidate.kind === "current-container"
                      ? {
                          ...candidate,
                          projections: {
                            ...candidate.projections,
                            [projectionKey]: {
                              nodeLayouts:
                                candidate.projections[projectionKey]
                                  ?.nodeLayouts ?? {},
                              camera: {
                                ...camera,
                                scale: Math.min(2, camera.scale + 0.1),
                              },
                            },
                          },
                        }
                      : candidate,
                ),
              )
            }
          >
            +
          </button>
          <button
            className="surface-close"
            title={`关闭 ${surface.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              removeSurfaceFromPanel(panel, surface.id);
            }}
          >
            ×
          </button>
        </nav>
        <div className="surface-container-context">
          {currentContainerNode && (
            <div
              className="surface-container-ports"
              style={{
                height:
                  Math.max(
                    currentContainerNode.inputs.length,
                    currentContainerNode.outputs.length,
                  ) *
                    26 +
                  16,
              }}
            >
              {currentContainerNode.inputs.map((input, index) => (
                <span
                  className={`runtime-port runtime-port-input channel-${input.channel ?? "data"}`}
                  data-port-kind="input"
                  data-port-node={currentContainerNode.id}
                  data-port-id={input.id}
                  style={{ top: 8 + index * 26 }}
                  key={input.id}
                  title={input.name}
                >
                  <i />
                  <b>{input.name}</b>
                </span>
              ))}
              {currentContainerNode.outputs.map((output, index) => (
                <span
                  className={`runtime-port runtime-port-output channel-${output.channel ?? "data"}`}
                  data-port-kind="output"
                  data-port-node={currentContainerNode.id}
                  data-port-id={output.id}
                  style={{ top: 8 + index * 26 }}
                  key={output.id}
                  title={output.name}
                >
                  <b>{output.name}</b>
                  <i />
                </span>
              ))}
            </div>
          )}
          {outsideSelection && (
          <p className="surface-outside-selection">
            共享选择位于当前范围之外
          </p>
          )}
        </div>
        <div
          className="surface-business-viewport"
          onWheel={handleWheel}
          onPointerDown={(event) => handleTouchPointer("down", event)}
          onPointerMove={(event) => handleTouchPointer("move", event)}
          onPointerUp={(event) => handleTouchPointer("up", event)}
          onPointerCancel={(event) => handleTouchPointer("up", event)}
        >
          <div
            className="business-preview-world"
            style={{
              width: worldSize.width,
              height: worldSize.height,
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <BusinessGraphProjection
              projectionId={surface.id}
              scope={scope}
              worldSize={worldSize}
              scale={camera.scale}
              selectedNodeId={panel.selection.primaryNodeId}
              layoutLocked={surface.nodeLayoutLocked}
              containerResizeMode={containerResizeMode}
              pendingPipe={
                pendingContainerPipe?.surfaceId === surface.id
                  ? pendingContainerPipe
                  : null
              }
              onContainerMoveStart={moveContainer}
              onContainerResizeStart={resizeContainer}
              onContainerResizeModeToggle={toggleContainerResizeMode}
              onSelect={(node) =>
                selectNode(panel.id, node.id, surface.id)
              }
              onEnter={(node) => {
                if (node.children?.length) {
                  navigateContainer(panel.id, surface, node.id);
                }
              }}
              onMoveStart={moveNode}
              onResizeStart={resizeNode}
              onResizeModeToggle={(node) =>
                storeLayout({
                  ...node,
                  resizeMode:
                    node.resizeMode === "full" ? "simple" : "full",
                })
              }
              onDisplayModeToggle={(node) =>
                storeLayout({
                  ...node,
                  displayMode:
                    nodeDisplayMode(node) === "expanded"
                      ? "minimized"
                      : "expanded",
                })
              }
              onDisconnectInput={(node, port) =>
                onUpdateInputBinding(node.id, port.id, "")
              }
              onStartPipe={startPipe}
              onAddChild={() => onAddBusinessChild(scope.id)}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderFeatureHeaderActions = (
    panel: PanelInstance,
    surface: FeaturePanelSurface,
  ) => {
    const isFixedSource = surface.contextSource.mode === "fixed-container";
    const isFixedNode = surface.subject.mode === "fixed-node";
    const setScale = (scale: number, fitMode: "auto" | "manual" = "manual") =>
      onWorkspaceChange(
        updateSurface(
          document.workspaceState,
          panel.id,
          surface.id,
          (candidate) =>
            candidate.kind === "feature-panel"
              ? {
                  ...candidate,
                  viewport: {
                    ...candidate.viewport,
                    fitMode,
                    camera: {
                      ...candidate.viewport.camera,
                      scale: Math.max(0.5, Math.min(2, scale)),
                    },
                  },
                }
              : candidate,
        ),
      );
    return (
      <span className="surface-header-actions">
        <button
          title="缩小 Surface 内容"
          onClick={(event) => {
            event.stopPropagation();
            setScale(surface.viewport.camera.scale - 0.1);
          }}
        >
          −
        </button>
        <button
          title="适应 Surface"
          onClick={(event) => {
            event.stopPropagation();
            setScale(1, "auto");
          }}
        >
          {Math.round(surface.viewport.camera.scale * 100)}%
        </button>
        <button
          title="放大 Surface 内容"
          onClick={(event) => {
            event.stopPropagation();
            setScale(surface.viewport.camera.scale + 0.1);
          }}
        >
          +
        </button>
        <button
          className={isFixedSource ? "active" : ""}
          title={isFixedSource ? "解除固定上下文来源" : "固定当前容器来源"}
          onClick={(event) => {
            event.stopPropagation();
            const sourceId = panel.activeContainerSurfaceId;
            if (!sourceId && !isFixedSource) return;
            onWorkspaceChange(
              updateSurface(
                document.workspaceState,
                panel.id,
                surface.id,
                (candidate) =>
                  candidate.kind === "feature-panel"
                    ? {
                        ...candidate,
                        contextSource: isFixedSource
                          ? { mode: "follow-active-container" }
                          : {
                              mode: "fixed-container",
                              surfaceId: sourceId!,
                            },
                      }
                    : candidate,
              ),
            );
          }}
        >
          ↗
        </button>
        <button
          className={isFixedNode ? "active" : ""}
          title={isFixedNode ? "解除固定节点" : "固定当前选择节点"}
          onClick={(event) => {
            event.stopPropagation();
            const selected = panel.selection.primaryNodeId;
            if (!selected && !isFixedNode) return;
            onWorkspaceChange(
              updateSurface(
                document.workspaceState,
                panel.id,
                surface.id,
                (candidate) =>
                  candidate.kind === "feature-panel"
                    ? {
                        ...candidate,
                        subject: isFixedNode
                          ? { mode: "follow-panel-selection" }
                          : { mode: "fixed-node", nodeId: selected! },
                      }
                    : candidate,
              ),
            );
          }}
        >
          ◎
        </button>
      </span>
    );
  };

  const renderFeatureProjection = (
    panel: PanelInstance,
    surface: FeaturePanelSurface,
  ) => {
    const featureNode = findNode(document.rootIntent, surface.featureNodeId);
    if (!featureNode) {
      return (
        <div className="surface-empty">
          功能节点 {surface.featureNodeId} 已失效
        </div>
      );
    }
    const displayMode =
      surface.localState.displayMode === "minimized"
        ? "minimized"
        : "expanded";
    const projectedNode: IntentNode = { ...featureNode, displayMode };
    const scale = surface.viewport.camera.scale;
    return (
      <div
        className="feature-node-viewport"
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `translate(${surface.viewport.camera.x}px, ${surface.viewport.camera.y}px) scale(${scale})`,
        }}
      >
        <NodeProjection
          node={projectedNode}
          scale={surface.viewport.camera.scale}
          selected={panel.selection.primaryNodeId === featureNode.id}
          active={false}
          layoutLocked={panel.layoutLocked}
          embedded
          showResizeHandles={false}
          content={renderNodeContent(featureNode, {
            panelId: panel.id,
            surfaceId: surface.id,
          })}
          actions={
            <>
              {renderFeatureHeaderActions(panel, surface)}
              <button
                className="surface-close"
                title={`关闭 ${surface.title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  removeSurfaceFromPanel(panel, surface.id);
                }}
              >
                ×
              </button>
            </>
          }
          onSelect={() => undefined}
          onEnter={() => undefined}
          onMoveStart={(_node, event) =>
            beginDrag(
              {
                kind: "surface",
                panelId: panel.id,
                surfaceId: surface.id,
              },
              surface.frame,
              event,
            )
          }
          onResizeStart={() => undefined}
          onResizeModeToggle={() => undefined}
          onDisplayModeToggle={() =>
            onWorkspaceChange(
              updateSurface(
                document.workspaceState,
                panel.id,
                surface.id,
                (candidate) =>
                  candidate.kind === "feature-panel"
                    ? {
                        ...candidate,
                        localState: {
                          ...candidate.localState,
                          displayMode:
                            displayMode === "expanded"
                              ? "minimized"
                              : "expanded",
                        },
                      }
                    : candidate,
              ),
            )
          }
        />
      </div>
    );
  };

  return (
    <div className="workspace-v3">
      <header className="workspace-v3-bar">
        <strong>Intent Map</strong>
        <span>根内树 · 多视图工作区</span>
        <i>v3</i>
        <nav className="workspace-panel-switcher" aria-label="Panel 切换">
          {document.workspaceState.panels.map((panel) => (
            <button
              className={effectivePanelId === panel.id ? "active" : ""}
              key={panel.id}
              onClick={() => {
                setFocusedPanelId(panel.id);
                onWorkspaceChange({
                  ...document.workspaceState,
                  activePanelId: panel.id,
                });
              }}
            >
              {panel.title}
            </button>
          ))}
        </nav>
        <small>Panel 独立上下文 · Surface 同步选择</small>
        <button onClick={duplicateActivePanel}>复制当前 Panel</button>
      </header>
      <div className="workspace-v3-stage" ref={stageRef}>
        {document.workspaceState.panels.map((panel) => {
          const view = document.views.find((item) => item.id === panel.viewId);
          const freeLayout = view?.kind === "free-layout";
          return (
            <section
              className={`workspace-panel ${
                effectivePanelId === panel.id
                  ? "active"
                  : ""
              }`}
              key={panel.id}
              style={{
                ...frameStyle(panel.frame),
                zIndex:
                  effectivePanelId === panel.id
                    ? Math.max(
                        0,
                        ...document.workspaceState.panels.map(
                          (item) => item.zIndex,
                        ),
                      ) + 1
                    : panel.zIndex,
              }}
              onPointerDownCapture={() => setFocusedPanelId(panel.id)}
              onPointerDown={() =>
                onWorkspaceChange({
                  ...document.workspaceState,
                  activePanelId: panel.id,
                })
              }
            >
              <header
                className="workspace-panel-header"
                onPointerDown={(event) =>
                  beginDrag(
                    { kind: "panel", panelId: panel.id },
                    panel.frame,
                    event,
                  )
                }
              >
                <span>{view?.kind === "workbench" ? "▦" : "◇"}</span>
                <strong>{panel.title}</strong>
                <small>{panel.surfaces.length} Surface</small>
                {view?.kind === "workbench" && (
                  <>
                    <button
                      title="新增可独立下探的当前容器 Surface"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => addContainerSurface(panel)}
                    >
                      ＋容器
                    </button>
                    <select
                      aria-label={`向${panel.title}打开功能面板`}
                      value=""
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        if (event.target.value) {
                          addFeatureSurface(panel, event.target.value);
                        }
                      }}
                    >
                      <option value="">＋功能</option>
                      {(document.rootIntent.children ?? [])
                        .filter(
                          (node) =>
                            node.kind === "renderer" &&
                            node.id !== "current_container",
                        )
                        .map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <button
                  title="用当前实例布局更新 View"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onUpdateView(panel.id)}
                >
                  更新
                </button>
                <button
                  title="把当前实例另存为新 View"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSaveViewAs(panel.id)}
                >
                  另存
                </button>
                <button
                  title={panel.layoutLocked ? "解锁布局" : "锁定布局"}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() =>
                    onWorkspaceChange(
                      updatePanel(
                        document.workspaceState,
                        panel.id,
                        (candidate) => ({
                          ...candidate,
                          layoutLocked: !candidate.layoutLocked,
                        }),
                      ),
                    )
                  }
                >
                  {panel.layoutLocked ? "🔒" : "🔓"}
                </button>
                {!isCoreWorkspacePanel(panel.id) && (
                  <button
                    className="panel-close"
                    title={`关闭 ${panel.title}`}
                    aria-label={`关闭 ${panel.title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onWorkspaceChange(
                        removeWorkspacePanel(
                          document.workspaceState,
                          panel.id,
                        ),
                      );
                    }}
                  >
                    ×
                  </button>
                )}
              </header>
              <div className="workspace-panel-body">
                {!freeLayout && (
                  <PanelPipelineOverlay
                    root={document.rootIntent}
                    panel={panel}
                  />
                )}
                {freeLayout ? (
                  <article className="workspace-surface free-layout-surface">
                    <header className="workspace-surface-header">
                      <strong>当前容器 · 自由布局</strong>
                      <small>业务节点可下探</small>
                    </header>
                    <div className="workspace-surface-body">{freeCanvas}</div>
                  </article>
                ) : panel.surfaces.length ? (
                  panel.surfaces.map((surface) => (
                    <article
                      className={`workspace-surface surface-${surface.kind}`}
                      key={surface.id}
                      data-surface-id={surface.id}
                      style={{
                        ...frameStyle(surface.frame),
                        zIndex:
                          focusedSurface?.panelId === panel.id &&
                          focusedSurface.surfaceId === surface.id
                            ? Math.max(
                                0,
                                ...panel.surfaces.map((item) => item.zIndex),
                              ) + 1
                            : surface.zIndex,
                      }}
                      onPointerDownCapture={() =>
                        setFocusedSurface({
                          panelId: panel.id,
                          surfaceId: surface.id,
                        })
                      }
                    >
                      <div className="workspace-surface-body">
                        {surface.kind === "current-container"
                          ? renderContainer(panel, surface)
                          : renderFeatureProjection(panel, surface)}
                      </div>
                      {!panel.layoutLocked && (
                        <span
                          className="workspace-frame-resize surface-frame-resize"
                          onPointerDown={(event) =>
                            beginResize(
                              {
                                kind: "surface",
                                panelId: panel.id,
                                surfaceId: surface.id,
                              },
                              surface.frame,
                              event,
                            )
                          }
                        />
                      )}
                    </article>
                  ))
                ) : (
                  <div className="workspace-panel-empty">
                    当前 Panel 没有 Surface
                  </div>
                )}
              </div>
              {!panel.layoutLocked && (
                <span
                  className="workspace-frame-resize panel-frame-resize"
                  onPointerDown={(event) =>
                    beginResize(
                      { kind: "panel", panelId: panel.id },
                      panel.frame,
                      event,
                    )
                  }
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
