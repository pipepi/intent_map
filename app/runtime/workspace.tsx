"use client";

import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
import {
  businessScopeAddress,
  getBusinessRoot,
  isCoreWorkspacePanel,
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

const featureLabel: Record<string, string> = {
  intent_tree: "节点树",
  properties: "属性检视器",
  validation: "验证",
  run_trace: "运行轨迹",
};

export function Workspace({
  document,
  freeCanvas,
  onWorkspaceChange,
  onUpdateView,
  onSaveViewAs,
  renderNodeContent,
}: WorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const businessRoot = getBusinessRoot(document);
  const workspaceUid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

  const duplicateActivePanel = () => {
    const source = document.workspaceState.panels.find(
      (panel) => panel.id === document.workspaceState.activePanelId,
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
    const scope = findNode(businessRoot, surface.scope.nodeId);
    const projectionKey = scopeCameraKey(surface.scope);
    const camera = surface.projections[projectionKey]?.camera ?? {
      scale: 0.55,
      x: 12,
      y: 12,
    };
    if (!scope) {
      return <div className="surface-empty">当前容器节点已不存在</div>;
    }
    const outsideSelection =
      panel.selection.primaryNodeId &&
      !findNode(scope, panel.selection.primaryNodeId);
    return (
      <div className="surface-container-content">
        <nav>
          <button
            disabled={surface.navigationStack.length <= 1}
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
        </nav>
        {outsideSelection && (
          <p className="surface-outside-selection">
            共享选择位于当前范围之外
          </p>
        )}
        <div
          className="surface-container-grid"
          style={{ "--surface-scale": camera.scale } as CSSProperties}
        >
          {(scope.children ?? []).map((node) => (
            <button
              key={node.id}
              className={
                panel.selection.primaryNodeId === node.id ? "selected" : ""
              }
              onClick={() => selectNode(panel.id, node.id, surface.id)}
              onDoubleClick={() => {
                if (node.children?.length) {
                  navigateContainer(panel.id, surface, node.id);
                }
              }}
            >
              <span>{node.kind}</span>
              <strong>{node.name}</strong>
              <small>{node.children?.length ?? 0} children</small>
            </button>
          ))}
          {!scope.children?.length && (
            <div className="surface-empty">当前节点没有直属业务子节点</div>
          )}
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
        onSelect={() => selectNode(panel.id, featureNode.id)}
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
                document.workspaceState.activePanelId === panel.id
                  ? "active"
                  : ""
              }`}
              key={panel.id}
              style={{ ...frameStyle(panel.frame), zIndex: panel.zIndex }}
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
                      style={{
                        ...frameStyle(surface.frame),
                        zIndex: surface.zIndex,
                      }}
                    >
                      <header
                        className="workspace-surface-header"
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
                        <strong>
                          {surface.kind === "feature-panel"
                            ? featureLabel[surface.featureNodeId] ??
                              surface.title
                            : surface.title}
                        </strong>
                        <small>
                          {surface.kind === "current-container"
                            ? "可下探容器"
                            : "功能面板"}
                        </small>
                        {surface.kind === "feature-panel" &&
                          renderFeatureHeaderActions(panel, surface)}
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
                      </header>
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
