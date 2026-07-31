"use client";

/**
 * ============================================================================
 * Intent Map 主页面（一切皆管道 · v3）
 * ----------------------------------------------------------------------------
 * 本文件是整个应用的主编辑画布，核心概念：
 *
 * 【两棵节点树 / 两个"域"】
 *   - 应用域（app）：运行时节点图，即编辑器的系统 UI 本身（工具栏、树面板、
 *     属性面板等都是"应用节点"），由 rootIntent 描述。
 *   - 业务域（business）：用户真正编辑的业务意图树，嵌在应用树中，
 *     由 businessRoot 描述，通过 ACTIVE_BUSINESS_SCOPE_REF_ID 引用节点接入。
 *
 * 【作用域钻取】
 *   - navigationStack: ScopeAddress[] 记录当前钻取路径，栈顶 = 当前作用域；
 *     每层作用域是一块可平移缩放的画布（freeCanvas），双击进入、Esc 返回。
 *
 * 【事件管线】
 *   - 所有 UI 操作不直接改状态，而是 dispatchRuntimeEvent() 入队，
 *     由"事件时钟"effect 批量处理（processEventBatch），产生 runtimeState
 *     （scopeId / selectionId / layoutLocked 等）与命令（lastCommands），
 *     再由命令处理器 effect 执行真正的文档操作，保证可审计、可重放。
 *
 * 【文档与撤销】
 *   - documentState 是唯一事实源（IntentDocumentV3）；commit() 进历史栈
 *     （可撤销），commitView() 只改视图投影（布局/相机，不进历史）。
 *
 * 文件结构自上而下：
 *   1. 纯函数工具区（树操作 / 表达式求值 / 校验 / 业务执行器）
 *   2. Home 组件：状态与 refs
 *   3. 作用域派生（六个核心渲染条件在这里计算）
 *   4. 相机、导航、快捷键
 *   5. 指针交互（平移 / 节点拖拽缩放 / 连线）
 *   6. 文档操作（导入导出 / 模块 / 节点增删改）
 *   7. 渲染函数（renderNodeContent / renderBusinessScopeLayer / 边渲染）
 *   8. 主 JSX（条件渲染矩阵集中在 freeCanvas 的 root-boundary 内）
 * ============================================================================
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  businessScopeAddress,
  createApplicationDocument,
  getBusinessRoot,
  getContainerSurface,
  nodeDisplayMode,
  scopeCameraKey,
  serializeIntentDocument,
  updatePanel,
  updateSurface,
  type CameraState,
  type Expression,
  type IntentDocumentV3,
  type IntentNode,
  type ScopeAddress,
  type WorkspaceState,
} from "../runtime/model";
import {
  downloadExport,
  prepareDocumentExport,
} from "../runtime/export";
import {
  renameIntentNodeId,
  updateIntentPortSchema,
} from "../runtime/authoring";
import {
  MINIMIZED_NODE_SIZE,
} from "../runtime/node-renderer";
import {
  type RuntimeCommand,
} from "../runtime/registry";
import {
  defaultNodeProjectionLayout,
} from "../runtime/projection";
// ---- 从本文件拆出的功能模块（app/editor/）----
import {
  MAX_SCALE,
  MIN_SCALE,
} from "./constants";
import {
  clone,
  findNode,
  findPath,
  freePanelContext,
  nodeResizeMode,
  removeNode,
  sampleDocument,
  uid,
  updateNode,
} from "./tree-utils";
import { computeLaneAutoLayout } from "./auto-layout";
import {
  createDocumentIO,
  type DocumentIODeps,
} from "./document-io";
import { useRuntimePipeline } from "./use-runtime-pipeline";
import { useBusinessRunState } from "./use-business-run-state";
import { useDocumentHistory } from "./use-document-history";
import { useScopeSession } from "./use-scope-session";
import { useRuntimeCommandExecutor } from "./use-runtime-command-executor";
import {
  renderNodeSurface,
  type NodeSurfaceDeps,
} from "./node-surfaces";
import {
  createMoveNodeStart,
  createResizeNodeStart,
  createResizeScopeCanvasStart,
  createViewportPointerDownHandler,
  type PointerGestureDeps,
} from "./pointer-gestures";
import {
  createAddBusinessChild,
  createCreateLinkedBusinessNode,
  createDeleteBusinessNode,
  createDuplicateBusinessNode,
  createInsertModule,
  createMoveBusinessNodeStart,
  createPublishModule,
  createResizeBusinessNodeStart,
  createStartPipeDrag,
  createToggleBusinessDisplayMode,
  createToggleBusinessResizeMode,
  type BusinessOpsDeps,
  type PendingPipeState,
} from "./business-ops";
import {
  type EdgeRendererDeps,
} from "./edge-renderer";
import type { BusinessScopeLayerDeps } from "./business-scope-layer";
import { EditorWorkspace } from "./editor-workspace";
import { ScopeCanvas } from "./scope-canvas";
import {
  createScopeCameraOps,
  type ScopeCameraDeps,
} from "./scope-camera";
import {
  createScopeNavigationOps,
  type ScopeNavigationDeps,
} from "./scope-navigation";

// ============================================================================
// 画布交互常量 → ./editor/constants
// 树操作 / 绑定 / 校验 / 执行器等纯函数 → ./editor/{tree-utils,bindings,validation,executor}
// ============================================================================

// ============================================================================
// 主组件
// ============================================================================

export function IntentEditor() {
  // ---- 文档与历史（已拆到 ./editor/use-document-history.ts）----
  // documentState 是唯一事实源；history/future/dirty 与 commit/undo/redo 等
  // 写操作收进一个 useReducer，事务性不变量（压栈截断/清重做/标脏）只有一份。
  const {
    documentState,
    history,
    future,
    dirty,
    commit: commitDocument,
    view,
    updateDocument,
    checkpoint,
    undo,
    redo,
    loadDocument,
    markClean,
  } = useDocumentHistory();
  // ---- 画布视图状态 ----
  const [selectedAppNodeId, setSelectedAppNodeId] = useState("current_container"); // 应用域选中节点
  const [camera, setCamera] = useState<CameraState>({ scale: 0.5, x: 12, y: 12 }); // 平移 x/y + 缩放 scale
  const [search, setSearch] = useState("");          // 意图树搜索关键字
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // 选中的聚合管道边
  const [scopeLegendOpen, setScopeLegendOpen] = useState(false);             // 管道图例弹层
  // 正在拖拽中的连线（从端口拉出、尚未落点），null = 未在连线
  const [pendingPipe, setPendingPipe] = useState<PendingPipeState>(null);
  const [toast, setToast] = useState("");            // 轻提示文案（2.4s 自动消失）
  // ---- 业务执行状态（已拆到 ./editor/use-business-run-state.ts）----
  // runState / trace / rootInput / cancelRunRef 与 run/stop 均由该 Hook 提供，
  // 在下方 businessRoot 派生之后调用（见"业务执行"注释处）。
  // ---- 事件管线（已拆到 ./editor/use-runtime-pipeline.ts）----
  // runtimeState 是事件处理器归约出的运行时状态：当前业务作用域、选中、布局锁等。
  const {
    runtimeState,
    pipelineTrace,
    lastCommands,
    eventTick,
    pendingEvents,
    dispatchRuntimeEvent,
    setBusinessScopeId,
    setSelectedBusinessNodeId,
  } = useRuntimePipeline({ setDocumentState: updateDocument, setToast });
  /** 导出当前文档为 v3 JSON 文件（带 SHA-256 校验），导出成功后清除 dirty 标记。 */
  const exportDocument = async (source: IntentDocumentV3 = documentState) => {
    const result = await prepareDocumentExport(serializeIntentDocument(source));
    if (!result.ok) {
      setToast(`导出失败：${result.error}`);
      return result;
    }
    downloadExport(result);
    markClean();
    setToast(
      `已导出 ${result.filename} · ${result.byteLength} bytes · SHA-256 ${result.sha256.slice(0, 12)}…`,
    );
    return result;
  };
  // ---- Refs（不触发重渲染的可变引用）----
  const viewportRef = useRef<HTMLDivElement>(null);   // 画布视口 DOM（测尺寸/坐标换算）
  const fileInputRef = useRef<HTMLInputElement>(null); // 隐藏的导入文件选择框
  // 快捷键处理器通过该 ref 访问最新的动作与状态，避免键盘 effect 反复重挂
  const actionRefs = useRef<{
    undo: () => void;
    redo: () => void;
    enterNode: (node: IntentNode) => void;
    navigateToParent: () => void;
    fitScope: () => void;
    centerScopeAtScale: (scale: number) => CameraState | undefined;
    setScopeCamera: (next: CameraState, persist?: boolean) => void;
    deleteAppNode: () => void;
    documentState: IntentDocumentV3;
    visibleNodes: IntentNode[];
    isBusinessScope: boolean;
    scopeNode: IntentNode;
    businessScope: IntentNode;
    selectedAppNodeId: string;
    selectedBusinessNodeId: string;
    navigationStackLength: number;
  } | null>(null);
  const cameraRef = useRef(camera);            // 相机最新值（拖拽手势闭包中读取，避免过期）
  const lastEnterAtRef = useRef(0);            // 上次进入节点时间戳（280ms 内防抖，防双击误触发两次）
  const fitOnNextScopeRef = useRef(false);     // 切换作用域后：下一帧自动"适应视图"
  const resetScaleOnNextScopeRef = useRef(false); // 切换作用域后：下一帧重置为 100% 居中
  const touchPointersRef = useRef(             // 触屏活跃触点表（pointerId → 坐标，支持双指）
    new Map<number, { x: number; y: number }>(),
  );

  // 一次触摸手势的起始快照：起始相机、触点中心、双指间距、是否允许单指平移
  const touchGestureRef = useRef<{
    startCamera: CameraState;
    startCenter: { x: number; y: number };
    startDistance?: number;
    allowSinglePan: boolean;
  } | null>(null);
  // ---- runtimeState 的三个常用字段别名（事件管线归约结果）----
  const businessScopeId = runtimeState.scopeId;         // 当前业务作用域节点 id
  const selectedBusinessNodeId = runtimeState.selectionId; // 业务域选中节点 id
  const layoutLocked = runtimeState.layoutLocked;       // 布局锁定：禁止一切拖拽/缩放

  // dispatchRuntimeEvent / setBusinessScopeId / setSelectedBusinessNodeId
  // 由 useRuntimePipeline 提供（上方解构），语义与签名不变。

  const {
    navigationStack,
    setNavigationStack,
    appRoot,
    businessRoot,
    isBusinessScope,
    scopeNode,
    businessScope,
    selectedBusinessNode,
    appEdges,
    scopeBoundaryEdges,
    businessVisualEdges,
    validationIssues,
    visibleNodes,
    scopeMinimized,
    activeCameraKey,
    scopeWorldSize,
    scopePath,
  } = useScopeSession({
    documentState,
    businessScopeId,
    selectedBusinessNodeId,
    layoutLocked,
    updateDocument,
  });

  /**
   * 两条文档提交通道（状态部分由 useDocumentHistory 提供，这里补发事件）：
   *   commit     结构性修改——进历史栈（可撤销）、标脏、广播 DOCUMENT_CHANGED；
   *   commitView 纯视图修改（布局/相机/显示模式）——不进历史，只标脏。
   */
  const commit = useCallback(
    (next: IntentDocumentV3) => {
      commitDocument(next);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [commitDocument, dispatchRuntimeEvent],
  );

  /** commitView：见上方 commit 注释——视图修改不污染撤销历史。 */
  const commitView = useCallback(
    (next: IntentDocumentV3) => {
      view(next);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [view, dispatchRuntimeEvent],
  );

  // ========================================================================
  // 布局投影持久化（位置/尺寸改动写入 surface.projections，按作用域键存储）
  // ========================================================================

  /** 把单个节点的布局（位置/尺寸/显示模式等）持久化到当前作用域的投影表。 */
  const storeNodeProjection = useCallback(
    (document: IntentDocumentV3, node: IntentNode) =>
      updateSurface(
        document,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          const projection = surface.projections[activeCameraKey] ?? {
            camera: cameraRef.current,
            nodeLayouts: {},
          };
          return {
            ...surface,
            projections: {
              ...surface.projections,
              [activeCameraKey]: {
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
    [activeCameraKey],
  );

  /** 持久化当前作用域画布本身的尺寸（容器 frame 从原点起算）。 */
  const storeScopeCanvasProjection = useCallback(
    (
      document: IntentDocumentV3,
      scope: IntentNode,
      size: { width: number; height: number },
    ) =>
      updateSurface(
        document,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          const projection = surface.projections[activeCameraKey] ?? {
            camera: cameraRef.current,
            nodeLayouts: {},
          };
          const fallback = defaultNodeProjectionLayout(scope);
          return {
            ...surface,
            projections: {
              ...surface.projections,
              [activeCameraKey]: {
                ...projection,
                nodeLayouts: {
                  ...projection.nodeLayouts,
                  [scope.id]: {
                    ...fallback,
                    frame: { x: 0, y: 0, ...size },
                  },
                },
              },
            },
          };
        },
      ),
    [activeCameraKey],
  );

  /** 视图级节点更新（显示模式/缩放模式等）：走 commitView，不进撤销历史。 */
  const updateDocumentNodeView = useCallback(
    (id: string, updater: (node: IntentNode) => IntentNode) => {
      const current = findNode(appRoot, id);
      if (!current) return;
      commitView(storeNodeProjection(documentState, updater(current)));
    },
    [appRoot, commitView, documentState, storeNodeProjection],
  );

  /** 结构级节点更新（增删改/绑定等）：走 commit，进撤销历史。 */
  const updateDocumentNode = useCallback(
    (id: string, updater: (node: IntentNode) => IntentNode) => {
      commit({
        ...documentState,
        rootIntent: updateNode(documentState.rootIntent, id, updater),
      });
    },
    [commit, documentState],
  );

  /** 切换节点缩放模式：simple（三向）⇄ full（八向）。 */
  const toggleNodeResizeMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNodeView(node.id, (item) => ({
        ...item,
        resizeMode: nodeResizeMode(item) === "simple" ? "full" : "simple",
      }));
      setSelectedAppNodeId(node.id);
    },
    [updateDocumentNodeView],
  );

  /** 切换节点显示模式：expanded ⇄ minimized（折叠为只显示名字的小块）。 */
  const toggleNodeDisplayMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNodeView(node.id, (item) => ({
        ...item,
        displayMode:
          nodeDisplayMode(item) === "expanded" ? "minimized" : "expanded",
      }));
      setSelectedAppNodeId(node.id);
    },
    [updateDocumentNodeView],
  );

  /**
   * 作用域相机族（已拆到 ./editor/scope-camera.ts）：
   * setScopeCamera / cameraKeepsScopeVisible / fitScope / centerScopeAtScale。
   * deps 每次渲染组装、直接调用工厂（与 pointer-gestures/business-ops 一致）。
   * 函数身份不固定——消费方要么走 actionRefs（键盘快捷键），
   * 要么是有意只按作用域键重跑的 effect（已带 exhaustive-deps 豁免）。
   */
  const scopeCameraDeps: ScopeCameraDeps = {
    viewportRef,
    cameraRef,
    setCamera,
    setDocumentState: updateDocument,
    activeCameraKey,
    scopeWorldSize,
    isBusinessScope,
    visibleNodes,
    scopeNode,
  };
  /* eslint-disable react-hooks/refs -- 工厂模式：deps 含 ref，但返回的闭包仅在事件/effect 回调中读取，渲染期不解引用 */
  const cameraOps = createScopeCameraOps(scopeCameraDeps);
  /* eslint-enable react-hooks/refs */
  const {
    setScopeCamera,
    cameraKeepsScopeVisible,
    fitScope,
    centerScopeAtScale,
  } = cameraOps;

  /**
   * 作用域切换时的相机恢复策略（下一帧执行，优先级从高到低）：
   *   1. resetScaleOnNextScopeRef → 重置为 100% 居中（如 Ctrl+滚轮进入/返回）；
   *   2. fitOnNextScopeRef       → 自动适应视图；
   *   3. 有持久化相机且仍可见     → 恢复上次的视角；
   *   4. 兜底                    → 适应视图。
   */
  useEffect(() => {
    const saved = getContainerSurface(
      documentState,
      "panel-free-layout",
      "free-layout-container",
    )?.projections[activeCameraKey]?.camera;
    const frame = window.requestAnimationFrame(() => {
      if (resetScaleOnNextScopeRef.current) {
        resetScaleOnNextScopeRef.current = false;
        fitOnNextScopeRef.current = false;
        const centered = centerScopeAtScale(1);
        if (centered) setScopeCamera(centered, true);
      } else if (fitOnNextScopeRef.current) {
        fitOnNextScopeRef.current = false;
        fitScope();
      } else if (saved && cameraKeepsScopeVisible(saved)) {
        setScopeCamera({
          scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, saved.scale)),
          x: saved.x,
          y: saved.y,
        });
      } else {
        fitScope();
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // Scope identity is the intentional trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCameraKey]);

  /** 显示模式切换（最小化⇄展开）后重新适应视图：世界尺寸变了，相机需要重算。 */
  useEffect(() => {
    const frame = window.requestAnimationFrame(fitScope);
    return () => window.cancelAnimationFrame(frame);
    // Display-mode changes intentionally refit the same scope to its new boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMinimized]);

  /** toast 轻提示 2.4 秒后自动消失。 */
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // ========================================================================
  // 作用域导航（钻取路径栈的压入/弹出）
  // ========================================================================

  /**
   * 作用域导航族（已拆到 ./editor/scope-navigation.ts）：
   * navigateToParent / navigateToScopeFrame / enterNode / onWheel。
   * 同样每次渲染组装 deps 并直接调用工厂；enterNode 等身份不固定，
   * 消费方走 actionRefs 或每次渲染重新组装的 deps 对象（既有模式）。
   */
  const scopeNavigationDeps: ScopeNavigationDeps = {
    viewportRef,
    cameraRef,
    lastEnterAtRef,
    resetScaleOnNextScopeRef,
    fitOnNextScopeRef,
    navigationStackLength: navigationStack.length,
    scopeNodeId: scopeNode.id,
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
  };
  /* eslint-disable react-hooks/refs -- 工厂模式：deps 含 ref，但返回的闭包仅在事件回调中读取，渲染期不解引用 */
  const navOps = createScopeNavigationOps(scopeNavigationDeps);
  /* eslint-enable react-hooks/refs */
  const { navigateToParent, navigateToScopeFrame, enterNode, onWheel } = navOps;

  /**
   * 全局键盘快捷键：
   *   Esc            返回上级作用域
   *   Ctrl/Cmd+Z     撤销（+Shift 重做）；Ctrl/Cmd+Y 重做
   *   Ctrl/Cmd+S     导出文档
   *   Enter          进入当前选中节点
   *   Delete/Backspace  删除选中的应用节点（业务域不响应）
   *   Home           适应视图；数字 0 重置为 100% 居中
   * 输入框/文本域/可编辑元素聚焦时，编辑类快捷键自动失效。
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const actions = actionRefs.current;
      const editingTarget = event.target as HTMLElement | null;
      const isEditing = !!(
        editingTarget &&
        (editingTarget.tagName === "INPUT" ||
          editingTarget.tagName === "TEXTAREA" ||
          editingTarget.tagName === "SELECT" ||
          editingTarget.isContentEditable)
      );
      if (actions) {
        if (event.key === "Escape" && actions.navigationStackLength > 1) {
          actions.navigateToParent();
          return;
        }
        const key = event.key.toLowerCase();
        if (!isEditing && (event.ctrlKey || event.metaKey) && key === "z") {
          event.preventDefault();
          if (event.shiftKey) actions.redo();
          else actions.undo();
          return;
        }
        if (!isEditing && (event.ctrlKey || event.metaKey) && key === "y") {
          event.preventDefault();
          actions.redo();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "s") {
          event.preventDefault();
          void exportDocument(actions.documentState);
          return;
        }
        if (!isEditing && event.key === "Enter") {
          const pool = actions.isBusinessScope
            ? (actions.businessScope.children ?? [])
            : actions.visibleNodes;
          const selected = pool.find(
            (node) =>
              node.id ===
              (actions.isBusinessScope
                ? actions.selectedBusinessNodeId
                : actions.selectedAppNodeId),
          );
          if (selected) actions.enterNode(selected);
          return;
        }
        if (!isEditing && (event.key === "Delete" || event.key === "Backspace")) {
          if (
            !actions.isBusinessScope &&
            findNode(actions.scopeNode, actions.selectedAppNodeId)
          ) {
            event.preventDefault();
            actions.deleteAppNode();
          }
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          actions.fitScope();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          const centered = actions.centerScopeAtScale(1);
          if (centered) actions.setScopeCamera(centered, true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // 所有动作与状态经 actionRefs 读取，监听器只在挂载时绑定一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 有未导出修改时，关闭/刷新页面前弹出浏览器确认提示。 */
  useEffect(() => {
    const warning = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);

  // enterNode / nearestNode / onWheel 的实现已迁至 ./editor/scope-navigation.ts，
  // 由上方 navOps 解构提供，签名保持不变。

  /**
   * 指针交互手势（已拆到 ./editor/pointer-gestures.ts）：
   * 视口平移（鼠标/触屏）、应用节点拖拽/缩放、作用域画布缩放。
   * 这里组装依赖并调用工厂创建处理器，签名与原闭包一致。
   */
  const pointerGestureDeps: PointerGestureDeps = {
    viewportRef,
    cameraRef,
    touchPointersRef,
    touchGestureRef,
    layoutLocked,
    isBusinessScope,
    scopeNode,
    scopeWorldSize,
    visibleNodes,
    documentState,
    updateDocument,
    checkpoint,
    dispatchRuntimeEvent,
    setScopeCamera,
    storeNodeProjection,
    storeScopeCanvasProjection,
  };
  // eslint-disable-next-line react-hooks/refs -- 工厂仅创建手势闭包，ref 只在事件回调内访问
  const onViewportPointerDown = createViewportPointerDownHandler(pointerGestureDeps);
  // eslint-disable-next-line react-hooks/refs -- 同上
  const moveNodeStart = createMoveNodeStart(pointerGestureDeps);
  // eslint-disable-next-line react-hooks/refs -- 同上
  const resizeNodeStart = createResizeNodeStart(pointerGestureDeps);
  // eslint-disable-next-line react-hooks/refs -- 同上
  const resizeScopeCanvasStart = createResizeScopeCanvasStart(pointerGestureDeps);

  /**
   * 泳道自动布局（薄封装）：泳道几何与堆叠算法在 ./editor/auto-layout 的
   * computeLaneAutoLayout（纯函数）中；此处只负责把结果写入 surface
   * 投影并触发适应视图。
   */
  const autoLayout = () => {
    const { nodeLayouts, canvasLayout } = computeLaneAutoLayout(
      scopeNode,
      scopeWorldSize.width,
    );
    commitView(
      updateSurface(
        documentState,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          const projection = surface.projections[activeCameraKey] ?? {
            camera: cameraRef.current,
            nodeLayouts: {},
          };
          return {
            ...surface,
            projections: {
              ...surface.projections,
              [activeCameraKey]: {
                ...projection,
                nodeLayouts: {
                  ...projection.nodeLayouts,
                  ...nodeLayouts,
                  [scopeNode.id]: canvasLayout,
                },
              },
            },
          };
        },
      ),
    );
    setTimeout(fitScope, 0);
  };

  // ========================================================================
  // 撤销 / 重做（undo / redo 由 useDocumentHistory 提供，见组件顶部解构）
  // ========================================================================

  // ========================================================================
  // 文档加载 / 导入 / 导出（已拆到 ./editor/document-io.ts）
  //   applyLoadedDocument / exportPip / loadPipBytes / importDocument；
  //   下方 Rust 宿主引导 effect 复用 loadPipBytes 与 applyLoadedDocument。
  // ========================================================================

  const documentIODeps: DocumentIODeps = {
    documentState,
    loadDocument,
    dispatchRuntimeEvent,
    setNavigationStack,
    markClean,
    setToast,
  };
  const { applyLoadedDocument, exportPip, loadPipBytes, importDocument } =
    createDocumentIO(documentIODeps);

  /** Rust 宿主引导：URL 带 ?token= 时从宿主接口拉取 .pip 种子并加载（仅启动时一次）。 */
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    let cancelled = false;
    void fetch(`/__pip/package?token=${encodeURIComponent(token)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Host 返回 ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => loadPipBytes(bytes, false))
      .then((loaded) => {
        if (!cancelled) {
          applyLoadedDocument(loaded);
          setToast("已从 Rust 种皮加载 PIP 内树");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setToast(error instanceof Error ? `种皮加载失败：${error.message}` : "种皮加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
    // Rust seed bootstraps once from the immutable URL token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========================================================================
  // 模块发布与业务节点增删改（已拆到 ./editor/business-ops.ts）
  //   这里组装依赖并调用工厂创建操作函数，名称与原闭包一致。
  //   selectPanelBusinessNode / updateInputBinding / updateOutputBinding
  //   在组件后段才声明，用箭头函数惰性转发避免 TDZ 引用错误。
  // ========================================================================

  const businessOpsDeps: BusinessOpsDeps = {
    viewportRef,
    cameraRef,
    layoutLocked,
    businessRoot,
    businessScope,
    selectedBusinessNode,
    documentState,
    updateDocument,
    checkpoint,
    setToast,
    setPendingPipe,
    commit,
    updateDocumentNode,
    updateDocumentNodeView,
    storeNodeProjection,
    setSelectedBusinessNodeId,
    dispatchRuntimeEvent,
    selectPanelBusinessNode: (panelId, nodeId) =>
      selectPanelBusinessNode(panelId, nodeId),
    updateInputBinding: (nodeId, portId, value) =>
      updateInputBinding(nodeId, portId, value),
    updateOutputBinding: (nodeId, portId, value) =>
      updateOutputBinding(nodeId, portId, value),
  };
  /* eslint-disable react-hooks/refs -- 工厂模式：businessOpsDeps 包含 ref，但下列工厂仅在事件回调中读取，渲染期不解引用 */
  const publishModule = createPublishModule(businessOpsDeps);
  const insertModule = createInsertModule(businessOpsDeps);
  const addBusinessChild = createAddBusinessChild(businessOpsDeps);
  const duplicateBusinessNode = createDuplicateBusinessNode(businessOpsDeps);
  const createLinkedBusinessNode = createCreateLinkedBusinessNode(businessOpsDeps);
  const deleteBusinessNode = createDeleteBusinessNode(businessOpsDeps);
  const startPipeDrag = createStartPipeDrag(businessOpsDeps);
  const moveBusinessNodeStart = createMoveBusinessNodeStart(businessOpsDeps);
  const resizeBusinessNodeStart = createResizeBusinessNodeStart(businessOpsDeps);
  const toggleBusinessResizeMode = createToggleBusinessResizeMode(businessOpsDeps);
  const toggleBusinessDisplayMode = createToggleBusinessDisplayMode(businessOpsDeps);
  /* eslint-enable react-hooks/refs */

  /**
   * 向当前应用叶子作用域添加运行时子节点（composite 空容器）。
   * 只在 canAddRuntimeChild 为 true 时有入口（见主 JSX 渲染标志区）。
   */
  const addRuntimeChild = () => {
    const node: IntentNode = {
      id: uid("node"),
      name: "新子节点",
      description: "当前叶子节点内部的新管道节点。",
      kind: "composite",
      inputs: [],
      outputs: [],
      children: [],
      position: { x: 180, y: 150 },
      size: { width: 280, height: 180 },
      resizeMode: "simple",
      displayMode: "minimized",
    };
    updateDocumentNode(scopeNode.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), node],
      canvasSize: scope.canvasSize ?? { width: 1000, height: 700 },
    }));
  };

  /** 复制当前选中的业务节点（深复制含后代）。 */
  const duplicateSelected = () =>
    duplicateBusinessNode(selectedBusinessNode.id);

  /** 删除当前选中的业务节点。 */
  const deleteSelected = () =>
    deleteBusinessNode(selectedBusinessNode.id);

  /** 重命名节点 ID：同步更新 businessRootId、树内引用以及所有面板的 selection。 */
  const renameBusinessNode = (nodeId: string, nextId: string) => {
    const result = renameIntentNodeId(documentState.rootIntent, nodeId, nextId);
    if (!result.ok) {
      setToast(`修改失败：${result.error}`);
      return;
    }
    commit({
      ...documentState,
      businessRootId:
        documentState.businessRootId === nodeId ? nextId : documentState.businessRootId,
      rootIntent: result.value,
      workspaceState: {
        ...documentState.workspaceState,
        panels: documentState.workspaceState.panels.map((panel) => ({
          ...panel,
          selection: {
            ...panel.selection,
            nodeIds: panel.selection.nodeIds.map((id) => id === nodeId ? nextId : id),
            primaryNodeId:
              panel.selection.primaryNodeId === nodeId
                ? nextId
                : panel.selection.primaryNodeId,
          },
        })),
      },
    });
    setToast(`节点 ID 已更新为 ${nextId}`);
  };

  // ---- 端口 Schema 编辑（属性面板的"输入/输出 Schema"区）----

  /** 修改/删除端口（next=null 表示删除）；有外部引用时校验会阻止并提示引用方。 */
  const editPortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
    portId: string,
    next: IntentNode["inputs"][number] | null,
  ) => {
    const result = updateIntentPortSchema(
      documentState.rootIntent,
      node.id,
      direction,
      portId,
      next,
    );
    if (!result.ok) {
      setToast(
        `端口修改失败：${result.error}${
          result.references?.length ? `（${result.references.join("、")}）` : ""
        }`,
      );
      return;
    }
    commit({ ...documentState, rootIntent: result.value });
    setToast(next ? `端口「${next.name}」已更新` : `端口「${portId}」已删除`);
  };

  /** 新增端口（默认 any 类型、data 通道）。 */
  const addPortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
  ) => {
    const port = {
      id: uid(direction === "inputs" ? "input" : "output"),
      name: direction === "inputs" ? "新输入" : "新输出",
      type: "any" as const,
      channel: "data" as const,
    };
    updateDocumentNode(node.id, (item) => ({
      ...item,
      [direction]: [...item[direction], port],
    }));
    setToast(`已新增${direction === "inputs" ? "输入" : "输出"}端口`);
  };

  /** 端口上移/下移（与相邻端口交换位置，影响边界端口的纵向排列顺序）。 */
  const movePortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
    index: number,
    offset: -1 | 1,
  ) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= node[direction].length) return;
    updateDocumentNode(node.id, (item) => {
      const ports = [...item[direction]];
      [ports[index], ports[nextIndex]] = [ports[nextIndex], ports[index]];
      return { ...item, [direction]: ports };
    });
  };

  // ---- 应用节点操作 ----

  /** 复制选中的应用节点（副本不再是核心节点，可自由删除）。 */
  const duplicateAppNode = () => {
    const selected = findNode(scopeNode, selectedAppNodeId);
    if (!selected || selected.id === scopeNode.id) return;
    const duplicate: IntentNode = {
      ...clone(selected),
      id: uid("view"),
      name: `${selected.name} · 副本`,
      position: {
        x: selected.position.x + 42,
        y: selected.position.y + 42,
      },
      implementation: selected.implementation
        ? { ...selected.implementation, core: false }
        : undefined,
    };
    updateDocumentNode(scopeNode.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), duplicate],
    }));
    setSelectedAppNodeId(duplicate.id);
  };

  /** 删除选中的应用节点；核心节点（编辑器自身 UI）需二次确认。 */
  const deleteAppNode = () => {
    const selected = findNode(scopeNode, selectedAppNodeId);
    if (!selected || selected.id === scopeNode.id) return;
    if (
      selected.implementation?.core &&
      !window.confirm(`「${selected.name}」是核心节点。确认删除？可通过“重置应用节点图”恢复。`)
    ) {
      return;
    }
    updateDocumentNode(scopeNode.id, (scope) => removeNode(scope, selected.id));
    setSelectedAppNodeId(scopeNode.children?.[0]?.id ?? scopeNode.id);
  };

  /** 重置应用节点图：按当前业务树重新生成应用文档（业务意图与模块快照保留）。 */
  const resetApplicationGraph = () => {
    if (!window.confirm("重置全部应用节点布局和系统绑定？业务意图与模块快照会保留。")) return;
    const reset = createApplicationDocument(clone(businessRoot), clone(documentState.publishedModules));
    const restored = freePanelContext(reset);
    // 与旧三行（截断压栈 + 清重做 + 写文档 + 标脏）等价，但事件发 DOCUMENT_LOADED
    // 而非 DOCUMENT_CHANGED，所以直接用 hook 的 commitDocument 而非 commit 包装。
    commitDocument(reset);
    setNavigationStack(restored.navigationStack);
    setSelectedAppNodeId("current_container");
    dispatchRuntimeEvent("DOCUMENT_LOADED", "application_root", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
  };

  // ---- 业务执行（已拆到 ./editor/use-business-run-state.ts）----
  const { runState, trace, rootInput, setRootInput, run, stop } =
    useBusinessRunState({ businessRoot, setToast });

  // 每次提交后把最新动作与状态写入 ref，键盘监听器因此只需挂载一次。
  useEffect(() => {
    actionRefs.current = {
      undo,
      redo,
      enterNode,
      navigateToParent,
      fitScope,
      centerScopeAtScale,
      setScopeCamera,
      deleteAppNode,
      documentState,
      visibleNodes,
      isBusinessScope,
      scopeNode,
      businessScope,
      selectedAppNodeId,
      selectedBusinessNodeId,
      navigationStackLength: navigationStack.length,
    };
  });

  /** 新建文档：有未导出修改时先确认；重置为示例文档并还原浏览位置。 */
  const newDocument = () => {
    if (
      dirty &&
      !window.confirm("当前文档有未导出的修改，确定要新建并丢弃这些修改吗？")
    )
      return;
    const next = sampleDocument();
    const restored = freePanelContext(next);
    loadDocument(next, true);
    setNavigationStack(restored.navigationStack);
    dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
  };

  useRuntimeCommandExecutor(lastCommands, {
    NEW_DOCUMENT: newDocument,
    IMPORT_REQUEST: () => fileInputRef.current?.click(),
    EXPORT_DOCUMENT: async () => {
      await exportDocument(documentState);
    },
    UNDO: undo,
    REDO: redo,
    AUTO_LAYOUT: autoLayout,
    PUBLISH_MODULE: publishModule,
    RUN_BUSINESS: run,
    STOP_BUSINESS: stop,
    ADD_BUSINESS_CHILD: () => addBusinessChild(),
    DUPLICATE_NODE: duplicateSelected,
    DELETE_NODE: deleteSelected,
    DUPLICATE_APP_NODE: duplicateAppNode,
    DELETE_APP_NODE: deleteAppNode,
    RESET_APP_GRAPH: resetApplicationGraph,
    NAVIGATE_APP_PARENT: () => {
      if (navigationStack.length > 1) navigateToParent();
    },
    FIT_SCOPE: fitScope,
    RESET_CAMERA: () => {
      const centered = centerScopeAtScale(1);
      if (centered) setScopeCamera(centered, true);
    },
  });

  /** 渲染器回调桥：把子渲染器发来的 RuntimeCommand 转投到事件管线。 */
  const emit = (command: RuntimeCommand) => {
    dispatchRuntimeEvent(command.type, command.source ?? "renderer", command.payload);
  };

  /**
   * 从意图树直接跳转到任意业务节点：重建整条钻取栈
   * （应用根 → 业务路径上的每一层），并定位/选中目标节点。
   */
  const navigateToBusinessNode = (node: IntentNode) => {
    const path = findPath(businessRoot, node.id) ?? [businessRoot];
    fitOnNextScopeRef.current = true;
    setScopeLegendOpen(false);
    setNavigationStack([
      { domain: "app", nodeId: appRoot.id },
      // 树导航直接进入业务域，不再压入容器渲染器技术层
      ...path.map<ScopeAddress>((item) => ({
        domain: "business",
        nodeId: item.id,
        viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
      })),
    ]);
    setBusinessScopeId(node.id);
    setSelectedBusinessNodeId(node.id);
  };

  /** 在指定面板内选中业务节点（只改该面板的 selection，不影响全局选中）。 */
  const selectPanelBusinessNode = (panelId: string, nodeId: string) => {
    view((active) =>
      updatePanel(active, panelId, (panel) => ({
        ...panel,
        selection: {
          nodeIds: [nodeId],
          primaryNodeId: nodeId,
          revision: panel.selection.revision + 1,
        },
      })),
    );
  };

  /** 在指定面板的容器 surface 内跳转到业务节点：更新面板选中 + 重写该 surface 的钻取栈。 */
  const navigatePanelBusinessNode = (
    panelId: string,
    containerSurfaceId: string,
    node: IntentNode,
  ) => {
    view((active) => {
      const root = getBusinessRoot(active);
      const path = findPath(root, node.id);
      if (!path) return active;
      const selected = updatePanel(active, panelId, (panel) => ({
        ...panel,
        selection: {
          nodeIds: [node.id],
          primaryNodeId: node.id,
          revision: panel.selection.revision + 1,
        },
      }));
      return updateSurface(
        selected,
        panelId,
        containerSurfaceId,
        (surface) =>
          surface.kind === "current-container"
            ? (() => {
                const targetScope = businessScopeAddress(node.id);
                const targetKey = scopeCameraKey(targetScope);
                return {
                ...surface,
                scope: targetScope,
                navigationStack: path.map((item) => ({
                  domain: "business" as const,
                  nodeId: item.id,
                  viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
                })),
                projections: {
                  ...surface.projections,
                  [targetKey]: {
                    camera: { scale: 1, x: 12, y: 12 },
                    nodeLayouts:
                      surface.projections[targetKey]?.nodeLayouts ?? {},
                  },
                },
              };
            })()
            : surface,
      );
    });
  };

  /** 节点的父作用域（绑定候选列表以"同层兄弟 + 父容器输入"为来源）。 */
  const parentScopeFor = (nodeId: string) =>
    findPath(businessRoot, nodeId)?.at(-2) ?? businessRoot;

  /** 输入端口的绑定候选：父容器环境输入（env:）+ 同层兄弟节点的输出（ref:）。 */
  const bindingOptionsFor = (nodeId: string) => {
    const parent = parentScopeFor(nodeId);
    return [
      ...parent.inputs.map((input) => ({
        value: `env:${input.id}`,
        label: `环境 · ${input.name}`,
      })),
      ...(parent.children ?? [])
        .filter((child) => child.id !== nodeId)
        .flatMap((child) =>
          child.outputs.map((output) => ({
            value: `ref:${child.id}:${output.id}`,
            label: `${child.name} · ${output.name}`,
          })),
        ),
    ];
  };

  /**
   * 更新输入端口绑定：value 为空 = 断开；"env:portId" = 绑环境输入；
   * "ref:nodeId:portId" = 绑上游节点输出。
   */
  const updateInputBinding = (
    nodeId: string,
    portId: string,
    value: string,
  ) => {
    let binding: Expression | undefined;
    if (value.startsWith("env:")) {
      binding = { kind: "ref", portId: value.slice(4), env: true };
    } else if (value.startsWith("ref:")) {
      const [, nodeIdValue, portIdValue] = value.split(":");
      binding = {
        kind: "ref",
        nodeId: nodeIdValue,
        portId: portIdValue,
      };
    }
    updateDocumentNode(nodeId, (node) => ({
      ...node,
      inputs: node.inputs.map((input) =>
        input.id === portId ? { ...input, binding } : input,
      ),
    }));
    setToast(binding ? "管道已连接或改绑" : "管道已断开");
  };

  /** 容器输出端口的映射候选：容器自身环境输入 + 内部子节点的输出。 */
  const outputBindingOptionsFor = (node: IntentNode) => [
    ...node.inputs.map((input) => ({
      value: `env:${input.id}`,
      label: `输入 · ${input.name}`,
    })),
    ...(node.children ?? []).flatMap((child) =>
      child.outputs.map((output) => ({
        value: `ref:${child.id}:${output.id}`,
        label: `${child.name} · ${output.name}`,
      })),
    ),
  ];

  /** 更新容器输出端口的映射（格式同 updateInputBinding；空值 = 断开映射）。 */
  const updateOutputBinding = (
    nodeId: string,
    portId: string,
    value: string,
  ) => {
    let binding: Expression | undefined;
    if (value.startsWith("env:")) {
      binding = { kind: "ref", portId: value.slice(4), env: true };
    } else if (value.startsWith("ref:")) {
      const [, nodeIdValue, portIdValue] = value.split(":");
      binding = {
        kind: "ref",
        nodeId: nodeIdValue,
        portId: portIdValue,
      };
    }
    updateDocumentNode(nodeId, (node) => ({
      ...node,
      outputs: node.outputs.map((output) =>
        output.id === portId ? { ...output, binding } : output,
      ),
    }));
  };

  /**
   * 业务作用域图层（已拆到 ./editor/business-scope-layer.tsx）：
   * 整棵业务画布委托给 BusinessGraphProjection；这里把页面级状态与动作
   * 打包成 BusinessScopeLayerDeps 传入（选中/进入/拖拽/缩放/连线/断开/添加）。
   */
  const businessScopeLayerDeps: BusinessScopeLayerDeps = {
    scope: businessScope,
    worldSize: scopeWorldSize,
    scale: camera.scale,
    selectedNodeId: selectedBusinessNodeId ?? undefined,
    layoutLocked,
    pendingPipe,
    selectNode: setSelectedBusinessNodeId,
    enterNode,
    moveNodeStart: moveBusinessNodeStart,
    resizeNodeStart: resizeBusinessNodeStart,
    toggleResizeMode: toggleBusinessResizeMode,
    toggleDisplayMode: toggleBusinessDisplayMode,
    updateInputBinding,
    updateOutputBinding,
    setToast,
    startPipeDrag,
    addChild: addBusinessChild,
  };

  /**
   * 节点内容渲染器分发（已拆到 ./editor/node-surfaces.tsx）：
   * 16 个内置面板分支 + 注册表兜底渲染器；这里把组件状态与动作
   * 打包成 NodeSurfaceDeps 传入。
   */
  const nodeSurfaceDeps: NodeSurfaceDeps = {
    documentState,
    appRoot,
    businessRoot,
    businessScope,
    scopeNode,
    selectedBusinessNode,
    selectedBusinessNodeId,
    selectedAppNodeId,
    validationIssues,
    runtimeState,
    eventTick,
    pendingEvents,
    pipelineTrace,
    lastCommands,
    runState,
    trace,
    rootInput,
    setRootInput,
    history,
    future,
    dirty,
    layoutLocked,
    camera,
    search,
    setSearch,
    navigationStack,
    setToast,
    dispatchRuntimeEvent,
    exportDocument,
    exportPip,
    emit,
    navigateToBusinessNode,
    navigatePanelBusinessNode,
    selectPanelBusinessNode,
    setSelectedBusinessNodeId,
    renameBusinessNode,
    updateDocumentNode,
    bindingOptionsFor,
    updateInputBinding,
    outputBindingOptionsFor,
    updateOutputBinding,
    editPortSchema,
    addPortSchema,
    movePortSchema,
    duplicateBusinessNode,
    createLinkedBusinessNode,
    deleteBusinessNode,
    insertModule,
  };
  const renderNodeContent = (
    node: IntentNode,
    contextAddress?: { panelId: string; surfaceId: string },
  ) => renderNodeSurface(node, nodeSurfaceDeps, contextAddress);

  // renderEdge / renderScopeBoundaryEdge（SVG 连线渲染）已迁至
  // ./editor/edge-renderer，此处仅组装 deps（见下方 edgeRendererDeps）。

  // ========================================================================
  // 渲染前的最终标志计算（主 JSX 条件渲染矩阵的输入）
  // ========================================================================

  const worldSize = scopeWorldSize;
  // renderedWorldSize：实际铺给 DOM 的画布尺寸（最小化时缩成小块）。
  const renderedWorldSize = scopeMinimized ? MINIMIZED_NODE_SIZE : worldSize;
  // 【条件④】focusedLeaf：已钻入深层（栈深 > 1）且当前作用域无子节点
  // → 该叶子节点自己的实现内容会占满画布渲染（focused-runtime-content）。
  const focusedLeaf =
    navigationStack.length > 1 && !scopeNode.children?.length;
  // 【条件⑤】canAddRuntimeChild：允许显示"＋ 添加子节点"按钮——
  // 应用域 + 不是 current-container 渲染器 + 聚焦叶子，三者同时满足。
  const canAddRuntimeChild =
    !isBusinessScope &&
    scopeNode.implementation?.key !== "current-container" &&
    focusedLeaf;
  // 导航条上的管道计数：业务域数业务引用边；应用域数节点绑定边 + 边界边。
  const derivedPipeCount = isBusinessScope
    ? businessVisualEdges.length
    : appEdges.length + scopeBoundaryEdges.length;

  // SVG 连线渲染 deps（edge-renderer.tsx 的 EdgeRendererDeps）。
  // 全部为渲染期只读值 + 事件回调，无 ref。
  const edgeRendererDeps: EdgeRendererDeps = {
    scopeNode,
    worldSize,
    selectedEdgeId,
    selectedAppNodeId,
    setSelectedEdgeId,
    updateInputBinding,
    setToast,
  };

  // ========================================================================
  // 主 JSX
  //   结构：<Workspace> 承载面板系统，freeCanvas 插槽传入当前作用域画布。
  //   画布内 root-boundary 的条件渲染矩阵：
  //     scopeMinimized        → 只渲染最小化块，其余全部隐藏
  //     isBusinessScope       → renderBusinessScopeLayer()（业务节点全在其中）
  //     !isBusinessScope      → 标题栏 + 边界端口 + SVG 连线 + NodeProjection 子节点
  //     focusedLeaf           → 叶子节点内容面板
  //     canAddRuntimeChild    → "＋ 添加子节点"按钮
  //     !layoutLocked         → 容器缩放手柄
  // ========================================================================
  return (
    <EditorWorkspace
      fileInputRef={fileInputRef}
      onImportDocument={importDocument}
      document={documentState}
        renderNodeContent={renderNodeContent}
        onUpdateInputBinding={updateInputBinding}
        onUpdateOutputBinding={updateOutputBinding}
        onAddBusinessChild={(scopeId) =>
          addBusinessChild(scopeId, false)
        }
        onFeedback={setToast}
        onWorkspaceChange={(workspace: WorkspaceState) => {
          view((active) => ({
            ...active,
            workspaceState: workspace,
          }));
        }}
        onUpdateView={(panelId) => {
          view((active) => {
            const panel = active.workspaceState.panels.find(
              (candidate) => candidate.id === panelId,
            );
            if (!panel) return active;
            return {
              ...active,
              views: active.views.map((item) =>
                item.id === panel.viewId
                  ? {
                      ...item,
                      layoutLocked: panel.layoutLocked,
                      surfaceTemplates: clone(panel.surfaces),
                    }
                  : item,
              ),
            };
          });
          setToast("已用当前 Panel 实例更新 View");
        }}
        onSaveViewAs={(panelId) => {
          const name = window.prompt("新 View 名称");
          if (!name?.trim()) return;
          view((active) => {
            const panel = active.workspaceState.panels.find(
              (candidate) => candidate.id === panelId,
            );
            const sourceView = active.views.find(
              (item) => item.id === panel?.viewId,
            );
            if (!panel || !sourceView) return active;
            const viewId = uid("view");
            const withPanel = updatePanel(active, panelId, (candidate) => ({
              ...candidate,
              viewId,
            }));
            return {
              ...withPanel,
              views: [
                ...withPanel.views,
                {
                  ...sourceView,
                  id: viewId,
                  name: name.trim(),
                  layoutLocked: panel.layoutLocked,
                  surfaceTemplates: clone(panel.surfaces),
                },
              ],
            };
          });
          setToast(`已另存 View：${name.trim()}`);
        }}
      canvas={
        <ScopeCanvas
          refs={{ viewport: viewportRef }}
          model={{
            camera,
            renderedWorldSize,
            activeCameraKey,
            scopeMinimized,
            isBusinessScope,
            layoutLocked,
            navigationStack,
            scopePath,
            derivedPipeCount,
            scopeLegendOpen,
            toast,
            businessLayer: businessScopeLayerDeps,
            header: {
              minimized: scopeMinimized,
              isBusinessScope,
              scopeNode,
              onToggleDisplayMode: toggleNodeDisplayMode,
            },
            appContent: {
              scopeNode,
              worldSize,
              appEdges,
              scopeBoundaryEdges,
              edgeRendererDeps,
              visibleNodes,
              cameraScale: camera.scale,
              selectedAppNodeId,
              layoutLocked,
              businessScopeId: businessScope.id,
              renderNodeContent,
              onSelectAppNode: setSelectedAppNodeId,
              onSelectBusinessNode: setSelectedBusinessNodeId,
              onEnterNode: enterNode,
              onMoveStart: moveNodeStart,
              onResizeStart: resizeNodeStart,
              onResizeModeToggle: toggleNodeResizeMode,
              onDisplayModeToggle: toggleNodeDisplayMode,
              focusedLeaf,
              canAddRuntimeChild,
              onAddRuntimeChild: addRuntimeChild,
            },
            resizeControls: {
              scopeNode,
              worldSize,
              selected: selectedAppNodeId === scopeNode.id,
              onResizeStart: resizeScopeCanvasStart,
              onResizeModeToggle: toggleNodeResizeMode,
            },
          }}
          actions={{
            onWheel,
            onViewportPointerDown,
            onToggleLegend: () => setScopeLegendOpen((open) => !open),
            onNavigateParent: navigateToParent,
            onNavigateFrame: navigateToScopeFrame,
            onDismissToast: () => setToast(""),
          }}
        />
      }
    />
  );
}
