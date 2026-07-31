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
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  businessScopeAddress,
  createApplicationDocument,
  getContainerSurface,
  getBusinessRoot,
  nodeDisplayMode,
  scopeCameraKey,
  serializeIntentDocument,
  updatePanel,
  updateSurface,
  type CameraState,
  type Expression,
  type IntentDocumentV3,
  type IntentNode,
  type JsonValue,
  type ScopeAddress,
  type WorkspaceState,
} from "./runtime/model";
import {
  downloadExport,
  prepareDocumentExport,
} from "./runtime/export";
import {
  renameIntentNodeId,
  updateIntentPortSchema,
} from "./runtime/authoring";
import {
  MINIMIZED_NODE_SIZE,
  NodeProjection,
  resizeDirectionsFor,
} from "./runtime/node-renderer";
import {
  type RuntimeCommand,
} from "./runtime/registry";
import {
  defaultNodeProjectionLayout,
  projectIntentTree,
} from "./runtime/projection";
import { Workspace } from "./runtime/workspace";
import {
  deriveBusinessVisualEdges,
} from "./runtime/business-canvas";
import {
  deriveNodeBindingEdges,
} from "./runtime/panel-pipelines";
import {
  createRuntimeEvent,
  processEventBatch,
  type ApplicationRuntimeState,
  type PipelineTraceEntry,
  type RuntimeCommand as PipelineCommand,
  type RuntimeEvent,
} from "./runtime/pipeline";
// ---- 从本文件拆出的功能模块（app/editor/）----
import {
  MAX_SCALE,
  MIN_SCALE,
  PORT_ROW,
  PORT_TOP,
} from "./editor/constants";
import {
  clone,
  findNode,
  findPath,
  freePanelContext,
  nodeResizeMode,
  nodeSize,
  removeNode,
  sampleDocument,
  uid,
  updateNode,
} from "./editor/tree-utils";
import {
  aggregateEdges,
  deriveScopeBoundaryEdges,
} from "./editor/bindings";
import { collectValidationIssues } from "./editor/validation";
import { computeLaneAutoLayout } from "./editor/auto-layout";
import {
  createDocumentIO,
  type DocumentIODeps,
} from "./editor/document-io";
import {
  createBusinessRun,
  type BusinessRunDeps,
} from "./editor/business-run";
import { type Trace } from "./editor/executor";
import {
  renderNodeSurface,
  type NodeSurfaceDeps,
} from "./editor/node-surfaces";
import {
  createMoveNodeStart,
  createResizeNodeStart,
  createResizeScopeCanvasStart,
  createViewportPointerDownHandler,
  type PointerGestureDeps,
} from "./editor/pointer-gestures";
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
} from "./editor/business-ops";
import {
  renderEdge,
  renderScopeBoundaryEdge,
  type EdgeRendererDeps,
} from "./editor/edge-renderer";
import {
  BusinessScopeLayer,
  type BusinessScopeLayerDeps,
} from "./editor/business-scope-layer";
import {
  createScopeCameraOps,
  type ScopeCameraDeps,
} from "./editor/scope-camera";
import {
  createScopeNavigationOps,
  type ScopeNavigationDeps,
} from "./editor/scope-navigation";

// ============================================================================
// 画布交互常量 → ./editor/constants
// 树操作 / 绑定 / 校验 / 执行器等纯函数 → ./editor/{tree-utils,bindings,validation,executor}
// ============================================================================

// ============================================================================
// 主组件
// ============================================================================

export default function Home() {
  // ---- 文档与历史 ----
  // documentState 是唯一事实源；history/future 支撑撤销/重做（各保留约 30 步）。
  const [documentState, setDocumentState] = useState<IntentDocumentV3>(() => sampleDocument());
  const [history, setHistory] = useState<IntentDocumentV3[]>([]);
  const [future, setFuture] = useState<IntentDocumentV3[]>([]);
  // ---- 作用域导航 ----
  // 钻取路径栈：栈顶 = 当前作用域；初始值从持久化的自由布局面板恢复。
  const [navigationStack, setNavigationStack] = useState<ScopeAddress[]>(() =>
    freePanelContext(sampleDocument()).navigationStack,
  );
  // ---- 画布视图状态 ----
  const [selectedAppNodeId, setSelectedAppNodeId] = useState("current_container"); // 应用域选中节点
  const [camera, setCamera] = useState<CameraState>({ scale: 0.5, x: 12, y: 12 }); // 平移 x/y + 缩放 scale
  const [search, setSearch] = useState("");          // 意图树搜索关键字
  const [dirty, setDirty] = useState(false);         // 有未导出修改（关闭页面前提示）
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // 选中的聚合管道边
  const [scopeLegendOpen, setScopeLegendOpen] = useState(false);             // 管道图例弹层
  // 正在拖拽中的连线（从端口拉出、尚未落点），null = 未在连线
  const [pendingPipe, setPendingPipe] = useState<PendingPipeState>(null);
  const [toast, setToast] = useState("");            // 轻提示文案（2.4s 自动消失）
  // ---- 业务执行 ----
  const [runState, setRunState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [trace, setTrace] = useState<Trace[]>([]);   // 执行轨迹（运行面板逐行展示）
  // ---- 事件管线（见文件头说明）----
  // runtimeState 是事件处理器归约出的运行时状态：当前业务作用域、选中、布局锁等。
  const [runtimeState, setRuntimeState] = useState<ApplicationRuntimeState>({
    scopeId: "business_root",
    selectionId: "scenario_flow",
    layoutLocked: false,
    documentRevision: 0,
    lastEventType: "BOOT",
  });
  const [pendingEvents, setPendingEvents] = useState<RuntimeEvent[]>([]);       // 待处理事件队列
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceEntry[]>([]); // 事件流水（保留最近 ~100 条）
  const [lastCommands, setLastCommands] = useState<PipelineCommand[]>([]);      // 最近一批事件产生的命令
  const [eventTick, setEventTick] = useState(0);     // 事件时钟：每批事件处理完 +1
  /** 导出当前文档为 v3 JSON 文件（带 SHA-256 校验），导出成功后清除 dirty 标记。 */
  const exportDocument = async (source: IntentDocumentV3 = documentState) => {
    const result = await prepareDocumentExport(serializeIntentDocument(source));
    if (!result.ok) {
      setToast(`导出失败：${result.error}`);
      return result;
    }
    downloadExport(result);
    setDirty(false);
    setToast(
      `已导出 ${result.filename} · ${result.byteLength} bytes · SHA-256 ${result.sha256.slice(0, 12)}…`,
    );
    return result;
  };
  // 业务根节点的运行输入值（运行面板中可编辑，object/array 类型按 JSON 解析）
  const [rootInput, setRootInput] = useState<Record<string, unknown>>({
    product_goal: "构建可验证、可持续演进的业务应用",
    business_constraints: "确定性、可审计、严格模块边界",
    stakeholders: "需求方, 产品设计, 工程实现",
  });
  // ---- Refs（不触发重渲染的可变引用）----
  const viewportRef = useRef<HTMLDivElement>(null);   // 画布视口 DOM（测尺寸/坐标换算）
  const fileInputRef = useRef<HTMLInputElement>(null); // 隐藏的导入文件选择框
  const cancelRunRef = useRef(false);                  // 业务执行取消标记
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

  /**
   * 事件管线入口：所有 UI 操作统一调用它把事件投入 pendingEvents 队列，
   * 由下方"事件时钟"effect 批量归约成新的 runtimeState 与命令。
   */
  const dispatchRuntimeEvent = useCallback(
    (
      type: string,
      source: string,
      payload?: Record<string, JsonValue>,
    ) => {
      setPendingEvents((events) => [
        ...events,
        createRuntimeEvent(type, source, payload),
      ]);
    },
    [],
  );

  /** 切换业务作用域：发 NAVIGATE_SCOPE 事件，由事件管线更新 runtimeState.scopeId。 */
  const setBusinessScopeId = useCallback(
    (scopeId: string) =>
      dispatchRuntimeEvent("NAVIGATE_SCOPE", "scope-navigation", { scopeId }),
    [dispatchRuntimeEvent],
  );

  /**
   * 选中业务节点：一方面发 SELECT_NODE 事件更新 runtimeState.selectionId，
   * 另一方面同步持久化到自由布局面板的 selection（供视图保存/恢复）。
   */
  const setSelectedBusinessNodeId = useCallback(
    (nodeId: string) => {
      dispatchRuntimeEvent("SELECT_NODE", "node-selection", { nodeId });
      setDocumentState((active) => {
        const next = updatePanel(active, "panel-free-layout", (panel) => ({
          ...panel,
          activeContainerSurfaceId: "free-layout-container",
          selection: {
            nodeIds: [nodeId],
            primaryNodeId: nodeId,
            revision: panel.selection.revision + 1,
          },
        }));
        return {
          ...next,
          workspaceState: {
            ...next.workspaceState,
          activePanelId: "panel-free-layout",
          },
        };
      });
    },
    [dispatchRuntimeEvent],
  );

  /**
   * 事件时钟：pendingEvents 非空时推进一个 tick，调用 processEventBatch
   * 把整批事件原子地归约成新 runtimeState + 事件流水 + 命令列表；
   * 命令列表由后面的 lastCommands effect 消费执行。
   */
  useEffect(() => {
    if (!pendingEvents.length) return;
    const tick = eventTick + 1;
    // The event clock intentionally commits one atomic batch per effect turn.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventTick(tick);
    try {
      const batch = processEventBatch(pendingEvents, runtimeState, tick);
      setPendingEvents(batch.nextTick);
      setRuntimeState(batch.state);
      setPipelineTrace((entries) => [...entries.slice(-95), ...batch.trace]);
      setLastCommands(batch.commands);
    } catch (error) {
      setPendingEvents([]);
      setToast(error instanceof Error ? error.message : String(error));
    }
  }, [eventTick, pendingEvents, runtimeState]);

  // ---- 两棵树的投影 ----
  // freeContainer：自由布局面板的容器 surface，持久化各作用域的相机与节点布局投影。
  const freeContainer = getContainerSurface(
    documentState,
    "panel-free-layout",
    "free-layout-container",
  );
  // appRoot：把 rootIntent 投影成带布局信息的应用节点树（业务树以引用节点形式挂在其中）。
  const appRoot = useMemo(
    () =>
      projectIntentTree(
        documentState.rootIntent,
        documentState.businessRootId,
        freeContainer?.projections ?? {},
      ),
    [
      documentState.businessRootId,
      documentState.rootIntent,
      freeContainer?.projections,
    ],
  );
  // businessRoot：从投影后的应用树中解引用出业务意图树的根。
  const businessRoot = useMemo(
    () =>
      getBusinessRoot({
        ...documentState,
        rootIntent: appRoot,
      }),
    [appRoot, documentState],
  );
  // ========================================================================
  // 当前作用域派生（主 JSX 的六个条件渲染标志都在这里计算）
  // ========================================================================

  // activeAddress：钻取栈顶 = 当前作用域地址；栈为空时兜底为应用根。
  const activeAddress = useMemo(
    () =>
      navigationStack.at(-1) ??
      ({ domain: "app", nodeId: appRoot.id } as const),
    [appRoot.id, navigationStack],
  );
  // 【条件①】isBusinessScope：当前作用域是否在业务域。
  // true → 主 JSX 走 renderBusinessScopeLayer()；false → 走应用域的端口/连线/NodeProjection。
  const isBusinessScope = activeAddress.domain === "business";
  // scopeNode：当前作用域对应的节点（按域分别在业务树/应用树中查找，找不到兜底为根）。
  const scopeNode = useMemo(
    () =>
      activeAddress.domain === "business"
        ? findNode(businessRoot, activeAddress.nodeId) ?? businessRoot
        : findNode(appRoot, activeAddress.nodeId) ?? appRoot,
    [activeAddress, appRoot, businessRoot],
  );
  // businessScope：当前业务作用域节点。在业务域时就是 scopeNode；
  // 在应用域时按 runtimeState.scopeId 定位（应用画布里也常需要引用它）。
  const businessScope = useMemo(
    () =>
      isBusinessScope
        ? scopeNode
        : findNode(businessRoot, businessScopeId) ?? businessRoot,
    [businessRoot, businessScopeId, isBusinessScope, scopeNode],
  );
  // selectedBusinessNode：当前选中的业务节点（属性面板等以它为编辑对象）。
  const selectedBusinessNode =
    findNode(businessRoot, selectedBusinessNodeId) ?? businessScope;

  /**
   * 持久化浏览上下文：把当前作用域地址、钻取路径、布局锁写回
   * 自由布局面板的容器 surface，保存视图/重开文档时可还原。
   */
  useEffect(() => {
    setDocumentState((active) =>
      updateSurface(
        active,
        "panel-free-layout",
        "free-layout-container",
        (surface) => {
          if (surface.kind !== "current-container") return surface;
          if (
            scopeCameraKey(surface.scope) === scopeCameraKey(activeAddress) &&
            surface.nodeLayoutLocked === layoutLocked &&
            surface.navigationStack
              .map(scopeCameraKey)
              .join("/") === navigationStack.map(scopeCameraKey).join("/")
          ) {
            return surface;
          }
          return {
            ...surface,
            scope: activeAddress,
            navigationStack,
            nodeLayoutLocked: layoutLocked,
          };
        },
      ),
    );
    // The free-layout canvas persists its private container context.
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [activeAddress, layoutLocked, navigationStack]);

  // ---- 当前作用域的三组连线（用于 SVG 渲染与管道计数）----
  // appEdges：应用域子节点之间的绑定边（聚合同源同通道的多条管道）。
  const appEdges = useMemo(
    () => aggregateEdges(deriveNodeBindingEdges(scopeNode)),
    [scopeNode],
  );
  // scopeBoundaryEdges：环境输入 → 子节点、子节点 → 容器输出 的边界虚拟边。
  const scopeBoundaryEdges = useMemo(
    () => deriveScopeBoundaryEdges(scopeNode),
    [scopeNode],
  );
  // businessVisualEdges：业务域画布内的可视化引用边。
  const businessVisualEdges = useMemo(
    () => deriveBusinessVisualEdges(businessScope),
    [businessScope],
  );
  // validationIssues：当前业务作用域的校验问题（循环依赖/未绑定/未消费）。
  const validationIssues = useMemo(
    () => collectValidationIssues(businessScope),
    [businessScope],
  );
  // 【条件②】visibleNodes：当前作用域的子节点列表（应用域时映射为 NodeProjection；
  // 为空且已钻入深层 = 叶子作用域，触发 focused-runtime-content 面板）。
  const visibleNodes = useMemo(() => scopeNode.children ?? [], [scopeNode.children]);
  // 【条件③】scopeMinimized：当前作用域处于最小化形态（整块画布缩成一个小块，
  // 双击展开）。注意定义中排除了业务域——业务作用域永不最小化。
  const scopeMinimized =
    !isBusinessScope && nodeDisplayMode(scopeNode) === "minimized";
  // activeCameraKey：当前作用域的投影键（相机与布局按此键持久化到 surface.projections）。
  const activeCameraKey = scopeCameraKey(activeAddress);
  // scopeCanvasProjection：当前作用域画布持久化的布局（含 frame 尺寸）。
  const scopeCanvasProjection =
    freeContainer?.projections[activeCameraKey]?.nodeLayouts[scopeNode.id];
  // scopeWorldSize：画布世界尺寸。优先级：
  //   最小化 → 固定小块尺寸；
  //   有持久化投影 → 用投影的 frame；
  //   否则按子节点包围盒 + 100px 余量推导（最小 900×600）。
  const scopeWorldSize = useMemo(
    () =>
      scopeMinimized
        ? MINIMIZED_NODE_SIZE
        : scopeCanvasProjection
          ? {
              width: scopeCanvasProjection.frame.width,
              height: scopeCanvasProjection.frame.height,
            }
          : scopeNode.canvasSize ?? {
            width: Math.max(
              900,
              ...visibleNodes.map(
                (node) =>
                  node.position.x + nodeSize(node).width + 100,
              ),
            ),
            height: Math.max(
              600,
              ...visibleNodes.map(
                (node) =>
                  node.position.y + nodeSize(node).height + 100,
              ),
            ),
          },
    [scopeCanvasProjection, scopeMinimized, scopeNode.canvasSize, visibleNodes],
  );
  // scopePath：钻取路径上每层作用域的显示名（面包屑导航使用）。
  const scopePath = useMemo(
    () =>
      navigationStack.map((address) => {
        const root = address.domain === "business" ? businessRoot : appRoot;
        return (
          findNode(root, address.nodeId)?.name ??
          (address.domain === "business" ? "业务作用域" : "应用作用域")
        );
      }),
    [appRoot, businessRoot, navigationStack],
  );

  /**
   * 两条文档提交通道：
   *   commit     结构性修改——进历史栈（可撤销）、标脏、广播 DOCUMENT_CHANGED；
   *   commitView 纯视图修改（布局/相机/显示模式）——不进历史，只标脏。
   */
  const commit = useCallback(
    (next: IntentDocumentV3) => {
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDocumentState(next);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [dispatchRuntimeEvent, documentState],
  );

  /** commitView：见上方 commit 注释——视图修改不污染撤销历史。 */
  const commitView = useCallback(
    (next: IntentDocumentV3) => {
      setDocumentState(next);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [dispatchRuntimeEvent],
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
    setDocumentState,
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
    setDocumentState,
    setHistory,
    setFuture,
    setDirty,
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
  // 撤销 / 重做（history 为撤销栈，future 为重做队列）
  // ========================================================================

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [documentState, ...items]);
    setHistory((items) => items.slice(0, -1));
    setDocumentState(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, documentState]);
    setFuture((items) => items.slice(1));
    setDocumentState(next);
  };

  // ========================================================================
  // 文档加载 / 导入 / 导出（已拆到 ./editor/document-io.ts）
  //   applyLoadedDocument / exportPip / loadPipBytes / importDocument；
  //   下方 Rust 宿主引导 effect 复用 loadPipBytes 与 applyLoadedDocument。
  // ========================================================================

  const documentIODeps: DocumentIODeps = {
    documentState,
    setDocumentState,
    setHistory,
    dispatchRuntimeEvent,
    setNavigationStack,
    setDirty,
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
    setDocumentState,
    setHistory,
    setFuture,
    setDirty,
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
    setHistory((items) => [...items.slice(-29), documentState]);
    setFuture([]);
    setDocumentState(reset);
    setNavigationStack(restored.navigationStack);
    setSelectedAppNodeId("current_container");
    dispatchRuntimeEvent("DOCUMENT_LOADED", "application_root", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
    setDirty(true);
  };

  // ---- 业务执行（已拆到 ./editor/business-run.ts）----
  // run：根输入 object/array 按 JSON 解析后交 executeBusinessNode 拓扑执行，
  // 轨迹实时合并写入 trace 状态；stop：置取消标记，执行器逐轮检查。
  const businessRunDeps: BusinessRunDeps = {
    businessRoot,
    rootInput,
    cancelRunRef,
    setRunState,
    setTrace,
    setToast,
  };
  /* eslint-disable react-hooks/refs -- 工厂模式：deps 含 cancelRunRef，但 run/stop 仅在事件回调中读写，渲染期不解引用 */
  const { run, stop } = createBusinessRun(businessRunDeps);
  /* eslint-enable react-hooks/refs */

  // 每次渲染都把最新动作与状态写入 ref，供键盘快捷键 effect 读取
  //（这样键盘 effect 无需把这些值列入依赖、反复解绑重挂）。
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

  /** 新建文档：有未导出修改时先确认；重置为示例文档并还原浏览位置。 */
  const newDocument = () => {
    if (
      dirty &&
      !window.confirm("当前文档有未导出的修改，确定要新建并丢弃这些修改吗？")
    )
      return;
    const next = sampleDocument();
    const restored = freePanelContext(next);
    setHistory((items) => [...items, documentState]);
    setFuture([]);
    setDocumentState(next);
    setNavigationStack(restored.navigationStack);
    dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
    setDirty(false);
  };

  /**
   * 命令处理器：事件管线产生的命令（lastCommands）在这里被翻译成
   * 实际的文档/相机/执行操作。UI 按钮只发事件 → 管线归约出命令 →
   * 此处统一执行，保证所有操作走同一条可审计路径。
   */
  useEffect(() => {
    if (!lastCommands.length) return;
    const timer = window.setTimeout(() => {
      lastCommands.forEach((command) => {
        if (command.type === "NEW_DOCUMENT") newDocument();
        if (command.type === "IMPORT_REQUEST") fileInputRef.current?.click();
        if (command.type === "EXPORT_DOCUMENT")
          void exportDocument(documentState);
        if (command.type === "UNDO") undo();
        if (command.type === "REDO") redo();
        if (command.type === "AUTO_LAYOUT") autoLayout();
        if (command.type === "PUBLISH_MODULE") publishModule();
        if (command.type === "RUN_BUSINESS") void run();
        if (command.type === "STOP_BUSINESS") stop();
        if (command.type === "ADD_BUSINESS_CHILD") addBusinessChild();
        if (command.type === "DUPLICATE_NODE") duplicateSelected();
        if (command.type === "DELETE_NODE") deleteSelected();
        if (command.type === "DUPLICATE_APP_NODE") duplicateAppNode();
        if (command.type === "DELETE_APP_NODE") deleteAppNode();
        if (command.type === "RESET_APP_GRAPH") resetApplicationGraph();
        if (
          command.type === "NAVIGATE_APP_PARENT" &&
          navigationStack.length > 1
        )
          navigateToParent();
        if (command.type === "FIT_SCOPE") fitScope();
        if (command.type === "RESET_CAMERA")
          {
            const centered = centerScopeAtScale(1);
            if (centered) setScopeCamera(centered, true);
          }
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // Commands intentionally execute once for each immutable batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCommands]);

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
    setDocumentState((active) =>
      updatePanel(active, panelId, (panel) => ({
        ...panel,
        selection: {
          nodeIds: [nodeId],
          primaryNodeId: nodeId,
          revision: panel.selection.revision + 1,
        },
      })),
    );
    setDirty(true);
  };

  /** 在指定面板的容器 surface 内跳转到业务节点：更新面板选中 + 重写该 surface 的钻取栈。 */
  const navigatePanelBusinessNode = (
    panelId: string,
    containerSurfaceId: string,
    node: IntentNode,
  ) => {
    setDocumentState((active) => {
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
    setDirty(true);
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
    <main className="everything-app">
      <input ref={fileInputRef} type="file" accept=".json,.intent-map.json,.pip" hidden onChange={importDocument} />
      <Workspace
        document={documentState}
        renderNodeContent={renderNodeContent}
        onUpdateInputBinding={updateInputBinding}
        onUpdateOutputBinding={updateOutputBinding}
        onAddBusinessChild={(scopeId) =>
          addBusinessChild(scopeId, false)
        }
        onFeedback={setToast}
        onWorkspaceChange={(workspace: WorkspaceState) => {
          setDocumentState((active) => ({
            ...active,
            workspaceState: workspace,
          }));
          setDirty(true);
        }}
        onUpdateView={(panelId) => {
          setDocumentState((active) => {
            const panel = active.workspaceState.panels.find(
              (candidate) => candidate.id === panelId,
            );
            if (!panel) return active;
            return {
              ...active,
              views: active.views.map((view) =>
                view.id === panel.viewId
                  ? {
                      ...view,
                      layoutLocked: panel.layoutLocked,
                      surfaceTemplates: clone(panel.surfaces),
                    }
                  : view,
              ),
            };
          });
          setDirty(true);
          setToast("已用当前 Panel 实例更新 View");
        }}
        onSaveViewAs={(panelId) => {
          const name = window.prompt("新 View 名称");
          if (!name?.trim()) return;
          setDocumentState((active) => {
            const panel = active.workspaceState.panels.find(
              (candidate) => candidate.id === panelId,
            );
            const sourceView = active.views.find(
              (view) => view.id === panel?.viewId,
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
          setDirty(true);
          setToast(`已另存 View：${name.trim()}`);
        }}
        freeCanvas={<div
        ref={viewportRef}
        className={`root-node-viewport ${layoutLocked ? "layout-locked" : ""}`}
        onWheel={onWheel}
        onPointerDownCapture={(event) => {
          if (event.pointerType === "touch") onViewportPointerDown(event);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") onViewportPointerDown(event);
        }}
      >
        <div className="root-grid" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, width: renderedWorldSize.width, height: renderedWorldSize.height }}>
          <div
            key={activeCameraKey}
            className={`root-boundary scope-arrival ${scopeMinimized ? "minimized" : "expanded"} ${isBusinessScope ? "business-scope-root" : ""}`}
            style={{ width: renderedWorldSize.width, height: renderedWorldSize.height }}
            data-display-mode={scopeMinimized ? "minimized" : "expanded"}
          >
            {/* 导航条：仅在"展开 + 已钻入子作用域"时显示（返回上级/面包屑/管道计数/缩放比） */}
            {!scopeMinimized && navigationStack.length > 1 && (
              <nav
                className="scope-navigation-bar"
                aria-label="当前作用域导航"
              >
                <button onClick={navigateToParent}>← 返回上级</button>
                <div className="scope-path">
                  {scopePath.map((name, index) => (
                    <Fragment key={`${navigationStack[index].domain}:${navigationStack[index].nodeId}`}>
                      <button
                        className={
                          index === scopePath.length - 1
                            ? "scope-path-current"
                            : undefined
                        }
                        disabled={index === scopePath.length - 1}
                        aria-current={
                          index === scopePath.length - 1
                            ? "page"
                            : undefined
                        }
                        title={name}
                        onClick={() => navigateToScopeFrame(index)}
                      >
                        {index === scopePath.length - 1 &&
                        navigationStack[index].domain === "business"
                          ? name
                          : name}
                      </button>
                      {index < scopePath.length - 1 && <i>›</i>}
                    </Fragment>
                  ))}
                </div>
                <button
                  className="scope-pipeline-trigger"
                  title="本作用域内的数据/事件管道数量，点击查看图例"
                  aria-expanded={scopeLegendOpen}
                  onClick={() => setScopeLegendOpen((open) => !open)}
                >
                  {derivedPipeCount} 管道
                </button>
                <span>{Math.round(camera.scale * 100)}%</span>
                {scopeLegendOpen && (
                  <div className="scope-legend-popover">
                    <span><i className="data" />数据管道</span>
                    <span><i className="event" />事件管道</span>
                    <small>Ctrl + 滚轮进入或返回</small>
                    <small>双击展开 · 再双击进入 · Esc 返回</small>
                    <small>Ctrl+Z 撤销 · Ctrl+S 导出 · Enter 进入选中</small>
                    <small>◆ 核心节点</small>
                  </div>
                )}
              </nav>
            )}
            {/* 作用域头部三态：最小化块（双击展开）/ 应用域标题栏（含最小化按钮）/ 业务域无标题栏 */}
            {scopeMinimized ? (
              <button
                className="root-minimized-node"
                style={{
                  left: 0,
                  top: 0,
                }}
                title="双击展开节点"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  toggleNodeDisplayMode(scopeNode);
                }}
              >
                {scopeNode.name}
              </button>
            ) : !isBusinessScope ? (
              <div className="root-caption">
                <span>{scopeNode.kind.toUpperCase()}</span>
                <strong>{scopeNode.name}</strong>
                <small>{scopeNode.description}</small>
                <button
                  className="node-display-toggle root-display-toggle"
                  aria-label={`最小化「${scopeNode.name}」`}
                  title="只显示节点名称"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleNodeDisplayMode(scopeNode);
                  }}
                >
                  −
                </button>
              </div>
            ) : null}
            {/* 业务域内容线：整棵业务节点画布（与应用域内容线互斥） */}
            {!scopeMinimized &&
              isBusinessScope && (
                <BusinessScopeLayer {...businessScopeLayerDeps} />
              )}
            {/* 应用域装饰层：边界输入/输出端口 + 节点间管道与边界管道的 SVG 连线 */}
            {!scopeMinimized && !isBusinessScope && (
              <>
                <div
                  className="scope-boundary-ports scope-boundary-inputs"
                  aria-hidden="true"
                >
                  {scopeNode.inputs.map((port, index) => (
                    <span
                      key={port.id}
                      style={{ top: PORT_TOP - 12 + index * PORT_ROW }}
                    >
                      <i />
                      {port.name}
                    </span>
                  ))}
                </div>
                <div
                  className="scope-boundary-ports scope-boundary-outputs"
                  aria-hidden="true"
                >
                  {scopeNode.outputs.map((port, index) => (
                    <span
                      key={port.id}
                      style={{ top: PORT_TOP - 12 + index * PORT_ROW }}
                    >
                      {port.name}
                      <i />
                    </span>
                  ))}
                </div>
                <svg
                  className="runtime-edges"
                  viewBox={`0 0 ${worldSize.width} ${worldSize.height}`}
                >
                  {appEdges.map((edge) => renderEdge(edge, edgeRendererDeps))}
                  {scopeBoundaryEdges.map((edge) => renderScopeBoundaryEdge(edge, edgeRendererDeps))}
                </svg>
              </>
            )}
            {/* 应用域子节点列表：每个子节点渲染为可拖拽/缩放/进入的 NodeProjection */}
            {/* eslint-disable-next-line react-hooks/refs -- renderNodeContent 是纯渲染分发；deps 中回调的 ref 访问只发生在事件回调里 */}
            {!scopeMinimized && !isBusinessScope && visibleNodes.map((node) => (
              <NodeProjection
                key={node.id}
                node={node}
                scale={camera.scale}
                selected={selectedAppNodeId === node.id}
                active={false}
                layoutLocked={layoutLocked}
                content={renderNodeContent(node)}
                onSelect={(nodeId) => {
                  setSelectedAppNodeId(nodeId);
                  if (nodeId === ACTIVE_BUSINESS_SCOPE_REF_ID) {
                    setSelectedBusinessNodeId(businessScope.id);
                  }
                }}
                onEnter={enterNode}
                onMoveStart={moveNodeStart}
                onResizeStart={resizeNodeStart}
                onResizeModeToggle={toggleNodeResizeMode}
                onDisplayModeToggle={toggleNodeDisplayMode}
              />
            ))}
            {/* 聚焦叶子面板：已钻入深层且没有子节点时，把叶子节点自身的实现内容放大渲染 */}
            {!scopeMinimized &&
              !isBusinessScope &&
              navigationStack.length > 1 &&
              !visibleNodes.length && (
              <section
                className="focused-runtime-content"
                style={{
                  width: Math.max(640, worldSize.width - 64),
                  height: Math.max(420, worldSize.height - 96),
                }}
              >
                {/* eslint-disable-next-line react-hooks/refs -- 同上：纯渲染调用，非渲染期 ref 读取 */}
                {renderNodeContent(scopeNode)}
              </section>
            )}
            {/* "＋ 添加子节点"按钮：仅 canAddRuntimeChild（应用域聚焦叶子、非容器渲染器）时出现 */}
            {!scopeMinimized &&
              !isBusinessScope &&
              canAddRuntimeChild && (
              <button className="runtime-add-child" onClick={addRuntimeChild}>＋ 添加子节点</button>
            )}
            {/* 容器缩放手柄 + 三向/八向模式切换：布局锁定或最小化时隐藏 */}
            {!scopeMinimized && !layoutLocked && (
              <>
                <span
                  className={`container-resize-layer ${selectedAppNodeId === scopeNode.id ? "selected" : ""}`}
                  aria-hidden="true"
                >
                  {resizeDirectionsFor(nodeResizeMode(scopeNode)).map(
                    (direction) => (
                      <span
                        className={`resize-handle resize-${direction}`}
                        key={direction}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          resizeScopeCanvasStart(direction, event);
                        }}
                      />
                    ),
                  )}
                </span>
                <button
                  className={`resize-mode-toggle container-mode-toggle ${nodeResizeMode(scopeNode)} ${selectedAppNodeId === scopeNode.id ? "selected" : ""}`}
                  style={{
                    left: worldSize.width - 40,
                    top: worldSize.height + 8,
                  }}
                  aria-label={
                    nodeResizeMode(scopeNode) === "simple"
                      ? `将当前容器「${scopeNode.name}」切换为四边四角缩放`
                      : `将当前容器「${scopeNode.name}」切换为右边、下边和右下角缩放`
                  }
                  title={
                    nodeResizeMode(scopeNode) === "simple"
                      ? "当前容器：右边、下边、右下角 · 点击切换为八向"
                      : "当前容器：四边四角 · 点击切换为三向"
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => toggleNodeResizeMode(scopeNode)}
                >
                  {nodeResizeMode(scopeNode) === "simple" ? "┘" : "⤢"}
                </button>
              </>
            )}
          </div>
        </div>
        {/* 全局轻提示：2.4s 自动消失，也可点击关闭 */}
        {toast && (
          <button
            type="button"
            className="runtime-toast"
            aria-label={`关闭提示：${toast}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setToast("")}
          >
            {toast}<span>×</span>
          </button>
        )}
      </div>}
      />
    </main>
  );
}
