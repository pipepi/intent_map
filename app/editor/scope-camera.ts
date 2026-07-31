// ============================================================================
// 作用域相机族（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 管理"世界坐标 → 屏幕坐标"的相机（scale/x/y），五个操作一组返回：
//
//   setScopeCamera            设置相机（立即写 state + ref 供手势闭包读取；
//                             persist=true 时持久化到当前作用域投影，
//                             下次进入该作用域可恢复视角）
//   calculateFitCamera        计算"适应视图"相机：业务域按子节点包围盒
//                             （四周留 ~200px 余量），应用域按整块画布；
//                             缩放限制在 MIN_SCALE–MAX_SCALE 并居中
//   cameraKeepsScopeVisible   判断给定相机下作用域是否仍有 ≥96×96px 可见
//                             （相机恢复策略用：太偏就放弃旧视角改适应视图）
//   fitScope                  执行适应视图并持久化
//   centerScopeAtScale        计算"以指定缩放居中"的相机（内容比视口大时
//                             贴左上留 padding）；用于数字键 0 / 进新作用域
//
// 用法（page.tsx）：
//   const scopeCameraDeps = useMemo<ScopeCameraDeps>(() => ({ ... }), [...]);
//   const cameraOps = useMemo(() => createScopeCameraOps(scopeCameraDeps), [scopeCameraDeps]);
// useMemo 保持函数身份稳定（键盘 effect 依赖 fitScope 等），语义等同原来的
// useCallback 依赖数组。工厂仅在事件/effect 回调中读 ref，渲染期不解引用。
// ============================================================================

import type { CameraState, IntentDocumentV3, IntentNode } from "../runtime/model";
import { updateSurface } from "../runtime/model";
import { businessNodeSize } from "../runtime/business-canvas";

import { FIT_VIEW_PADDING, MAX_SCALE, MIN_SCALE } from "./constants";

/** 相机族所需的外部依赖（page.tsx 用 useMemo 组装，保持身份稳定）。 */
export interface ScopeCameraDeps {
  /** 视口 DOM（读 clientWidth/Height 计算适配；ref 只在回调中读） */
  viewportRef: { current: HTMLDivElement | null };
  /** 相机 ref（setScopeCamera 同步写入，供手势闭包读最新值） */
  cameraRef: { current: CameraState };
  /** 相机 state setter */
  setCamera: (camera: CameraState) => void;
  /** 文档 state setter（persist 时函数式更新投影表） */
  setDocumentState: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
  /** 当前作用域的投影存储键 */
  activeCameraKey: string;
  /** 当前作用域世界尺寸 */
  scopeWorldSize: { width: number; height: number };
  /** 是否在业务域（决定适应视图按包围盒还是按画布） */
  isBusinessScope: boolean;
  /** 当前可见子节点（业务域包围盒计算的输入） */
  visibleNodes: IntentNode[];
  /** 当前作用域节点（读 canvasSize 上限） */
  scopeNode: IntentNode;
}

export interface ScopeCameraOps {
  setScopeCamera: (next: CameraState, persist?: boolean) => void;
  calculateFitCamera: () => CameraState | undefined;
  cameraKeepsScopeVisible: (candidate: CameraState) => boolean;
  fitScope: () => void;
  centerScopeAtScale: (scale: number) => CameraState | undefined;
}

/** 创建相机族操作。所有 ref 读取都发生在返回闭包被调用时（事件/effect 回调）。 */
export function createScopeCameraOps(deps: ScopeCameraDeps): ScopeCameraOps {
  const {
    viewportRef,
    cameraRef,
    setCamera,
    setDocumentState,
    activeCameraKey,
    scopeWorldSize,
    isBusinessScope,
    visibleNodes,
    scopeNode,
  } = deps;

  const setScopeCamera = (next: CameraState, persist = false) => {
    cameraRef.current = next;
    setCamera(next);
    if (persist) {
      setDocumentState((active) =>
        updateSurface(
          active,
          "panel-free-layout",
          "free-layout-container",
          (surface) =>
            surface.kind === "current-container"
              ? {
                  ...surface,
                  projections: {
                    ...surface.projections,
                    [activeCameraKey]: {
                      camera: next,
                      nodeLayouts:
                        surface.projections[activeCameraKey]?.nodeLayouts ??
                        {},
                    },
                  },
                }
              : surface,
        ),
      );
    }
  };

  const calculateFitCamera = (): CameraState | undefined => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const world = (() => {
      // 业务画布按内容包围盒适配，避免大片留白。
      if (isBusinessScope && visibleNodes.length) {
        const rawLeft = Math.min(...visibleNodes.map((n) => n.position.x));
        const left = Math.max(0, rawLeft - 200);
        const top = Math.min(...visibleNodes.map((n) => n.position.y));
        const rawRight = Math.max(...visibleNodes.map((n) => n.position.x + businessNodeSize(n).width));
        const right = Math.min(scopeNode.canvasSize?.width ?? rawRight, rawRight + 200);
        const bottom = Math.max(...visibleNodes.map((n) => n.position.y + businessNodeSize(n).height));
        return {
          width: right - left + 160,
          height: bottom - top + 160,
          offsetX: left - 80,
          offsetY: top - 80,
        };
      }
      return { width: scopeWorldSize.width, height: scopeWorldSize.height, offsetX: 0, offsetY: 0 };
    })();
    const availableWidth = Math.max(
      1,
      viewport.clientWidth - FIT_VIEW_PADDING * 2,
    );
    const availableHeight = Math.max(
      1,
      viewport.clientHeight - FIT_VIEW_PADDING * 2,
    );
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        MAX_SCALE,
        Math.min(
          availableWidth / world.width,
          availableHeight / world.height,
        ),
      ),
    );
    return {
      scale,
      x: (viewport.clientWidth - world.width * scale) / 2 - world.offsetX * scale,
      y: (viewport.clientHeight - world.height * scale) / 2 - world.offsetY * scale,
    };
  };

  const cameraKeepsScopeVisible = (candidate: CameraState) => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, candidate.scale),
    );
    const left = candidate.x;
    const top = candidate.y;
    const right = left + scopeWorldSize.width * scale;
    const bottom = top + scopeWorldSize.height * scale;
    const visibleWidth =
      Math.min(viewport.clientWidth, right) - Math.max(0, left);
    const visibleHeight =
      Math.min(viewport.clientHeight, bottom) - Math.max(0, top);
    return visibleWidth >= 96 && visibleHeight >= 96;
  };

  const fitScope = () => {
    const next = calculateFitCamera();
    if (next) setScopeCamera(next, true);
  };

  const centerScopeAtScale = (scale: number): CameraState | undefined => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const safeScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    const scaledWidth = scopeWorldSize.width * safeScale;
    const scaledHeight = scopeWorldSize.height * safeScale;
    const centeredX = (viewport.clientWidth - scaledWidth) / 2;
    const centeredY = (viewport.clientHeight - scaledHeight) / 2;
    return {
      scale: safeScale,
      x:
        scaledWidth > viewport.clientWidth - FIT_VIEW_PADDING * 2
          ? FIT_VIEW_PADDING
          : centeredX,
      y:
        scaledHeight > viewport.clientHeight - FIT_VIEW_PADDING * 2
          ? FIT_VIEW_PADDING
          : centeredY,
    };
  };

  return {
    setScopeCamera,
    calculateFitCamera,
    cameraKeepsScopeVisible,
    fitScope,
    centerScopeAtScale,
  };
}
