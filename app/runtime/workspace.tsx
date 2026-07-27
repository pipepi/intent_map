"use client";

import {
  useEffect,
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
import {
  NodeProjection,
  PortRegionToggle,
  type ResizeDirection,
} from "./node-renderer";
import { BusinessGraphProjection } from "./business-graph-projection";
import {
  BUSINESS_PORT_ROW,
  BUSINESS_PORT_TOP,
  BUSINESS_SEMANTIC_ZOOM_ENTER_SCALE,
  businessNodeTreeDepth,
  businessNodeSize,
  clampBusinessNodePosition,
  nearestBusinessChild,
  pickBusinessNodeDragTarget,
  resizeBusinessNodeGeometry,
} from "./business-canvas";
import {
  defaultNodeProjectionLayout,
  projectIntentTree,
} from "./projection";
import {
  cameraForTouchGesture,
  scaleForWheelGesture,
} from "./camera";
import { derivePanelPipelineEdges } from "./panel-pipelines";
import {
  findAvailableSurfaceFrame,
  validatePortConnection,
} from "./authoring";
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
  onUpdateOutputMapping: (
    nodeId: string,
    portId: string,
    value: string,
  ) => void;
  onAddBusinessChild: (scopeId: string) => void;
  onFeedback: (message: string) => void;
};

type DragTarget =
  | { kind: "panel"; panelId: string }
  | { kind: "surface"; panelId: string; surfaceId: string };

const surfaceResizeDirections = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
] as const satisfies readonly ResizeDirection[];
const simpleSurfaceResizeDirections = [
  "e",
  "s",
  "se",
] as const satisfies readonly ResizeDirection[];
const MINIMIZED_SURFACE_SIZE = { width: 0.18, height: 0.12 };

export const transientSurfaceZIndex = (
  panel: PanelInstance,
  surfaceId: string,
  focusedSurfaceId?: string,
) =>
  surfaceId === focusedSurfaceId
    ? Math.max(0, ...panel.surfaces.map((surface) => surface.zIndex)) + 1
    : panel.surfaces.find((surface) => surface.id === surfaceId)?.zIndex ?? 0;

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

const clampSurfaceFrame = (frame: NormalizedFrame): NormalizedFrame => {
  const maxBottom = 1;
  const width = Math.max(0.12, Math.min(1, frame.width));
  const height = Math.max(0.12, Math.min(maxBottom, frame.height));
  const x = Math.max(0, Math.min(1 - width, frame.x));
  const y = Math.max(0, Math.min(maxBottom - height, frame.y));
  return { x, y, width, height };
};

const storedSurfaceFrame = (value: unknown): NormalizedFrame | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number"
  ) {
    return;
  }
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
};

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
  focusedSurfaceId,
}: {
  root: IntentNode;
  panel: PanelInstance;
  focusedSurfaceId?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 1000 });
  const [measuredPoints, setMeasuredPoints] = useState<
    Record<string, MeasuredPipelinePoint>
  >({});
  const edges = useMemo(
    () => derivePanelPipelineEdges(root, panel),
    [root, panel],
  );
  const edgeLayers = useMemo(() => {
    const maximumSurfaceZ = Math.max(
      0,
      ...panel.surfaces.map((surface) => surface.zIndex),
    );
    const effectiveSurfaceZ = (surfaceId?: string) => {
      const surface = panel.surfaces.find(
        (candidate) => candidate.id === surfaceId,
      );
      if (!surface) return 0;
      return surface.id === focusedSurfaceId
        ? maximumSurfaceZ + 1
        : surface.zIndex;
    };
    const layers = new Map<number, typeof edges>();
    for (const edge of edges) {
      const zIndex = Math.max(
        effectiveSurfaceZ(edge.sourceSurfaceId),
        effectiveSurfaceZ(edge.targetSurfaceId),
      );
      layers.set(zIndex, [...(layers.get(zIndex) ?? []), edge]);
    }
    return [...layers.entries()].sort(([left], [right]) => left - right);
  }, [edges, focusedSurfaceId, panel.surfaces]);

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
    <div ref={overlayRef} className="panel-pipeline-overlay" aria-hidden="true">
      {edgeLayers.map(([zIndex, layerEdges]) => (
        <svg
          className="panel-pipeline-layer"
          data-pipeline-z={zIndex}
          key={zIndex}
          style={{ zIndex }}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          {layerEdges.map((edge) => {
            const source = measuredPoints[`${edge.id}:source`] ?? {
              x: edge.source.x * size.width,
              y: edge.source.y * size.height,
            };
            const target = measuredPoints[`${edge.id}:target`] ?? {
              x: edge.target.x * size.width,
              y: edge.target.y * size.height,
            };
            const bend = Math.max(
              55,
              Math.abs(target.x - source.x) * 0.42,
            );
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
      ))}
    </div>
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
  onUpdateOutputMapping,
  onAddBusinessChild,
  onFeedback,
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
  const spacePanReadyRef = useRef(false);
  const [spacePanReady, setSpacePanReady] = useState(false);
  const [panningSurfaceId, setPanningSurfaceId] = useState<string | null>(
    null,
  );
  const [pendingContainerPipe, setPendingContainerPipe] = useState<{
    surfaceId: string;
    sourceKind: "environment" | "node";
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
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return !!(
        element &&
        (element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.tagName === "SELECT" ||
          element.isContentEditable)
      );
    };
    const setReady = (ready: boolean) => {
      spacePanReadyRef.current = ready;
      setSpacePanReady(ready);
    };
    const onSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;
      event.preventDefault();
      setReady(true);
    };
    const onSpaceUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setReady(false);
    };
    const onBlur = () => {
      setReady(false);
      setPanningSurfaceId(null);
    };
    window.addEventListener("keydown", onSpaceDown);
    window.addEventListener("keyup", onSpaceUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  useEffect(() => {
    const preventWebViewPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", preventWebViewPageZoom, {
      capture: true,
      passive: false,
    });
    return () =>
      window.removeEventListener("wheel", preventWebViewPageZoom, {
        capture: true,
      });
  }, []);
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
    const availableFrame = findAvailableSurfaceFrame(
      panel.surfaces.map((surface) => surface.frame),
      { width: 0.5, height: 0.55 },
    );
    const surface: ContainerSurface =
      active?.kind === "current-container"
        ? {
            ...active,
            id,
            title: "当前容器",
            frame: availableFrame,
            zIndex: Math.max(0, ...panel.surfaces.map((item) => item.zIndex)) + 1,
          }
        : {
            kind: "current-container",
            id,
            title: "当前容器",
            frame: availableFrame,
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
            localState: {
              portsExpanded: false,
              frameResizeMode: "simple",
            },
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
    const availableFrame = findAvailableSurfaceFrame(
      panel.surfaces.map((surface) => surface.frame),
      { width: 0.34, height: 0.4 },
    );
    const surface: FeaturePanelSurface = {
      kind: "feature-panel",
      id,
      featureNodeId,
      title: node.name,
      frame: availableFrame,
      zIndex: Math.max(0, ...panel.surfaces.map((item) => item.zIndex)) + 1,
      viewport: {
        camera: { scale: 1, x: 0, y: 0 },
        fitMode: "auto",
      },
      contextSource: { mode: "follow-active-container" },
      subject: { mode: "follow-panel-selection" },
      localState: {
        portsExpanded: false,
        frameResizeMode: "simple",
      },
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

  const renderSurfaceResizeModeToggle = (
    panel: PanelInstance,
    surface: SurfaceInstance,
  ) => {
    if (panel.layoutLocked) return null;
    const mode =
      surface.localState.frameResizeMode === "full" ? "full" : "simple";
    const selected =
      focusedSurface?.panelId === panel.id &&
      focusedSurface.surfaceId === surface.id;
    return (
      <button
        className={`resize-mode-toggle surface-inline-mode-toggle ${mode} ${
          selected ? "selected" : ""
        }`}
        aria-label={
          mode === "simple"
            ? `将「${surface.title}」切换为四边四角缩放`
            : `将「${surface.title}」切换为右边、下边和右下角缩放`
        }
        title={
          mode === "simple"
            ? "当前：右边、下边、右下角 · 点击切换为八向"
            : "当前：四边四角 · 点击切换为三向"
        }
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onWorkspaceChange(
            updateSurface(
              document.workspaceState,
              panel.id,
              surface.id,
              (candidate) => ({
                ...candidate,
                localState: {
                  ...candidate.localState,
                  frameResizeMode: mode === "simple" ? "full" : "simple",
                },
              }),
            ),
          );
        }}
      >
        {mode === "simple" ? "┘" : "⤡"}
      </button>
    );
  };

  const toggleSurfaceDisplayMode = (
    panel: PanelInstance,
    surface: SurfaceInstance,
  ) => {
    const minimizing = surface.localState.displayMode !== "minimized";
    onWorkspaceChange(
      updateSurface(
        document.workspaceState,
        panel.id,
        surface.id,
        (candidate) => {
          const expandedFrame = storedSurfaceFrame(
            candidate.localState.expandedFrame,
          );
          const minimizedFrame = storedSurfaceFrame(
            candidate.localState.minimizedFrame,
          );
          const fallbackMinimized = clampSurfaceFrame({
            ...candidate.frame,
            width: Math.min(
              candidate.frame.width,
              MINIMIZED_SURFACE_SIZE.width,
            ),
            height: MINIMIZED_SURFACE_SIZE.height,
          });
          return {
            ...candidate,
            frame: minimizing
              ? clampSurfaceFrame(minimizedFrame ?? fallbackMinimized)
              : clampSurfaceFrame(expandedFrame ?? candidate.frame),
            localState: {
              ...candidate.localState,
              displayMode: minimizing ? "minimized" : "expanded",
              expandedFrame: minimizing
                ? candidate.frame
                : candidate.localState.expandedFrame,
              minimizedFrame: minimizing
                ? candidate.localState.minimizedFrame ?? fallbackMinimized
                : candidate.frame,
            },
          };
        },
      ),
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
      const next = (target.kind === "surface" ? clampSurfaceFrame : clampFrame)({
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
    direction: ResizeDirection,
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
      const dx = (moveEvent.clientX - start.x) / bounds.width;
      const dy = (moveEvent.clientY - start.y) / bounds.height;
      let left = frame.x;
      let top = frame.y;
      let right = frame.x + frame.width;
      let bottom = frame.y + frame.height;
      if (direction.includes("e")) {
        right = Math.max(left + 0.12, Math.min(1, right + dx));
      }
      if (direction.includes("w")) {
        left = Math.max(0, Math.min(right - 0.12, left + dx));
      }
      if (direction.includes("s")) {
        bottom = Math.max(top + 0.12, Math.min(1, bottom + dy));
      }
      if (direction.includes("n")) {
        top = Math.max(0, Math.min(bottom - 0.12, top + dy));
      }
      const next = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
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
    resetCamera = false,
  ) => {
    const path = findPath(businessRoot, nodeId);
    if (!path) return;
    const targetScope = businessScopeAddress(nodeId);
    const targetProjectionKey = scopeCameraKey(targetScope);
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
                  scope: targetScope,
                  navigationStack,
                  projections: resetCamera
                    ? {
                        ...candidate.projections,
                        [targetProjectionKey]: {
                          camera: { scale: 1, x: 12, y: 12 },
                          nodeLayouts:
                            candidate.projections[targetProjectionKey]
                              ?.nodeLayouts ?? {},
                        },
                      }
                    : candidate.projections,
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
      // event.preventDefault();
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
      const scale = scaleForWheelGesture(
        camera.scale,
        event.deltaY,
        0.5,
        2,
      );
      const worldX = (pointer.x - camera.x) / camera.scale;
      const worldY = (pointer.y - camera.y) / camera.scale;
      if (
        event.deltaY < 0 &&
        scale >= BUSINESS_SEMANTIC_ZOOM_ENTER_SCALE
      ) {
        const nearestChild = nearestBusinessChild(scope?.children ?? [], {
          x: worldX,
          y: worldY,
        });
        if (nearestChild) {
          navigateContainer(panel.id, surface, nearestChild.id, true);
          return;
        }
      }
      if (
        event.deltaY > 0 &&
        scale <= 0.5 &&
        surface.navigationStack.length > 1
      ) {
        const parent = surface.navigationStack.at(-2);
        if (parent) {
          navigateContainer(panel.id, surface, parent.nodeId, true);
          return;
        }
      }
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
    const startSpacePan = (
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      if (
        event.pointerType === "touch" ||
        event.button !== 0 ||
        !spacePanReadyRef.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPanningSurfaceId(surface.id);
      const origin = { x: event.clientX, y: event.clientY };
      const startCamera = { ...camera };
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) =>
        updateCamera({
          ...startCamera,
          x: startCamera.x + moveEvent.clientX - origin.x,
          y: startCamera.y + moveEvent.clientY - origin.y,
        });
      const finish = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
        setPanningSurfaceId((activeId) =>
          activeId === surface.id ? null : activeId,
        );
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
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
    const portsExpanded = surface.localState.portsExpanded === true;
    const togglePortsExpanded = () =>
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
                    portsExpanded:
                      candidate.localState.portsExpanded !== true,
                  },
                }
              : candidate,
        ),
      );
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
    const startNodeMove = (
      node: IntentNode,
      event: ReactPointerEvent<HTMLElement>,
      target: HTMLElement,
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
    const moveNode = (
      node: IntentNode,
      event: ReactPointerEvent<HTMLElement>,
    ) => startNodeMove(node, event, event.currentTarget);
    const moveNearestNode = (
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      if (
        event.pointerType === "touch" ||
        event.button !== 0 ||
        (!event.ctrlKey && !event.metaKey) ||
        surface.nodeLayoutLocked
      )
        return;
      const viewport = event.currentTarget;
      const candidates = [
        ...viewport.querySelectorAll<HTMLElement>(
          ".business-node[data-node-id]",
        ),
      ].flatMap((element, paintOrder) => {
        const nodeId = element.dataset.nodeId;
        const node = scope.children?.find(
          (candidate) => candidate.id === nodeId,
        );
        if (!node) return [];
        const rect = element.getBoundingClientRect();
        const computedZIndex = Number.parseInt(
          window.getComputedStyle(element).zIndex,
          10,
        );
        let domDepth = 0;
        let parent = element.parentElement;
        while (parent && parent !== viewport) {
          domDepth += 1;
          parent = parent.parentElement;
        }
        return [
          {
            value: node,
            bounds: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            },
            zIndex: Number.isFinite(computedZIndex) ? computedZIndex : 0,
            treeDepth:
              businessNodeTreeDepth(projectedBusinessRoot, node.id) ?? 0,
            domDepth,
            paintOrder,
          },
        ];
      });
      const targetNode = pickBusinessNodeDragTarget(candidates, {
        x: event.clientX,
        y: event.clientY,
      });
      if (!targetNode) return;
      event.preventDefault();
      startNodeMove(targetNode, event, viewport);
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
      sourceKind: "environment" | "node" = "node",
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
        sourceKind === "environment"
          ? node.inputs.findIndex((input) => input.id === port.id)
          : node.outputs.findIndex((output) => output.id === port.id),
      );
      const pending = {
        surfaceId: surface.id,
        sourceKind,
        sourceNodeId: node.id,
        sourcePortId: port.id,
        from: {
          x:
            sourceKind === "environment"
              ? -9
              : node.position.x + size.width,
          y:
            sourceKind === "environment"
              ? 132 + 12 + outputIndex * BUSINESS_PORT_ROW
              : node.position.y +
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
          ?.closest<HTMLElement>("[data-port-kind]");
        const targetKind = target?.dataset.portKind;
        if (targetKind !== "input" && targetKind !== "container-output") return;
        const targetNodeId = target?.dataset.portNode;
        const targetPortId = target?.dataset.portId;
        if (!targetNodeId || !targetPortId) return;
        if (
          sourceKind === "node" &&
          targetKind === "input" &&
          targetNodeId === node.id
        ) return;
        const targetNode = findNode(scope, targetNodeId);
        const targetPort =
          targetKind === "container-output"
            ? targetNode?.outputs.find(
                (candidate) => candidate.id === targetPortId,
              )
            : targetNode?.inputs.find(
                (candidate) => candidate.id === targetPortId,
              );
        if (!targetPort) return;
        const compatibility = validatePortConnection(port, targetPort);
        if (!compatibility.ok) {
          onFeedback(`连接失败：${compatibility.error}`);
          return;
        }
        const value =
          sourceKind === "environment"
            ? `env:${port.id}`
            : `ref:${node.id}:${port.id}`;
        if (targetKind === "container-output") {
          onUpdateOutputMapping(targetNodeId, targetPortId, value);
        } else {
          onUpdateInputBinding(targetNodeId, targetPortId, value);
        }
        onFeedback(
          `已连接 ${node.name} · ${port.name} → ${targetNode?.name ?? targetNodeId} · ${targetPort.name}`,
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
    };
    const outsideSelection =
      panel.selection.primaryNodeId &&
      !findNode(scope, panel.selection.primaryNodeId);
    if (!currentContainerNode) {
      return <div className="surface-empty">当前容器渲染器节点已不存在</div>;
    }
    const displayMode =
      surface.localState.displayMode === "minimized"
        ? "minimized"
        : "expanded";
    const projectedContainerNode: IntentNode = {
      ...currentContainerNode,
      displayMode,
    };
    const setCameraScale = (scale: number) =>
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
                        candidate.projections[projectionKey]?.nodeLayouts ?? {},
                      camera: {
                        ...camera,
                        scale: Math.max(0.5, Math.min(2, scale)),
                      },
                    },
                  },
                }
              : candidate,
        ),
      );
    return (
      <NodeProjection
        node={projectedContainerNode}
        scale={1}
        selected={false}
        active
        layoutLocked={panel.layoutLocked}
        embedded
        showResizeHandles={false}
        portsExpanded={portsExpanded}
        surfacePortRegion
        actions={
          <>
            <button
              disabled={surface.navigationStack.length <= 1}
              title="返回上一层容器"
              onClick={() => {
                const parent = surface.navigationStack.at(-2);
                if (parent) navigateContainer(panel.id, surface, parent.nodeId);
              }}
            >
              ←
            </button>
            <span className="container-scope-label" title={scope.name}>
              {scope.name}
            </span>
            <button title="缩小当前容器" onClick={() => setCameraScale(camera.scale - 0.1)}>
              −
            </button>
            <button title="当前容器缩放比例">
              {Math.round(camera.scale * 100)}%
            </button>
            <button title="放大当前容器" onClick={() => setCameraScale(camera.scale + 0.1)}>
              +
            </button>
            <PortRegionToggle
              expanded={portsExpanded}
              onToggle={togglePortsExpanded}
            />
            <button
              className="surface-close"
              title={`关闭 ${surface.title}`}
              onClick={() => removeSurfaceFromPanel(panel, surface.id)}
            >
              ×
            </button>
            {renderSurfaceResizeModeToggle(panel, surface)}
          </>
        }
        content={
          <div className="surface-container-projection-body">
          {outsideSelection && (
            <p className="surface-outside-selection">
              共享选择位于当前范围之外
            </p>
          )}
          <div
          className={`surface-business-viewport ${spacePanReady ? "space-pan-ready" : ""} ${panningSurfaceId === surface.id ? "space-panning" : ""}`}
          aria-label={`${scope.name} 容器画布`}
          title="按住空格拖拽平移；Ctrl+拖拽移动鼠标附近的最上层节点；Ctrl+滚轮或双指缩放"
          onWheel={handleWheel}
          onPointerDownCapture={(event) => {
            if (spacePanReadyRef.current) startSpacePan(event);
            else moveNearestNode(event);
          }}
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
              onStartContainerInput={(port, event) =>
                startPipe(scope, port, event, "environment")
              }
              onDisconnectContainerOutput={(port) =>
                onUpdateOutputMapping(scope.id, port.id, "")
              }
              onAddChild={() => onAddBusinessChild(scope.id)}
             />
           </div>
         </div>
        </div>
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
          toggleSurfaceDisplayMode(panel, surface)
        }
      />
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
    const portsExpanded = surface.localState.portsExpanded === true;
    const togglePortsExpanded = () =>
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
                    portsExpanded:
                      candidate.localState.portsExpanded !== true,
                  },
                }
              : candidate,
        ),
      );
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
          portsExpanded={portsExpanded}
          surfacePortRegion
          content={renderNodeContent(featureNode, {
            panelId: panel.id,
            surfaceId: surface.id,
          })}
          actions={
            <>
              <PortRegionToggle
                expanded={portsExpanded}
                onToggle={togglePortsExpanded}
              />
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
              {renderSurfaceResizeModeToggle(panel, surface)}
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
            toggleSurfaceDisplayMode(panel, surface)
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
                          surfaces: candidate.layoutLocked
                            ? candidate.surfaces.map((surface) => ({
                                ...surface,
                                frame: clampSurfaceFrame(surface.frame),
                              }))
                            : candidate.surfaces,
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
                    focusedSurfaceId={
                      focusedSurface?.panelId === panel.id
                        ? focusedSurface.surfaceId
                        : undefined
                    }
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
                  panel.surfaces.map((surface) => {
                    const frameResizeMode =
                      surface.localState.frameResizeMode === "full"
                        ? "full"
                        : "simple";
                    const resizeDirections =
                      frameResizeMode === "full"
                        ? surfaceResizeDirections
                        : simpleSurfaceResizeDirections;
                    const surfaceFocused =
                      focusedSurface?.panelId === panel.id &&
                      focusedSurface.surfaceId === surface.id;
                    return (
                    <article
                      className={`workspace-surface surface-${surface.kind}`}
                      key={surface.id}
                      data-surface-id={surface.id}
                      style={{
                        ...frameStyle(surface.frame),
                        zIndex: transientSurfaceZIndex(
                          panel,
                          surface.id,
                          surfaceFocused ? surface.id : undefined,
                        ),
                      }}
                      onPointerDownCapture={() =>
                        setFocusedSurface({
                          panelId: panel.id,
                          surfaceId: surface.id,
                        })
                      }
                      onFocusCapture={() =>
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
                        <>
                          <span
                            className={`surface-resize-layer ${
                              surfaceFocused ? "selected" : ""
                            }`}
                            aria-hidden="true"
                          >
                            {resizeDirections.map((direction) => (
                              <span
                                className={`resize-handle resize-${direction}`}
                                data-resize-direction={direction}
                                key={direction}
                                onPointerDown={(event) =>
                                  beginResize(
                                    {
                                      kind: "surface",
                                      panelId: panel.id,
                                      surfaceId: surface.id,
                                    },
                                    surface.frame,
                                    direction,
                                    event,
                                  )
                                }
                              />
                            ))}
                          </span>
                        </>
                      )}
                    </article>
                    );
                  })
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
                      "se",
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
