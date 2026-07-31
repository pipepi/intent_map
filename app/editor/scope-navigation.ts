// ============================================================================
// 作用域导航族（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 钻取路径栈（navigationStack）的压入/弹出 + "缩放即导航"滚轮手势：
//
//   navigateToParent       返回上级：弹栈一层；若回到业务域，
//                          同步 businessScopeId 与选中节点
//   navigateToScopeFrame   面包屑跳转：截断栈到第 index 层，
//                          按目标域同步选中状态、标记适应视图
//   enterNode              进入节点（双击/Enter/Ctrl+滚轮），280ms 防连击；
//                          按节点类型分四种：current-container 渲染器解引用
//                          直进业务画布 / 业务引用节点 / 业务子作用域 /
//                          应用子作用域
//   nearestNode            屏幕坐标 → 世界坐标下中心距离最近的子节点
//   onWheel                滚轮：普通=平移（兼容行/页/像素 deltaMode）；
//                          Ctrl=指针锚点缩放；放大到顶→进入最近节点；
//                          缩小到底→返回上级（在根则提示）
//
// 用法（page.tsx，与 scope-camera 相同：useMemo 保持身份稳定）：
//   const scopeNavigationDeps = useMemo<ScopeNavigationDeps>(() => ({ ... }), [...]);
//   const navOps = useMemo(() => createScopeNavigationOps(scopeNavigationDeps), [scopeNavigationDeps]);
// ============================================================================

import type { WheelEvent as ReactWheelEvent } from "react";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  type CameraState,
  type IntentNode,
  type ScopeAddress,
} from "../runtime/model";
import { businessNodeSize } from "../runtime/business-canvas";
import { runtimeNodeRenderSize } from "../runtime/node-renderer";
import { scaleForWheelGesture } from "../runtime/camera";

import { MAX_SCALE, MIN_SCALE } from "./constants";
import type { ScopeCameraOps } from "./scope-camera";

/** 导航族所需的外部依赖（page.tsx 用 useMemo 组装，保持身份稳定）。 */
export interface ScopeNavigationDeps {
  /** 视口 DOM（屏幕→世界坐标换算；ref 只在回调中读） */
  viewportRef: { current: HTMLDivElement | null };
  /** 相机 ref（nearestNode / onWheel 读最新相机） */
  cameraRef: { current: CameraState };
  /** enterNode 的 280ms 防连击时间戳 */
  lastEnterAtRef: { current: number };
  /** 进入/返回后重置为 100% 缩放的标记（相机恢复 effect 消费） */
  resetScaleOnNextScopeRef: { current: boolean };
  /** 进入/跳转后自动适应视图的标记（相机恢复 effect 消费） */
  fitOnNextScopeRef: { current: boolean };
  /** 导航栈深度（onWheel 判断是否可返回上级；避免把整个栈装进 deps） */
  navigationStackLength: number;
  /** 当前作用域节点 id（navigateToParent 回业务域时回填选中） */
  scopeNodeId: string;
  /** 是否在业务域 */
  isBusinessScope: boolean;
  /** 当前业务作用域（enterNode 进入业务域时取 id） */
  businessScope: IntentNode;
  /** 当前可见子节点（nearestNode 的搜索池） */
  visibleNodes: IntentNode[];
  /** 导航栈 setter（函数式更新） */
  setNavigationStack: (
    updater: (path: ScopeAddress[]) => ScopeAddress[],
  ) => void;
  setBusinessScopeId: (id: string) => void;
  setSelectedBusinessNodeId: (id: string) => void;
  setSelectedAppNodeId: (id: string) => void;
  /** 关闭作用域图例浮层 */
  setScopeLegendOpen: (open: boolean) => void;
  /** 操作反馈提示 */
  setToast: (message: string) => void;
  /** 相机设置（来自 scope-camera 族；onWheel 平移/缩放用） */
  setScopeCamera: ScopeCameraOps["setScopeCamera"];
}

export interface ScopeNavigationOps {
  navigateToParent: () => void;
  navigateToScopeFrame: (index: number) => void;
  enterNode: (node: IntentNode, resetScale?: boolean) => void;
  nearestNode: (clientX: number, clientY: number) => IntentNode | undefined;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
}

/** 创建导航族操作。所有 ref 读取/写入都发生在返回闭包被调用时（事件回调）。 */
export function createScopeNavigationOps(
  deps: ScopeNavigationDeps,
): ScopeNavigationOps {
  const {
    viewportRef,
    cameraRef,
    lastEnterAtRef,
    resetScaleOnNextScopeRef,
    fitOnNextScopeRef,
    navigationStackLength,
    scopeNodeId,
    isBusinessScope,
    businessScope,
    visibleNodes,
    setNavigationStack,
    setBusinessScopeId,
    setSelectedBusinessNodeId,
    setSelectedAppNodeId,
    setScopeLegendOpen,
    setToast,
    setScopeCamera,
  } = deps;

  const navigateToParent = () => {
    setNavigationStack((path) => {
      if (path.length <= 1) return path;
      const next = path.slice(0, -1);
      const parent = next.at(-1);
      if (parent?.domain === "business") {
        setBusinessScopeId(parent.nodeId);
        setSelectedBusinessNodeId(scopeNodeId);
      }
      return next;
    });
  };

  const navigateToScopeFrame = (index: number) => {
    fitOnNextScopeRef.current = true;
    setScopeLegendOpen(false);
    setNavigationStack((path) => {
      if (index < 0 || index >= path.length - 1) return path;
      const next = path.slice(0, index + 1);
      const target = next.at(-1);
      if (target?.domain === "business") {
        setBusinessScopeId(target.nodeId);
        setSelectedBusinessNodeId(target.nodeId);
      } else if (target) {
        setSelectedAppNodeId(target.nodeId);
      }
      return next;
    });
  };

  const enterNode = (node: IntentNode, resetScale = false) => {
    const now = performance.now();
    if (now - lastEnterAtRef.current < 280) return;
    lastEnterAtRef.current = now;
    if (resetScale) resetScaleOnNextScopeRef.current = true;
    fitOnNextScopeRef.current = true;
    setScopeLegendOpen(false);
    if (node.implementation?.key === "current-container") {
      // 双击"当前容器渲染器"直接解引用进入业务画布，跳过引用占位层。
      const directAddress: ScopeAddress = {
        domain: "business",
        nodeId: businessScope.id,
        viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
      };
      setNavigationStack((path) => [...path, directAddress]);
      setBusinessScopeId(businessScope.id);
      setSelectedBusinessNodeId(businessScope.id);
      return;
    }
    if (node.id === ACTIVE_BUSINESS_SCOPE_REF_ID) {
      const address: ScopeAddress = {
        domain: "business",
        nodeId: businessScope.id,
        viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
      };
      setNavigationStack((path) => [...path, address]);
      setBusinessScopeId(businessScope.id);
      setSelectedBusinessNodeId(businessScope.id);
      return;
    }
    if (isBusinessScope) {
      const address: ScopeAddress = {
        domain: "business",
        nodeId: node.id,
        viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
      };
      setNavigationStack((path) => [...path, address]);
      setBusinessScopeId(node.id);
      setSelectedBusinessNodeId(node.id);
      return;
    }
    const address: ScopeAddress = { domain: "app", nodeId: node.id };
    setNavigationStack((path) => [...path, address]);
    setSelectedAppNodeId(node.id);
  };

  const nearestNode = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !visibleNodes.length) return undefined;
    const rect = viewport.getBoundingClientRect();
    const x = (clientX - rect.left - cameraRef.current.x) / cameraRef.current.scale;
    const y = (clientY - rect.top - cameraRef.current.y) / cameraRef.current.scale;
    return visibleNodes.reduce<IntentNode | undefined>((closest, node) => {
      if (!closest) return node;
      const size = isBusinessScope
        ? businessNodeSize(node)
        : runtimeNodeRenderSize(node);
      const closestSize = isBusinessScope
        ? businessNodeSize(closest)
        : runtimeNodeRenderSize(closest);
      const distance = (node.position.x + size.width / 2 - x) ** 2 + (node.position.y + size.height / 2 - y) ** 2;
      const closestDistance = (closest.position.x + closestSize.width / 2 - x) ** 2 + (closest.position.y + closestSize.height / 2 - y) ** 2;
      return distance < closestDistance ? node : closest;
    }, undefined);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const old = cameraRef.current;
    if (!event.ctrlKey) {
      const deltaUnit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? Math.max(rect.width, rect.height)
            : 1;
      setScopeCamera(
        {
          ...old,
          x: old.x - event.deltaX * deltaUnit,
          y: old.y - event.deltaY * deltaUnit,
        },
        true,
      );
      return;
    }
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextScale = scaleForWheelGesture(
      old.scale,
      event.deltaY,
      MIN_SCALE,
      MAX_SCALE,
    );
    if (direction > 0 && nextScale >= MAX_SCALE) {
      const target = nearestNode(event.clientX, event.clientY);
      if (target) {
        enterNode(target, true);
        setToast(`进入「${target.name}」`);
        return;
      }
      setToast("当前叶子没有更深层节点，可使用“添加子节点”扩展");
    }
    if (
      direction < 0 &&
      nextScale <= MIN_SCALE &&
      navigationStackLength > 1
    ) {
      resetScaleOnNextScopeRef.current = true;
      navigateToParent();
      setToast("返回上级节点");
      return;
    }
    if (
      direction < 0 &&
      nextScale <= MIN_SCALE &&
      navigationStackLength === 1
    ) {
      setToast("已到达全屏应用根节点");
    }
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX - old.x) / old.scale;
    const worldY = (pointerY - old.y) / old.scale;
    setScopeCamera(
      {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      },
      true,
    );
  };

  return {
    navigateToParent,
    navigateToScopeFrame,
    enterNode,
    nearestNode,
    onWheel,
  };
}
