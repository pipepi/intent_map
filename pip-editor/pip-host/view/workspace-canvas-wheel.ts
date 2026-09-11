/** 管理自由布局画布上的触控板平移、缩放与语义层级切换。 */
import { useEffect, useRef, type RefObject } from "react";
import type { WorkspacePoint } from "../contracts/package-types.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import { forwardRoute, navigationForRoot } from "../projection/projection-routes.ts";
import { applySemanticScale } from "../projection/semantic-zoom.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import {
  panWindowContent,
  screenToWorld,
  zoomWindowContentAt,
  type FreeLayoutWorkspaceViews,
} from "../workspace/view-state.ts";

type SemanticGesture = {
  routeKey: string;
  scale: number;
  switched: boolean;
};

type WorkspaceCanvasWheelOptions = {
  free: boolean;
  nodeTypes: NodeTypePluginRegistry;
  normalized: FreeLayoutWorkspaceViews;
  onViewsChange: (views: FreeLayoutWorkspaceViews) => void;
  scopedSelections: Record<string, string[]>;
  setPreviewCamera: (camera: FreeLayoutWorkspaceViews["camera"] | undefined) => void;
  views: FreeLayoutWorkspaceViews;
  viewport: RefObject<HTMLDivElement | null>;
  workspace: WorkspaceSession;
};

const pointIn = (
  element: HTMLElement,
  clientX: number,
  clientY: number,
): WorkspacePoint => {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

/**
 * 原生 wheel listener 必须声明 passive:false，React 的合成事件无法可靠阻止
 * 浏览器页面缩放。当前活动投影优先消费手势，其余手势才交给工作区相机。
 */
export function useWorkspaceCanvasWheel({
  free,
  nodeTypes,
  normalized,
  onViewsChange,
  scopedSelections,
  setPreviewCamera,
  views,
  viewport,
  workspace,
}: WorkspaceCanvasWheelOptions) {
  const settleTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const semanticGestures = useRef(new Map<string, SemanticGesture>());

  useEffect(() => {
    const element = viewport.current;
    if (!free || !element) return;

    const handle = (event: globalThis.WheelEvent) => {
      const path = event.composedPath() as HTMLElement[];
      const projectionWindow = path.find((item) => item?.dataset?.nodeId);
      const windowId = projectionWindow?.dataset.nodeId;
      const frame = windowId ? views.projections[windowId] : undefined;
      // Creator 与系统插件不是业务投影，内部滚动不应被画布相机接管。
      if (windowId && !frame) return;
      event.preventDefault();
      const activeProjection = Boolean(
        windowId && frame && views.activeWindowId === windowId,
      );

      if (event.ctrlKey || event.metaKey) {
        if (windowId && frame && activeProjection) {
          const navigation = navigationForRoot(
            windowId,
            workspace.graph,
            nodeTypes,
            frame.navigation,
          );

          if (navigation) {
            const focused = path.find(
              (item) => item?.dataset?.embeddedProjection,
            )?.dataset.embeddedProjection;
            const selection = scopedSelections[windowId] ?? workspace.selection;
            const route = navigation.entries[navigation.index];
            const gestureKey = `${workspace.id}:${windowId}`;
            const routeKey = `${navigation.index}:${route.projectionNodeId}:${route.scope}`;
            const previous = semanticGestures.current.get(gestureKey);

            const finishGesture = () => {
              const old = settleTimers.current.get(gestureKey);
              if (old) clearTimeout(old);
              settleTimers.current.set(
                gestureKey,
                setTimeout(() => {
                  // 结束 pinch 只清空累加器；已选中的比例会保留到重置或路由切换。
                  semanticGestures.current.delete(gestureKey);
                  settleTimers.current.delete(gestureKey);
                }, 220),
              );
            };

            // 一次连续 pinch 最多跨越一个语义边界，后续 wheel 帧等待下一次手势。
            if (previous?.switched) {
              finishGesture();
              return;
            }

            const gesture = previous?.routeKey === routeKey
              ? previous
              : {
                routeKey,
                scale: navigation.semanticScale,
                switched: false,
              };
            const scale = gesture.scale * Math.exp(-event.deltaY * .002);
            gesture.scale = scale;

            const forward = forwardRoute(
              navigation,
              workspace.graph,
              nodeTypes,
              focused,
              selection[0],
            );
            const next = applySemanticScale(navigation, scale, forward);
            gesture.switched = next.index !== navigation.index;
            if (gesture.switched) gesture.scale = 1;
            semanticGestures.current.set(gestureKey, gesture);

            const surface = path.find(
              (item) => item?.dataset?.projectionSurface !== undefined,
            );
            const semanticViewport = path.find(
              (item) => item?.dataset?.rootWindow === windowId,
            );
            const unhintedNavigation = { ...next };
            delete unhintedNavigation.semanticTargetProjectionId;

            const nextNavigation = !gesture.switched && semanticViewport
              ? {
                ...unhintedNavigation,
                semanticOrigin: pointIn(
                  semanticViewport,
                  event.clientX,
                  event.clientY,
                ),
                ...(forward
                  ? { semanticTargetProjectionId: forward.projectionNodeId }
                  : {}),
              }
              : next;

            const nextFrame = !gesture.switched && surface
              ? zoomWindowContentAt(
                { ...frame, navigation: nextNavigation },
                pointIn(surface, event.clientX, event.clientY),
                navigation.semanticScale,
                next.semanticScale,
              )
              : { ...frame, navigation: nextNavigation };

            onViewsChange({
              ...normalized,
              projections: {
                ...normalized.projections,
                [windowId]: nextFrame,
              },
            });
            finishGesture();
            return;
          }
        }

        const point = pointIn(element, event.clientX, event.clientY);
        const before = screenToWorld(point, views);
        const scale = Math.max(
          .5,
          Math.min(2, views.camera.scale * Math.exp(-event.deltaY * .002)),
        );
        setPreviewCamera(undefined);
        onViewsChange({
          ...normalized,
          camera: {
            scale,
            x: point.x - before.x * scale,
            y: point.y - before.y * scale,
          },
        });
      } else if (windowId && frame && activeProjection) {
        onViewsChange({
          ...normalized,
          projections: {
            ...normalized.projections,
            [windowId]: panWindowContent(frame, {
              x: event.deltaX,
              y: event.deltaY,
            }),
          },
        });
      } else {
        setPreviewCamera(undefined);
        onViewsChange({
          ...normalized,
          activeWindowId: windowId ? normalized.activeWindowId : undefined,
          camera: {
            ...views.camera,
            x: views.camera.x - event.deltaX,
            y: views.camera.y - event.deltaY,
          },
        });
      }
    };

    element.addEventListener("wheel", handle, { passive: false });
    return () => element.removeEventListener("wheel", handle);
  }, [
    free,
    nodeTypes,
    normalized,
    onViewsChange,
    scopedSelections,
    setPreviewCamera,
    views,
    viewport,
    workspace,
  ]);
}
