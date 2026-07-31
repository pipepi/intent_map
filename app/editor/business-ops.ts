// ============================================================================
// 业务节点操作族（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 业务域的全部节点级操作：模块发布/插入、子意图添加、深复制、链接实例、
// 删除、端口拖拽连线、业务节点拖拽/缩放、显示与缩放模式切换。
// 原实现是 Home 组件内的闭包；拆出后通过 BusinessOpsDeps 显式传入依赖。
// ============================================================================

import type {
  Dispatch,
  SetStateAction,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  nodeDisplayMode,
  removeNodeFromPanelSelections,
  type CameraState,
  type IntentDocumentV3,
  type IntentNode,
  type JsonValue,
  type PublishedModule,
} from "../runtime/model";
import {
  deepCopyIntentSubtree,
  validatePortConnection,
} from "../runtime/authoring";
import {
  BUSINESS_PORT_ROW,
  BUSINESS_PORT_TOP,
  businessNodeSize,
  clampBusinessNodePosition,
  resizeBusinessNodeGeometry,
} from "../runtime/business-canvas";
import { type ResizeDirection } from "../runtime/node-renderer";
import {
  clone,
  findNode,
  findPath,
  nodeResizeMode,
  removeNode,
  uid,
  updateNode,
} from "./tree-utils";

/** 正在拖拽中的连线（从端口拉出、尚未落点），null = 未在连线。 */
export type PendingPipeState = {
  sourceKind: "environment" | "node";
  sourceNodeId: string;
  sourcePortId: string;
  sourcePortName: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
} | null;

/** 业务操作工厂共享的依赖（原 Home 组件闭包捕获的状态/refs/动作）。 */
export type BusinessOpsDeps = {
  // ---- refs（结构化声明）----
  viewportRef: { current: HTMLDivElement | null };
  cameraRef: { current: CameraState };
  // ---- 业务树状态 ----
  layoutLocked: boolean;
  businessRoot: IntentNode;
  businessScope: IntentNode;
  selectedBusinessNode: IntentNode;
  // ---- 文档与历史 ----
  documentState: IntentDocumentV3;
  setDocumentState: Dispatch<SetStateAction<IntentDocumentV3>>;
  setHistory: Dispatch<SetStateAction<IntentDocumentV3[]>>;
  setFuture: Dispatch<SetStateAction<IntentDocumentV3[]>>;
  setDirty: (dirty: boolean) => void;
  setToast: (text: string) => void;
  setPendingPipe: Dispatch<SetStateAction<PendingPipeState>>;
  // ---- 动作 ----
  commit: (next: IntentDocumentV3) => void;
  updateDocumentNode: (
    id: string,
    updater: (node: IntentNode) => IntentNode,
  ) => void;
  updateDocumentNodeView: (
    id: string,
    updater: (node: IntentNode) => IntentNode,
  ) => void;
  storeNodeProjection: (
    document: IntentDocumentV3,
    node: IntentNode,
  ) => IntentDocumentV3;
  setSelectedBusinessNodeId: (nodeId: string) => void;
  selectPanelBusinessNode: (panelId: string, nodeId: string) => void;
  updateInputBinding: (nodeId: string, portId: string, value: string) => void;
  updateOutputBinding: (nodeId: string, portId: string, value: string) => void;
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, JsonValue>,
  ) => void;
};

/** 发布模块：把当前选中业务节点快照存入 publishedModules，版本号自动 +1。 */
export const createPublishModule =
  (deps: BusinessOpsDeps) =>
  () => {
    const { documentState, selectedBusinessNode, commit, setToast } = deps;
    const existing = documentState.publishedModules.filter(
      (module) => module.moduleId === selectedBusinessNode.id,
    );
    const published: PublishedModule = {
      moduleId: selectedBusinessNode.id,
      name: selectedBusinessNode.name,
      version: Math.max(0, ...existing.map((item) => item.version)) + 1,
      publishedAt: new Date().toISOString().slice(0, 10),
      snapshot: clone(selectedBusinessNode),
    };
    commit({
      ...documentState,
      publishedModules: [...documentState.publishedModules, published],
    });
    setToast(`已发布 ${published.name} v${published.version}`);
  };

/** 从模块库插入已发布模块：以"链接实例"（linkedModule，不带子树）形式挂到当前业务作用域。 */
export const createInsertModule =
  (deps: BusinessOpsDeps) =>
  (module: PublishedModule) => {
    const { businessScope, updateDocumentNode, setSelectedBusinessNodeId } =
      deps;
    const snapshot = clone(module.snapshot);
    const linked: IntentNode = {
      ...snapshot,
      id: uid("linked"),
      name: `${snapshot.name} · 链接`,
      kind: "linkedModule",
      children: undefined,
      moduleRef: { moduleId: module.moduleId, version: module.version },
      position: { x: 380, y: 300 },
      displayMode: "minimized",
    };
    updateDocumentNode(businessScope.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), linked],
    }));
    setSelectedBusinessNodeId(linked.id);
  };

/** 向业务作用域添加子意图节点（默认 identity 算子、一入一出、初始最小化）。 */
export const createAddBusinessChild =
  (deps: BusinessOpsDeps) =>
  (targetScopeId?: string, selectInFreePanel = true) => {
    const {
      businessRoot,
      businessScope,
      updateDocumentNode,
      setSelectedBusinessNodeId,
      setToast,
    } = deps;
    const scopeId = targetScopeId ?? businessScope.id;
    const node: IntentNode = {
      id: uid("intent"),
      name: "新子意图",
      description: "通过节点管道扩展当前作用域。",
      kind: "operator",
      operator: "identity",
      inputs: [{ id: uid("input"), name: "输入", type: "any", channel: "data" }],
      outputs: [{ id: uid("output"), name: "输出", type: "any", channel: "data" }],
      position: { x: 320, y: 240 },
      size: { width: 220, height: 150 },
      resizeMode: "simple",
      displayMode: "minimized",
    };
    updateDocumentNode(scopeId, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), node],
    }));
    if (selectInFreePanel) setSelectedBusinessNodeId(node.id);
    setToast(`已向「${findNode(businessRoot, scopeId)?.name ?? scopeId}」添加子意图`);
  };

/** 深复制业务节点（含全部后代，所有 id 重新生成），副本偏移 36px 放到原父级下。 */
export const createDuplicateBusinessNode =
  (deps: BusinessOpsDeps) =>
  (targetId: string, panelId?: string) => {
    const {
      businessRoot,
      updateDocumentNode,
      selectPanelBusinessNode,
      setSelectedBusinessNodeId,
      setToast,
    } = deps;
    const target = findNode(businessRoot, targetId);
    if (!target || target.id === businessRoot.id) return;
    const parentPath = findPath(businessRoot, target.id);
    const parent = parentPath?.at(-2);
    if (!parent) return;
    const duplicate: IntentNode = {
      ...deepCopyIntentSubtree(target, () => uid("copy")).root,
      name: `${target.name} · 副本`,
      position: {
        x: target.position.x + 36,
        y: target.position.y + 36,
      },
    };
    updateDocumentNode(parent.id, (node) => ({
      ...node,
      children: [...(node.children ?? []), duplicate],
    }));
    if (panelId) selectPanelBusinessNode(panelId, duplicate.id);
    else setSelectedBusinessNodeId(duplicate.id);
    setToast(`已深复制「${target.name}」及其全部后代`);
  };

/** 创建链接实例：把目标节点先发布为模块快照，再在原位置旁挂一个 linkedModule 引用节点。 */
export const createCreateLinkedBusinessNode =
  (deps: BusinessOpsDeps) =>
  (targetId: string, panelId?: string) => {
    const {
      businessRoot,
      documentState,
      commit,
      selectPanelBusinessNode,
      setSelectedBusinessNodeId,
      setToast,
    } = deps;
    const target = findNode(businessRoot, targetId);
    if (!target || target.id === businessRoot.id) return;
    const parent = findPath(businessRoot, target.id)?.at(-2);
    if (!parent) return;
    const existing = documentState.publishedModules.filter(
      (module) => module.moduleId === target.id,
    );
    const published: PublishedModule = {
      moduleId: target.id,
      name: target.name,
      version: Math.max(0, ...existing.map((item) => item.version)) + 1,
      publishedAt: new Date().toISOString().slice(0, 10),
      snapshot: clone(target),
    };
    const linked: IntentNode = {
      ...clone(target),
      id: uid("linked"),
      name: `${target.name} · 链接`,
      kind: "linkedModule",
      children: undefined,
      moduleRef: { moduleId: published.moduleId, version: published.version },
      position: { x: target.position.x + 54, y: target.position.y + 54 },
      displayMode: "minimized",
    };
    commit({
      ...documentState,
      publishedModules: [...documentState.publishedModules, published],
      rootIntent: updateNode(documentState.rootIntent, parent.id, (node) => ({
        ...node,
        children: [...(node.children ?? []), linked],
      })),
    });
    if (panelId) selectPanelBusinessNode(panelId, linked.id);
    else setSelectedBusinessNodeId(linked.id);
    setToast(
      `已创建链接实例：${published.name} v${published.version} · 来源 ${published.moduleId}`,
    );
  };

/** 删除业务节点：从树中移除，同时清理各面板 selection 里的失效引用。 */
export const createDeleteBusinessNode =
  (deps: BusinessOpsDeps) =>
  (targetId: string, panelId?: string) => {
    const {
      businessRoot,
      businessScope,
      documentState,
      commit,
      selectPanelBusinessNode,
      setSelectedBusinessNodeId,
      setToast,
    } = deps;
    if (targetId === businessRoot.id) return;
    commit(removeNodeFromPanelSelections({
      ...documentState,
      rootIntent: removeNode(documentState.rootIntent, targetId),
    }, targetId));
    if (panelId) selectPanelBusinessNode(panelId, businessScope.id);
    else setSelectedBusinessNodeId(businessScope.id);
    setToast(`已删除节点 ${targetId}`);
  };

/**
 * 端口拖拽连线：从输出端口（或容器环境输入端口）拉出一条临时管道
 * （pendingPipe），跟随指针移动；松开时命中带 data-port-kind 的目标端口
 * 则校验类型兼容性并写入绑定，否则丢弃。禁止节点连向自身输入。
 */
export const createStartPipeDrag =
  (deps: BusinessOpsDeps) =>
  (
    node: IntentNode,
    port: IntentNode["outputs"][number],
    event: ReactPointerEvent<HTMLElement>,
    sourceKind: "environment" | "node" = "node",
  ) => {
    const {
      viewportRef,
      cameraRef,
      businessRoot,
      setPendingPipe,
      setToast,
      updateInputBinding,
      updateOutputBinding,
    } = deps;
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const toWorld = (clientX: number, clientY: number) => {
      const rect = viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left - cameraRef.current.x) / cameraRef.current.scale,
        y: (clientY - rect.top - cameraRef.current.y) / cameraRef.current.scale,
      };
    };
    const size = businessNodeSize(node);
    const outputIndex = sourceKind === "environment"
      ? node.inputs.findIndex((input) => input.id === port.id)
      : node.outputs.findIndex((output) => output.id === port.id);
    const from = {
      x:
        sourceKind === "environment"
          ? -9
          : node.position.x + size.width,
      y:
        sourceKind === "environment"
          ? 132 + 12 + Math.max(0, outputIndex) * BUSINESS_PORT_ROW
          : node.position.y +
            BUSINESS_PORT_TOP +
            Math.max(0, outputIndex) * BUSINESS_PORT_ROW +
            BUSINESS_PORT_ROW / 2,
    };
    setPendingPipe({
      sourceKind,
      sourceNodeId: node.id,
      sourcePortId: port.id,
      sourcePortName: port.name,
      from,
      to: toWorld(event.clientX, event.clientY),
    });
    const move = (moveEvent: PointerEvent) => {
      setPendingPipe((active) =>
        active
          ? { ...active, to: toWorld(moveEvent.clientX, moveEvent.clientY) }
          : active,
      );
    };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPendingPipe(null);
      const dropTarget = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest("[data-port-kind]");
      if (!dropTarget) return;
      const targetKind = dropTarget.getAttribute("data-port-kind");
      if (targetKind !== "input" && targetKind !== "container-output") return;
      const targetNodeId = dropTarget.getAttribute("data-port-node");
      const targetPortId = dropTarget.getAttribute("data-port-id");
      if (!targetNodeId || !targetPortId) return;
      if (sourceKind === "node" && targetKind === "input" && targetNodeId === node.id) return;
      const targetNode = findNode(businessRoot, targetNodeId);
      const targetPort = targetKind === "container-output"
        ? targetNode?.outputs.find((output) => output.id === targetPortId)
        : targetNode?.inputs.find((input) => input.id === targetPortId);
      if (!targetPort) return;
      const compatibility = validatePortConnection(port, targetPort);
      if (!compatibility.ok) {
        setToast(`连接失败：${compatibility.error}`);
        return;
      }
      const value = sourceKind === "environment"
        ? `env:${port.id}`
        : `ref:${node.id}:${port.id}`;
      if (targetKind === "container-output") {
        updateOutputBinding(targetNodeId, targetPortId, value);
      } else {
        updateInputBinding(targetNodeId, targetPortId, value);
      }
      setToast(
        `已连接 ${node.name} · ${port.name} → ${targetNode?.name ?? targetNodeId} · ${targetPort?.name ?? targetPortId}`,
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

/**
 * 业务节点拖拽移动：通过 .business-preview-world 的实际像素宽度反推渲染
 * 缩放比，把屏幕位移换算成世界位移后交给 clampBusinessNodePosition 夹取。
 */
export const createMoveBusinessNodeStart =
  (deps: BusinessOpsDeps) =>
  (
    node: IntentNode,
    previewScale: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const {
      layoutLocked,
      businessScope,
      cameraRef,
      documentState,
      setDocumentState,
      setHistory,
      setFuture,
      setDirty,
      dispatchRuntimeEvent,
      storeNodeProjection,
    } = deps;
    event.stopPropagation();
    if (layoutLocked || event.button !== 0) return;
    const target = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const start = { ...node.position };
    let dragged = false;
    const size = businessNodeSize(node);
    const bounds = businessScope.canvasSize ?? { width: 1400, height: 850 };
    const world = target.closest<HTMLElement>(".business-preview-world");
    const renderedScale =
      world && world.offsetWidth > 0
        ? world.getBoundingClientRect().width / world.offsetWidth
        : previewScale * cameraRef.current.scale;
    const pointerScale = renderedScale > 0 ? renderedScale : previewScale;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - origin.x) + Math.abs(moveEvent.clientY - origin.y) > 3) dragged = true;
      const position = clampBusinessNodePosition(
        start,
        {
          x: moveEvent.clientX - origin.x,
          y: moveEvent.clientY - origin.y,
        },
        pointerScale,
        size,
        bounds,
      );
      setDocumentState((active) =>
        storeNodeProjection(active, { ...node, position }),
      );
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (!dragged) return;
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "current_container");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

/** 业务节点缩放：同样按预览实际缩放比换算，几何计算委托给 resizeBusinessNodeGeometry。 */
export const createResizeBusinessNodeStart =
  (deps: BusinessOpsDeps) =>
  (
    node: IntentNode,
    direction: ResizeDirection,
    previewScale: number,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const {
      layoutLocked,
      businessScope,
      cameraRef,
      documentState,
      setDocumentState,
      setHistory,
      setFuture,
      setDirty,
      dispatchRuntimeEvent,
      storeNodeProjection,
    } = deps;
    event.stopPropagation();
    if (layoutLocked || event.button !== 0) return;
    const target = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const bounds = businessScope.canvasSize ?? { width: 1400, height: 850 };
    let dragged = false;
    const world = target.closest<HTMLElement>(".business-preview-world");
    const renderedScale =
      world && world.offsetWidth > 0
        ? world.getBoundingClientRect().width / world.offsetWidth
        : previewScale * cameraRef.current.scale;
    const pointerScale = renderedScale > 0 ? renderedScale : previewScale;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - origin.x) + Math.abs(moveEvent.clientY - origin.y) > 3) dragged = true;
      const geometry = resizeBusinessNodeGeometry(
        node,
        direction,
        {
          x: moveEvent.clientX - origin.x,
          y: moveEvent.clientY - origin.y,
        },
        pointerScale,
        bounds,
      );
      setDocumentState((active) =>
        storeNodeProjection(active, {
          ...node,
          position: geometry.position,
          size: geometry.size,
        }),
      );
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (!dragged) return;
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "current_container");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

/** 业务节点缩放模式切换（三向 ⇄ 八向），并选中该节点。 */
export const createToggleBusinessResizeMode =
  (deps: BusinessOpsDeps) =>
  (node: IntentNode) => {
    const { updateDocumentNodeView, setSelectedBusinessNodeId } = deps;
    updateDocumentNodeView(node.id, (item) => ({
      ...item,
      resizeMode: nodeResizeMode(item) === "simple" ? "full" : "simple",
    }));
    setSelectedBusinessNodeId(node.id);
  };

/** 业务节点显示模式切换（展开 ⇄ 最小化），并选中该节点。 */
export const createToggleBusinessDisplayMode =
  (deps: BusinessOpsDeps) =>
  (node: IntentNode) => {
    const { updateDocumentNodeView, setSelectedBusinessNodeId } = deps;
    updateDocumentNodeView(node.id, (item) => ({
      ...item,
      displayMode:
        nodeDisplayMode(item) === "expanded" ? "minimized" : "expanded",
    }));
    setSelectedBusinessNodeId(node.id);
  };
