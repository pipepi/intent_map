// ============================================================================
// 节点内容渲染器（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 按 node.implementation.key 分发系统 UI——工具栏、意图树、属性面板、校验、
// 运行追踪等都是应用树上的节点，在这里被赋予实际界面。
// 原实现是 Home 组件内的闭包函数；拆出后所有依赖通过 NodeSurfaceDeps
// 显式传入，page.tsx 只负责打包状态与回调。
// ============================================================================

import { Fragment, type Dispatch, type SetStateAction } from "react";
import {
  getBusinessRoot,
  resolveFeatureContext,
  type CameraState,
  type IntentDocumentV3,
  type IntentNode,
  type JsonValue,
  type PublishedModule,
  type ScopeAddress,
} from "../runtime/model";
import { resolveRenderer, type RuntimeCommand } from "../runtime/registry";
import {
  PROJECTION_LOD_THRESHOLD,
  projectIntentTree,
} from "../runtime/projection";
import { deriveBusinessVisualEdges } from "../runtime/business-canvas";
import {
  type ApplicationRuntimeState,
  type PipelineTraceEntry,
  type RuntimeCommand as PipelineCommand,
  type RuntimeEvent,
} from "../runtime/pipeline";
import { findNode, findPath } from "./tree-utils";
import { collectRefs } from "./bindings";
import {
  collectValidationIssues,
  detectCycle,
  type ValidationIssue,
} from "./validation";
import type { Trace } from "./executor";

/**
 * renderNodeSurface 的全部外部依赖（原 Home 组件闭包捕获的状态与回调）。
 * page.tsx 每次渲染打包一份传入。
 */
export type NodeSurfaceDeps = {
  // ---- 文档与树 ----
  documentState: IntentDocumentV3;
  appRoot: IntentNode;
  businessRoot: IntentNode;
  businessScope: IntentNode;
  scopeNode: IntentNode;
  selectedBusinessNode: IntentNode;
  selectedBusinessNodeId: string;
  selectedAppNodeId: string;
  validationIssues: ValidationIssue[];
  // ---- 事件管线 ----
  runtimeState: ApplicationRuntimeState;
  eventTick: number;
  pendingEvents: RuntimeEvent[];
  pipelineTrace: PipelineTraceEntry[];
  lastCommands: PipelineCommand[];
  // ---- 业务执行 ----
  runState: "idle" | "running" | "success" | "failed";
  trace: Trace[];
  rootInput: Record<string, unknown>;
  setRootInput: Dispatch<SetStateAction<Record<string, unknown>>>;
  // ---- 文档操作状态 ----
  history: IntentDocumentV3[];
  future: IntentDocumentV3[];
  dirty: boolean;
  layoutLocked: boolean;
  camera: CameraState;
  search: string;
  setSearch: (value: string) => void;
  navigationStack: ScopeAddress[];
  setToast: (text: string) => void;
  // ---- 动作回调 ----
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, JsonValue>,
  ) => void;
  exportDocument: () => Promise<unknown>;
  exportPip: () => Promise<void>;
  emit: (command: RuntimeCommand) => void;
  navigateToBusinessNode: (node: IntentNode) => void;
  navigatePanelBusinessNode: (
    panelId: string,
    containerSurfaceId: string,
    node: IntentNode,
  ) => void;
  selectPanelBusinessNode: (panelId: string, nodeId: string) => void;
  setSelectedBusinessNodeId: (nodeId: string) => void;
  renameBusinessNode: (nodeId: string, nextId: string) => void;
  updateDocumentNode: (
    id: string,
    updater: (node: IntentNode) => IntentNode,
  ) => void;
  bindingOptionsFor: (nodeId: string) => Array<{ value: string; label: string }>;
  updateInputBinding: (nodeId: string, portId: string, value: string) => void;
  outputBindingOptionsFor: (
    node: IntentNode,
  ) => Array<{ value: string; label: string }>;
  updateOutputBinding: (nodeId: string, portId: string, value: string) => void;
  editPortSchema: (
    node: IntentNode,
    direction: "inputs" | "outputs",
    portId: string,
    next: IntentNode["inputs"][number] | null,
  ) => void;
  addPortSchema: (node: IntentNode, direction: "inputs" | "outputs") => void;
  movePortSchema: (
    node: IntentNode,
    direction: "inputs" | "outputs",
    index: number,
    offset: -1 | 1,
  ) => void;
  duplicateBusinessNode: (targetId: string, panelId?: string) => void;
  createLinkedBusinessNode: (targetId: string, panelId?: string) => void;
  deleteBusinessNode: (targetId: string, panelId?: string) => void;
  insertModule: (module: PublishedModule) => void;
};

/** 意图树渲染上下文：面板实例化渲染时传入，接管选中/跳转行为（作用于面板自身而非全局）。 */
export type TreeProjectionContext = {
  scopeNodeId: string;
  selectedNodeId?: string;
  onSelect: (node: IntentNode) => void;
  onNavigate: (node: IntentNode) => void;
};

/**
 * 递归渲染意图树（树面板）：按 search 过滤名称/描述；
 * 单击选中、双击进入；◇ 表示有子节点的容器，ƒ 表示叶子算子。
 */
const renderTree = (
  node: IntentNode,
  depth: number,
  context: TreeProjectionContext | undefined,
  deps: NodeSurfaceDeps,
): React.ReactNode => {
  const matches =
    !deps.search ||
    node.name.toLowerCase().includes(deps.search.toLowerCase()) ||
    node.description.toLowerCase().includes(deps.search.toLowerCase());
  const scopeNodeId = context?.scopeNodeId ?? deps.businessScope.id;
  const selectedNodeId =
    context?.selectedNodeId ?? deps.selectedBusinessNodeId;
  return (
    <Fragment key={node.id}>
      {matches && (
        <button
          className={`runtime-tree-row ${scopeNodeId === node.id ? "scope" : ""} ${selectedNodeId === node.id ? "selected" : ""}`}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => {
            if (context) context.onSelect(node);
            else deps.setSelectedBusinessNodeId(node.id);
          }}
          onDoubleClick={() => {
            if (context) context.onNavigate(node);
            else deps.navigateToBusinessNode(node);
          }}
        >
          <span>{node.children?.length ? "◇" : "ƒ"}</span>
          <strong>{node.name}</strong>
          <small>{node.children?.length ?? 0}</small>
        </button>
      )}
      {node.children?.map((child) =>
        renderTree(child, depth + 1, context, deps),
      )}
    </Fragment>
  );
};

/**
 * 节点内容渲染器分发：按 node.implementation.key 返回对应的系统 UI。
 * 这是"编辑器本身也是节点图"的体现——工具栏、树、属性面板、校验、
 * 运行追踪等都是应用树上的节点，在这里被赋予实际界面。
 * contextAddress 存在时表示渲染发生在某个面板实例内，
 * 需要先解析该面板的上下文（自己的容器/选中/校验范围）。
 */
export const renderNodeSurface = (
  node: IntentNode,
  deps: NodeSurfaceDeps,
  contextAddress?: { panelId: string; surfaceId: string },
) => {
  const {
    documentState,
    appRoot,
    businessRoot,
    businessScope,
    scopeNode,
    selectedBusinessNode,
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
    navigationStack,
    setSearch,
    setToast,
    dispatchRuntimeEvent,
    exportDocument,
    exportPip,
    emit,
    navigateToBusinessNode,
    navigatePanelBusinessNode,
    selectPanelBusinessNode,
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
  } = deps;
  const surfaceContext = contextAddress
    ? resolveFeatureContext(
        documentState,
        contextAddress.panelId,
        contextAddress.surfaceId,
      )
    : undefined;
  const contextualRoot = surfaceContext?.container
    ? projectIntentTree(
        documentState.rootIntent,
        documentState.businessRootId,
        surfaceContext.container.projections,
      )
    : appRoot;
  const contextualBusinessRoot = getBusinessRoot({
    ...documentState,
    rootIntent: contextualRoot,
  });
  const contextualBusinessScope = surfaceContext?.container
    ? findNode(
        contextualBusinessRoot,
        surfaceContext.container.scope.nodeId,
      ) ?? contextualBusinessRoot
    : businessScope;
  const contextualSubject = surfaceContext?.subject
    ? findNode(contextualRoot, surfaceContext.subject.id) ??
      surfaceContext.subject
    : selectedBusinessNode;
  const contextualValidationIssues = contextAddress
    ? collectValidationIssues(contextualBusinessScope)
    : validationIssues;
  const key = node.implementation?.key;
  // 文档信息卡：版本、业务根、模块数、加载入口
  if (key === "intent-document-loader") {
    return (
      <div className="runtime-inspector-surface">
        <span>DOCUMENT</span>
        <strong>IntentDocument v{documentState.version}</strong>
        <small>业务根：{documentState.businessRootId}</small>
        <small>模块快照：{documentState.publishedModules.length}</small>
        <button onClick={() => dispatchRuntimeEvent("IMPORT_REQUEST", "document_loader")}>加载文档</button>
      </div>
    );
  }
  // 运行时状态检视卡：文档修订号 / 当前作用域 / 选中 / 布局锁
  if (key === "application-state") {
    return (
      <div className="runtime-inspector-surface">
        <span>STATE NODE</span>
        <strong>revision {runtimeState.documentRevision}</strong>
        <small>scope：{runtimeState.scopeId}</small>
        <small>selection：{runtimeState.selectionId}</small>
        <small>layout：{runtimeState.layoutLocked ? "locked" : "editable"}</small>
      </div>
    );
  }
  // 事件时钟检视卡：tick、队列长度、最近事件流水
  if (key === "event-clock") {
    return (
      <div className="runtime-inspector-surface">
        <span>EVENT CLOCK</span>
        <strong>tick {eventTick}</strong>
        <small>当前队列：{pendingEvents.length}</small>
        <small>最近事件：{runtimeState.lastEventType}</small>
        <div className="runtime-mini-trace">
          {pipelineTrace.slice(-4).map((item) => (
            <i key={`${item.tick}-${item.sequence}`}>#{item.tick}.{item.sequence} {item.eventType}</i>
          ))}
        </div>
      </div>
    );
  }
  // 命令处理器检视卡：当前命令批内容
  if (key === "command-processor") {
    return (
      <div className="runtime-inspector-surface">
        <span>COMMANDS</span>
        <strong>{lastCommands.length} 条当前命令</strong>
        <div className="runtime-mini-trace">
          {lastCommands.slice(-5).map((command) => <i key={command.id}>{command.type}</i>)}
        </div>
      </div>
    );
  }
  // 执行器卡：运行状态 + "执行业务根"按钮
  if (key === "intent-executor") {
    return (
      <div className="runtime-inspector-surface">
        <span>EXECUTOR</span>
        <strong>{runState.toUpperCase()}</strong>
        <small>业务根：{businessRoot.name}</small>
        <small>追踪步骤：{trace.length}</small>
        <button onClick={() => dispatchRuntimeEvent("RUN_REQUEST", "intent_executor")} disabled={runState === "running"}>执行业务根</button>
      </div>
    );
  }
  // 全局工具栏：新建/导入/导出/撤销重做/泳道布局/发布模块/布局锁/运行停止
  if (key === "global-toolbar") {
    return (
      <div className="global-toolbar-surface">
        <div className="runtime-brand"><i>◈</i><span><strong>Intent Map</strong><small>一切皆管道（节点）· v3</small></span></div>
        <div className="runtime-command-grid">
          <button onClick={() => dispatchRuntimeEvent("NEW_DOCUMENT", "global_toolbar")}>新建</button>
          <button onClick={() => dispatchRuntimeEvent("IMPORT_REQUEST", "global_toolbar")}>导入</button>
          <button onClick={() => void exportDocument()}>导出 v3</button>
          <button onClick={() => void exportPip()}>导出 .pip</button>
          <button disabled={!history.length} onClick={() => dispatchRuntimeEvent("UNDO", "global_toolbar")}>撤销</button>
          <button disabled={!future.length} onClick={() => dispatchRuntimeEvent("REDO", "global_toolbar")}>重做</button>
          <button onClick={() => dispatchRuntimeEvent("AUTO_LAYOUT", "global_toolbar")}>泳道布局</button>
          <button onClick={() => dispatchRuntimeEvent("PUBLISH_MODULE", "global_toolbar")}>发布模块</button>
          <button onClick={() => dispatchRuntimeEvent("SET_LAYOUT_LOCK", "global_toolbar", { locked: !layoutLocked })}>{layoutLocked ? "解锁布局" : "锁定布局"}</button>
          {runState === "running" ? <button className="danger" onClick={() => dispatchRuntimeEvent("STOP_REQUEST", "global_toolbar")}>停止</button> : <button className="primary" onClick={() => dispatchRuntimeEvent("RUN_REQUEST", "global_toolbar")}>运行</button>}
        </div>
        <small className="runtime-save-state">{dirty ? "● 未导出" : "○ 已同步到文件"}</small>
      </div>
    );
  }
  // 意图树面板：搜索框 + 递归树（面板实例内渲染时接入面板自己的选中/跳转）
  if (key === "intent-tree") {
    const treeContext =
      contextAddress && surfaceContext?.panel
        ? {
            scopeNodeId:
              surfaceContext.container?.scope.nodeId ??
              contextualBusinessScope.id,
            selectedNodeId:
              surfaceContext.panel.selection.primaryNodeId,
            onSelect: (target: IntentNode) => {
              if (surfaceContext.container) {
                navigatePanelBusinessNode(
                  contextAddress.panelId,
                  surfaceContext.container.id,
                  target,
                );
              } else {
                selectPanelBusinessNode(
                  contextAddress.panelId,
                  target.id,
                );
              }
            },
            onNavigate: (target: IntentNode) => {
              if (surfaceContext.container) {
                navigatePanelBusinessNode(
                  contextAddress.panelId,
                  surfaceContext.container.id,
                  target,
                );
              } else {
                selectPanelBusinessNode(
                  contextAddress.panelId,
                  target.id,
                );
              }
            },
          }
        : undefined;
    return (
      <div className="tree-surface">
        <input value={deps.search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索意图或端口" />
        <div>{renderTree(contextualBusinessRoot, 0, treeContext, deps)}</div>
      </div>
    );
  }
  // 模块库面板：已发布模块列表，点击插入为链接实例
  if (key === "module-library") {
    return (
      <div className="module-surface">
        <div className="surface-heading"><strong>已发布模块</strong><span>{documentState.publishedModules.length}</span></div>
        {documentState.publishedModules.length ? documentState.publishedModules.slice().reverse().map((module) => (
          <button key={`${module.moduleId}-${module.version}`} onClick={() => insertModule(module)}>
            <i>◇</i><span><strong>{module.name}</strong><small>v{module.version} · {module.publishedAt}</small></span><b>＋</b>
          </button>
        )) : <div className="surface-empty">选择业务节点后发布模块</div>}
      </div>
    );
  }
  // 校验面板：错误/警告/提示计数 + 可点击定位的问题列表
  if (key === "validation") {
    return (
      <div className={`validation-surface ${detectCycle(contextualBusinessScope) ? "error" : "ok"}`}>
        <i>{contextualValidationIssues.some((issue) => issue.level === "error") ? "!" : contextualValidationIssues.length ? "△" : "✓"}</i>
        <span><strong>{contextualValidationIssues.length ? `${contextualValidationIssues.filter((issue) => issue.level === "error").length} 错误 · ${contextualValidationIssues.filter((issue) => issue.level === "warning").length} 警告 · ${contextualValidationIssues.filter((issue) => issue.level === "info").length} 提示` : "作用域有效"}</strong><small>{contextualValidationIssues.length ? "端口、依赖与消费关系检查" : "端口、可见性与数据 DAG 校验通过"}</small></span>
        {contextualValidationIssues.length > 0 && (
          <ul className="validation-issue-list">
            {contextualValidationIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.nodeId}-${issue.portId ?? index}`} className={`issue-${issue.level}`}>
                <button onClick={() => {
                  const target = findNode(contextualBusinessRoot, issue.nodeId);
                  if (!target) return;
                  if (contextAddress && surfaceContext?.container) {
                    navigatePanelBusinessNode(contextAddress.panelId, surfaceContext.container.id, target);
                  } else if (contextAddress) {
                    selectPanelBusinessNode(contextAddress.panelId, target.id);
                  } else {
                    navigateToBusinessNode(target);
                  }
                  setToast(`已定位：${issue.text}`);
                }}>{issue.text}</button>
              </li>
            ))}
            {contextualValidationIssues.length > 8 && (
              <li className="issue-info">… 其余 {contextualValidationIssues.length - 8} 项</li>
            )}
          </ul>
        )}
      </div>
    );
  }
  // 业务面包屑条：业务根到当前作用域的路径
  if (key === "breadcrumb") {
    const path = findPath(businessRoot, businessScope.id) ?? [businessRoot];
    return <div className="breadcrumb-surface">{path.map((item, index) => <Fragment key={item.id}><button onClick={() => navigateToBusinessNode(item)}>{item.name}</button>{index < path.length - 1 && <i>›</i>}</Fragment>)}</div>;
  }
  // 作用域工具栏：当前路径 + 上级/布局锁/泳道布局/复制删除节点/重置/适应/加子意图
  if (key === "scope-toolbar") {
    return (
      <div className="scope-toolbar-surface">
        <div className="scope-toolbar-context">
          <span>{scopeNode.kind.toUpperCase()}</span>
          <strong>
            {navigationStack
              .map((address) =>
                address.domain === "business"
                  ? findNode(businessRoot, address.nodeId)?.name ??
                    address.nodeId
                  : findNode(appRoot, address.nodeId)?.name ??
                    address.nodeId,
              )
              .join(" / ")}
          </strong>
          <small>
            {businessScope.name} · {businessScope.inputs.length} 输入 ·{" "}
            {businessScope.outputs.length} 输出
          </small>
        </div>
        <div className="scope-toolbar-actions">
          <button
            disabled={navigationStack.length === 1}
            onClick={() =>
              dispatchRuntimeEvent(
                "NAVIGATE_APP_PARENT",
                "scope_toolbar",
              )
            }
          >
            ← 上级
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent("SET_LAYOUT_LOCK", "scope_toolbar", {
                locked: !layoutLocked,
              })
            }
          >
            {layoutLocked ? "解锁布局" : "锁定布局"}
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent("AUTO_LAYOUT", "scope_toolbar")
            }
          >
            泳道布局
          </button>
          <button
            disabled={!findNode(scopeNode, selectedAppNodeId)}
            onClick={() =>
              dispatchRuntimeEvent(
                "DUPLICATE_APP_NODE",
                "scope_toolbar",
              )
            }
          >
            复制节点
          </button>
          <button
            disabled={!findNode(scopeNode, selectedAppNodeId)}
            onClick={() =>
              dispatchRuntimeEvent("DELETE_APP_NODE", "scope_toolbar")
            }
          >
            删除节点
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent("RESET_APP_GRAPH", "scope_toolbar")
            }
          >
            重置节点图
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent("FIT_SCOPE", "scope_toolbar")
            }
          >
            适应
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent("RESET_CAMERA", "scope_toolbar")
            }
          >
            {Math.round(camera.scale * 100)}%
          </button>
          <button onClick={() => navigateToBusinessNode(businessRoot)}>
            业务根
          </button>
          <button
            onClick={() =>
              dispatchRuntimeEvent(
                "ADD_BUSINESS_CHILD",
                "scope_toolbar",
              )
            }
          >
            ＋ 子意图
          </button>
        </div>
      </div>
    );
  }
  // 当前容器占位卡：应用域中代表"业务容器"的引用节点缩略信息
  if (key === "current-container") {
    return (
      <div className="runtime-lod-summary current-container-preview">
        <span>进入后显示一个显式的当前业务容器引用节点</span>
        <small>
          {businessScope.inputs.length} 输入 ·{" "}
          {businessScope.children?.length ?? 0} 子意图 ·{" "}
          {businessScope.outputs.length} 输出
        </small>
      </div>
    );
  }
  // 业务作用域引用卡：名称/描述/输入输出端口清单
  if (key === "business-scope-reference") {
    return (
      <div className="business-scope-reference-card">
        <header>
          <span>{businessScope.kind.toUpperCase()}</span>
          <strong>{businessScope.name}</strong>
          <i aria-hidden="true" />
        </header>
        <p>{businessScope.description}</p>
        <div className="business-scope-reference-interfaces">
          <div>
            <strong>业务输入</strong>
            {businessScope.inputs.map((port) => (
              <span key={port.id}>
                <i />
                {port.name}
              </span>
            ))}
          </div>
          <div>
            <strong>业务输出</strong>
            {businessScope.outputs.map((port) => (
              <span key={port.id}>
                {port.name}
                <i />
              </span>
            ))}
          </div>
        </div>
        <footer>
          <span>{businessScope.inputs.length} in</span>
          <span>{businessScope.children?.length ?? 0} children</span>
          <span>{businessScope.outputs.length} out</span>
        </footer>
      </div>
    );
  }
  // 画布状态条：图例 + 业务引用计数 + 交互提示
  if (key === "canvas-status") {
    return (
      <div className="canvas-status-surface">
        <span><i className="data" />数据管道</span>
        <span><i className="event" />事件管道</span>
        <span>{deriveBusinessVisualEdges(businessScope).length} 条业务引用</span>
        <span>双指平移/缩放 · Ctrl+滚轮 50%–200% · 拖端口连线 · 双击输入端口断开</span>
      </div>
    );
  }
  // 属性面板：节点 ID/名称/描述/算子、端口绑定下拉、Schema 编辑、副本/链接/删除
  if (key === "properties") {
    return (
      <div className="properties-surface">
        <div className="property-heading"><span>{contextualSubject.kind === "operator" ? "ƒ" : "◇"}</span><div><small>{contextualSubject.kind}</small><strong>{contextualSubject.name}</strong></div></div>
        <label>节点 ID<input defaultValue={contextualSubject.id} key={contextualSubject.id} onBlur={(event) => event.target.value !== contextualSubject.id && renameBusinessNode(contextualSubject.id, event.target.value.trim())} /></label>
        <label>名称<input value={contextualSubject.name} onChange={(event) => updateDocumentNode(contextualSubject.id, (item) => ({ ...item, name: event.target.value }))} /></label>
        <label>描述<textarea rows={3} value={contextualSubject.description} onChange={(event) => updateDocumentNode(contextualSubject.id, (item) => ({ ...item, description: event.target.value }))} /></label>
        {contextualSubject.kind === "operator" && <label>内置算子<select value={contextualSubject.operator ?? "identity"} onChange={(event) => updateDocumentNode(contextualSubject.id, (item) => ({ ...item, operator: event.target.value }))}><option value="identity">identity</option><option value="object">object</option><option value="array">array</option><option value="concat">concat</option></select></label>}
        <div className="property-ports"><strong>输入</strong>{contextualSubject.inputs.map((port) => {
          const reference = collectRefs(port.binding)[0];
          const value = reference?.env
            ? `env:${reference.portId}`
            : reference?.nodeId
              ? `ref:${reference.nodeId}:${reference.portId}`
              : "";
          return <span className="binding-port-row" key={port.id}><i />{port.name}<select value={value} onChange={(event) => updateInputBinding(contextualSubject.id, port.id, event.target.value)}><option value="">未绑定</option>{bindingOptionsFor(contextualSubject.id).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span>;
        })}</div>
        <div className="property-ports outputs"><strong>输出</strong>{contextualSubject.outputs.map((port) => {
          const reference = collectRefs(port.binding)[0];
          const value = reference?.env
            ? `env:${reference.portId}`
            : reference?.nodeId
              ? `ref:${reference.nodeId}:${reference.portId}`
              : "";
          return contextualSubject.kind === "composite"
            ? <span className="binding-port-row" key={port.id}><i />{port.name}<select value={value} onChange={(event) => updateOutputBinding(contextualSubject.id, port.id, event.target.value)}><option value="">未映射</option>{outputBindingOptionsFor(contextualSubject).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span>
            : <span key={port.id}><i />{port.name}<small>{port.type}</small></span>;
        })}</div>
        {(["inputs", "outputs"] as const).map((direction) => (
          <section className="port-schema-editor" key={direction}>
            <header><strong>{direction === "inputs" ? "输入 Schema" : "输出 Schema"}</strong><button onClick={() => addPortSchema(contextualSubject, direction)}>＋ 新增</button></header>
            {contextualSubject[direction].map((port, index) => (
              <div className="port-schema-row" key={port.id}>
                <input aria-label="端口 ID" defaultValue={port.id} onBlur={(event) => editPortSchema(contextualSubject, direction, port.id, { ...port, id: event.target.value.trim() })} />
                <input aria-label="端口名称" value={port.name} onChange={(event) => editPortSchema(contextualSubject, direction, port.id, { ...port, name: event.target.value })} />
                <select aria-label="端口类型" value={port.type} onChange={(event) => editPortSchema(contextualSubject, direction, port.id, { ...port, type: event.target.value as typeof port.type })}><option value="any">any</option><option value="string">string</option><option value="number">number</option><option value="boolean">boolean</option><option value="object">object</option><option value="array">array</option></select>
                <select aria-label="端口通道" value={port.channel ?? "data"} onChange={(event) => editPortSchema(contextualSubject, direction, port.id, { ...port, channel: event.target.value as "data" | "event" })}><option value="data">data</option><option value="event">event</option></select>
                <button disabled={index === 0} onClick={() => movePortSchema(contextualSubject, direction, index, -1)}>↑</button>
                <button disabled={index === contextualSubject[direction].length - 1} onClick={() => movePortSchema(contextualSubject, direction, index, 1)}>↓</button>
                <button className="danger" onClick={() => editPortSchema(contextualSubject, direction, port.id, null)}>×</button>
              </div>
            ))}
          </section>
        ))}
        <div className="property-actions"><button onClick={() => contextAddress ? duplicateBusinessNode(contextualSubject.id, contextAddress.panelId) : dispatchRuntimeEvent("DUPLICATE_NODE", "properties")} disabled={contextualSubject.id === contextualBusinessRoot.id}>创建副本</button><button onClick={() => createLinkedBusinessNode(contextualSubject.id, contextAddress?.panelId)} disabled={contextualSubject.id === contextualBusinessRoot.id}>创建链接实例</button><button className="danger" onClick={() => contextAddress ? deleteBusinessNode(contextualSubject.id, contextAddress.panelId) : dispatchRuntimeEvent("DELETE_NODE", "properties")} disabled={contextualSubject.id === contextualBusinessRoot.id}>删除</button></div>
      </div>
    );
  }
  // 运行追踪面板：运行状态、根输入编辑、逐节点轨迹（输出/错误/耗时）
  if (key === "run-trace") {
    return (
      <div className="trace-surface">
        <div className="run-state"><i className={runState} /><span><small>本地确定性执行</small><strong>{runState === "idle" ? "尚未运行" : runState === "running" ? "运行中" : runState === "success" ? "执行成功" : "执行失败"}</strong></span><button onClick={() => dispatchRuntimeEvent("RUN_REQUEST", "run_trace")} disabled={runState === "running"}>重新运行</button></div>
        <div className="run-input-grid">{businessRoot.inputs.map((port) => {
          const structured = port.type === "object" || port.type === "array";
          const rawValue = rootInput[port.id];
          const textValue = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue) ?? "";
          return (
            <label key={port.id}>
              <span>{port.name}<small>{port.type}</small></span>
              {structured ? (
                <textarea rows={2} placeholder='JSON，例如 ["角色A","角色B"]' value={textValue} onChange={(event) => setRootInput((value) => ({ ...value, [port.id]: event.target.value }))} />
              ) : (
                <input value={textValue} onChange={(event) => setRootInput((value) => ({ ...value, [port.id]: event.target.value }))} />
              )}
            </label>
          );
        })}</div>
        <div className="trace-list">{trace.length ? trace.map((item, index) => <div className={`trace-row ${item.status}`} key={`${item.id}-${item.path}`}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{item.name}</strong><small>{item.path}</small>{item.output !== undefined && <code>输出 {JSON.stringify(item.output)?.slice(0, 220)}</code>}{item.error && <code>错误 {item.error}</code>}</span><i>{item.status}{item.duration ? ` · ${item.duration}ms` : ""}</i></div>) : <div className="surface-empty">运行后显示每层输入、输出与耗时</div>}</div>
      </div>
    );
  }
  // 兜底：未匹配到内置 key 的节点交给注册表中的自定义渲染器；
  // 缩放低于 LOD 阈值时传 summary=true 让渲染器降级为摘要形态。
  const Renderer = resolveRenderer(node);
  return <Renderer node={node} document={documentState} scale={camera.scale} active={scopeNode.id === node.id} selected={selectedAppNodeId === node.id} summary={camera.scale < PROJECTION_LOD_THRESHOLD} emit={emit} />;
};
