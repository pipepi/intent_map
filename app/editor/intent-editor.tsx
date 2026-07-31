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

import { useEffect, useState } from "react";
import {
  type RuntimeCommand,
} from "../runtime/registry";
// ---- 从本文件拆出的功能模块（app/editor/）----
import { useBusinessRunState } from "./use-business-run-state";
import { useScopeSession } from "./use-scope-session";
import { useRuntimeCommandExecutor } from "./use-runtime-command-executor";
import { useAuthoringSchemaActions } from "./use-authoring-schema-actions";
import { useApplicationNodeActions } from "./use-application-node-actions";
import { useWorkspaceViewActions } from "./use-workspace-view-actions";
import { useCanvasProjectionActions } from "./use-canvas-projection-actions";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useCanvasCameraSession } from "./use-canvas-camera-session";
import { usePanelNavigationActions } from "./use-panel-navigation-actions";
import { useCanvasPointerGestures } from "./use-canvas-pointer-gestures";
import { useScopeNavigationSession } from "./use-scope-navigation-session";
import { useAutoLayoutAction } from "./use-auto-layout-action";
import { createRuntimeCommandActions } from "./runtime-command-actions";
import { useDocumentSession } from "./use-document-session";
import { useNodeSurfaceController } from "./use-node-surface-controller";
import type { PendingPipeState } from "./business-ops";
import { useBusinessAuthoringSession } from "./use-business-authoring-session";
import { EditorWorkspace } from "./editor-workspace";
import { ScopeCanvas } from "./scope-canvas";
import type { ScopeNavigationDeps } from "./scope-navigation";
import {
  createBusinessLayerModel,
  createCanvasDerivedModel,
  createEdgeRendererModel,
} from "./editor-view-models";

// ============================================================================
// 画布交互常量 → ./editor/constants
// 树操作 / 绑定 / 校验 / 执行器等纯函数 → ./editor/{tree-utils,bindings,validation,executor}
// ============================================================================

// ============================================================================
// 主组件
// ============================================================================

export function IntentEditor() {
  // ---- 画布视图状态 ----
  const [selectedAppNodeId, setSelectedAppNodeId] = useState("current_container"); // 应用域选中节点
  const [search, setSearch] = useState("");          // 意图树搜索关键字
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // 选中的聚合管道边
  const [scopeLegendOpen, setScopeLegendOpen] = useState(false);             // 管道图例弹层
  // 正在拖拽中的连线（从端口拉出、尚未落点），null = 未在连线
  const [pendingPipe, setPendingPipe] = useState<PendingPipeState>(null);
  const [toast, setToast] = useState("");            // 轻提示文案（2.4s 自动消失）
  const documentSession = useDocumentSession(setToast);
  const {
    model: { document: documentState, history, future, dirty, navigationStack },
    writes: {
      commitDocumentChange,
      commitViewChange,
      updateNode: updateDocumentNode,
      updateTransient: updateDocument,
      checkpoint,
      rawCommit: commitDocument,
      rawView: view,
    },
    io: {
      fileInputRef,
      exportDocument,
      exportPip,
      importDocument,
      newDocument,
    },
    historyActions: { undo, redo },
    setNavigationStack,
    runtime,
  } = documentSession;
  const {
    runtimeState,
    pipelineTrace,
    lastCommands,
    eventTick,
    pendingEvents,
    dispatchRuntimeEvent,
    setBusinessScopeId,
    setSelectedBusinessNodeId,
  } = runtime;
  // ---- runtimeState 的三个常用字段别名（事件管线归约结果）----
  const businessScopeId = runtimeState.scopeId;         // 当前业务作用域节点 id
  const selectedBusinessNodeId = runtimeState.selectionId; // 业务域选中节点 id
  const layoutLocked = runtimeState.layoutLocked;       // 布局锁定：禁止一切拖拽/缩放

  // dispatchRuntimeEvent / setBusinessScopeId / setSelectedBusinessNodeId
  // 由 useRuntimePipeline 提供（上方解构），语义与签名不变。

  const {
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
    navigationStack,
  });

  const {
    camera,
    viewportRef,
    cameraRef,
    lastEnterAtRef,
    fitOnNextScopeRef,
    resetScaleOnNextScopeRef,
    setScopeCamera,
    fitScope,
    centerScopeAtScale,
  } = useCanvasCameraSession({
    documentState,
    updateDocument,
    activeCameraKey,
    scopeWorldSize,
    isBusinessScope,
    visibleNodes,
    scopeNode,
    scopeMinimized,
  });

  const {
    storeNodeProjection,
    storeScopeCanvasProjection,
    updateDocumentNodeView,
    toggleNodeResizeMode,
    toggleNodeDisplayMode,
  } = useCanvasProjectionActions({
    activeCameraKey,
    cameraRef,
    appRoot,
    documentState,
    commitViewChange,
    setSelectedAppNodeId,
  });

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
  const navOps = useScopeNavigationSession(scopeNavigationDeps);
  const { navigateToParent, navigateToScopeFrame, enterNode, onWheel } = navOps;

  // enterNode / nearestNode / onWheel 的实现已迁至 ./editor/scope-navigation.ts，
  // 由上方 navOps 解构提供，签名保持不变。

  /**
   * 指针交互手势（已拆到 ./editor/pointer-gestures.ts）：
   * 视口平移（鼠标/触屏）、应用节点拖拽/缩放、作用域画布缩放。
   * 这里组装依赖并调用工厂创建处理器，签名与原闭包一致。
   */
  const {
    onViewportPointerDown,
    moveNodeStart,
    resizeNodeStart,
    resizeScopeCanvasStart,
  } = useCanvasPointerGestures({
    viewportRef,
    cameraRef,
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
  });

  /**
   * 泳道自动布局（薄封装）：泳道几何与堆叠算法在 ./editor/auto-layout 的
   * computeLaneAutoLayout（纯函数）中；此处只负责把结果写入 surface
   * 投影并触发适应视图。
   */
  const autoLayout = useAutoLayoutAction({
    documentState,
    scopeNode,
    scopeWorldSize,
    activeCameraKey,
    cameraRef,
    commitViewChange,
    fitScope,
  });

  // ========================================================================
  // 模块发布与业务节点增删改（已拆到 ./editor/business-ops.ts）
  //   这里组装依赖并调用工厂创建操作函数，名称与原闭包一致。
  //   selectPanelBusinessNode / updateInputBinding / updateOutputBinding
  //   在组件后段才声明，用箭头函数惰性转发避免 TDZ 引用错误。
  // ========================================================================

  const {
    renameBusinessNode,
    editPortSchema,
    addPortSchema,
    movePortSchema,
    bindingOptionsFor,
    updateInputBinding,
    outputBindingOptionsFor,
    updateOutputBinding,
  } = useAuthoringSchemaActions({
    documentState,
    businessRoot,
    commitDocumentChange,
    updateDocumentNode,
    setToast,
  });

  const {
    navigateToBusinessNode,
    selectPanelBusinessNode,
    navigatePanelBusinessNode,
  } = usePanelNavigationActions({
    appRoot,
    businessRoot,
    fitOnNextScopeRef,
    setScopeLegendOpen,
    setNavigationStack,
    setBusinessScopeId,
    setSelectedBusinessNodeId,
    updateViewDocument: view,
  });

  const {
    addRuntimeChild,
    duplicateAppNode,
    deleteAppNode,
    resetApplicationGraph,
  } = useApplicationNodeActions({
    documentState,
    scopeNode,
    businessRoot,
    selectedAppNodeId,
    updateDocumentNode,
    commitDocument,
    setNavigationStack,
    setSelectedAppNodeId,
    dispatchRuntimeEvent,
  });

  const businessAuthoring = useBusinessAuthoringSession({
    refs: { viewportRef, cameraRef },
    scope: { layoutLocked, businessRoot, businessScope, selectedBusinessNode },
    document: {
      documentState, updateDocument, checkpoint,
      commit: commitDocumentChange, updateDocumentNode, updateDocumentNodeView,
      storeNodeProjection,
    },
    selection: { setSelectedBusinessNodeId, selectPanelBusinessNode },
    bindings: { updateInputBinding, updateOutputBinding },
    runtime: { dispatchRuntimeEvent },
    feedback: { setToast, setPendingPipe },
  });

  // ---- 业务执行（已拆到 ./editor/use-business-run-state.ts）----
  const { runState, trace, rootInput, setRootInput, run, stop } =
    useBusinessRunState({ businessRoot, setToast });

  useEditorShortcuts({
    dirty,
    undo,
    redo,
    exportDocument,
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
  });

  /* eslint-disable react-hooks/refs -- Command callbacks capture refs but execute only after runtime events. */
  const commandActions = createRuntimeCommandActions({
    document: {
      current: documentState,
      newDocument,
      requestImport: () => fileInputRef.current?.click(),
      exportDocument,
      undo,
      redo,
    },
    canvas: {
      autoLayout,
      fitScope,
      centerScopeAtScale,
      setScopeCamera,
    },
    authoring: {
      publishModule: businessAuthoring.modules.publish,
      addBusinessChild: () => businessAuthoring.nodes.addChild(),
      duplicateSelected: businessAuthoring.nodes.duplicateSelected,
      deleteSelected: businessAuthoring.nodes.removeSelected,
      duplicateAppNode,
      deleteAppNode,
      resetApplicationGraph,
    },
    runtime: { run, stop },
    navigation: {
      canNavigateParent: navigationStack.length > 1,
      navigateToParent,
    },
  });
  /* eslint-enable react-hooks/refs */
  useRuntimeCommandExecutor(lastCommands, commandActions);

  /** 渲染器回调桥：把子渲染器发来的 RuntimeCommand 转投到事件管线。 */
  const emit = (command: RuntimeCommand) => {
    dispatchRuntimeEvent(command.type, command.source ?? "renderer", command.payload);
  };

  /**
   * 业务作用域图层（已拆到 ./editor/business-scope-layer.tsx）：
   * 整棵业务画布委托给 BusinessGraphProjection；这里把页面级状态与动作
   * 打包成 BusinessScopeLayerDeps 传入（选中/进入/拖拽/缩放/连线/断开/添加）。
   */
  const businessScopeLayerDeps = createBusinessLayerModel({
    scope: businessScope,
    worldSize: scopeWorldSize,
    scale: camera.scale,
    selectedNodeId: selectedBusinessNodeId ?? undefined,
    layoutLocked,
    pendingPipe,
    selectNode: setSelectedBusinessNodeId,
    enterNode,
    moveNodeStart: businessAuthoring.geometry.moveStart,
    resizeNodeStart: businessAuthoring.geometry.resizeStart,
    toggleResizeMode: businessAuthoring.geometry.toggleResizeMode,
    toggleDisplayMode: businessAuthoring.geometry.toggleDisplayMode,
    updateInputBinding,
    updateOutputBinding,
    setToast,
    startPipeDrag: businessAuthoring.pipes.startDrag,
    addChild: businessAuthoring.nodes.addChild,
  });

  /**
   * 节点内容渲染器分发（已拆到 ./editor/node-surfaces.tsx）：
   * 16 个内置面板分支 + 注册表兜底渲染器；这里把组件状态与动作
   * 打包成 NodeSurfaceDeps 传入。
   */
  const renderNodeContent = useNodeSurfaceController({
    document: {
      documentState, history, future, dirty, exportDocument, exportPip,
      updateDocumentNode,
    },
    scope: {
      appRoot, businessRoot, businessScope, scopeNode, validationIssues,
      layoutLocked, camera, navigationStack,
    },
    selection: {
      selectedBusinessNode, selectedBusinessNodeId, selectedAppNodeId,
      setSelectedBusinessNodeId,
    },
    authoring: {
      renameBusinessNode, bindingOptionsFor, updateInputBinding,
      outputBindingOptionsFor, updateOutputBinding, editPortSchema,
      addPortSchema, movePortSchema,
      duplicateBusinessNode: businessAuthoring.nodes.duplicate,
      createLinkedBusinessNode: businessAuthoring.nodes.createLinked,
      deleteBusinessNode: businessAuthoring.nodes.remove,
      insertModule: businessAuthoring.modules.insert,
    },
    navigation: {
      navigateToBusinessNode, navigatePanelBusinessNode, selectPanelBusinessNode,
    },
    runtime: {
      runtimeState, eventTick, pendingEvents, pipelineTrace, lastCommands,
      runState, trace, rootInput, setRootInput, dispatchRuntimeEvent, emit,
    },
    workspace: { search, setSearch },
    feedback: { setToast },
  });

  // renderEdge / renderScopeBoundaryEdge（SVG 连线渲染）已迁至
  // ./editor/edge-renderer，此处仅组装 deps（见下方 edgeRendererDeps）。

  // ========================================================================
  // 渲染前的最终标志计算（主 JSX 条件渲染矩阵的输入）
  // ========================================================================

  const {
    worldSize,
    renderedWorldSize,
    focusedLeaf,
    canAddRuntimeChild,
    derivedPipeCount,
  } = createCanvasDerivedModel({
    scopeWorldSize,
    scopeMinimized,
    navigationDepth: navigationStack.length,
    scopeNode,
    isBusinessScope,
    businessPipeCount: businessVisualEdges.length,
    appPipeCount: appEdges.length + scopeBoundaryEdges.length,
  });

  // SVG 连线渲染 deps（edge-renderer.tsx 的 EdgeRendererDeps）。
  // 全部为渲染期只读值 + 事件回调，无 ref。
  const edgeRendererDeps = createEdgeRendererModel({
    scopeNode,
    worldSize,
    selectedEdgeId,
    selectedAppNodeId,
    setSelectedEdgeId,
    updateInputBinding,
    setToast,
  });
  const workspaceViewActions = useWorkspaceViewActions({
    updateViewDocument: view,
    setToast,
  });

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
          businessAuthoring.nodes.addChild(scopeId, false)
        }
        onFeedback={setToast}
        onWorkspaceChange={workspaceViewActions.onWorkspaceChange}
        onUpdateView={workspaceViewActions.onUpdateView}
        onSaveViewAs={workspaceViewActions.onSaveViewAs}
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
