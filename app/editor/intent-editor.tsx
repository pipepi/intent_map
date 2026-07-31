"use client";

import { useEffect, useState } from "react";
import {
  type RuntimeCommand,
} from "../runtime/registry";
import { useBusinessRunState } from "./use-business-run-state";
import { useScopeSession } from "./use-scope-session";
import { useRuntimeCommandExecutor } from "./use-runtime-command-executor";
import { useAuthoringSchemaActions } from "./use-authoring-schema-actions";
import { useApplicationNodeActions } from "./use-application-node-actions";
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
import { EditorWorkspaceContainer } from "./editor-workspace-container";
import { ScopeCanvasContainer } from "./scope-canvas-container";
import type { ScopeNavigationDeps } from "./scope-navigation";

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

  const autoLayout = useAutoLayoutAction({
    documentState,
    scopeNode,
    scopeWorldSize,
    activeCameraKey,
    cameraRef,
    commitViewChange,
    fitScope,
  });

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

  const emit = (command: RuntimeCommand) => {
    dispatchRuntimeEvent(command.type, command.source ?? "renderer", command.payload);
  };

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

  return (
    <EditorWorkspaceContainer
      document={{
        fileInputRef,
        onImportDocument: importDocument,
        document: documentState,
        renderNodeContent,
      }}
      authoring={{
        onUpdateInputBinding: updateInputBinding,
        onUpdateOutputBinding: updateOutputBinding,
        onAddBusinessChild: (scopeId) =>
          businessAuthoring.nodes.addChild(scopeId, false),
      }}
      views={{ updateViewDocument: view }}
      feedback={{ setToast }}
      canvas={
        <ScopeCanvasContainer
          scope={{
            scopeNode,
            businessScope,
            worldSize: scopeWorldSize,
            minimized: scopeMinimized,
            isBusiness: isBusinessScope,
            layoutLocked,
            navigationStack,
            scopePath,
            activeCameraKey,
            appEdges,
            boundaryEdges: scopeBoundaryEdges,
            businessPipeCount: businessVisualEdges.length,
            visibleNodes,
          }}
          canvas={{
            camera,
            viewportRef,
            onWheel,
            onViewportPointerDown,
            onMoveStart: moveNodeStart,
            onResizeStart: resizeNodeStart,
            onScopeResizeStart: resizeScopeCanvasStart,
            onResizeModeToggle: toggleNodeResizeMode,
            onDisplayModeToggle: toggleNodeDisplayMode,
          }}
          selection={{
            selectedAppNodeId,
            selectedBusinessNodeId,
            onSelectAppNode: setSelectedAppNodeId,
            onSelectBusinessNode: setSelectedBusinessNodeId,
            selectedEdgeId,
            setSelectedEdgeId,
          }}
          authoring={{
            businessLayer: {
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
            },
            updateInputBinding,
            onEnterNode: enterNode,
            onAddRuntimeChild: addRuntimeChild,
          }}
          navigation={{
            legendOpen: scopeLegendOpen,
            onToggleLegend: () => setScopeLegendOpen((open) => !open),
            onNavigateParent: navigateToParent,
            onNavigateFrame: navigateToScopeFrame,
          }}
          feedback={{ toast, setToast }}
          renderNodeContent={renderNodeContent}
        />
      }
    />
  );
}
