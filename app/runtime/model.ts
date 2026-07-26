export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ValueType =
  | "number"
  | "string"
  | "boolean"
  | "object"
  | "array"
  | "any";

export type Expression =
  | { kind: "const"; value: JsonValue }
  | { kind: "ref"; nodeId?: string; portId: string; env?: boolean }
  | { kind: "op"; op: string; args: Expression[] };

export type PortChannel = "data" | "event";

export type IntentPort = {
  id: string;
  name: string;
  type: ValueType;
  channel?: PortChannel;
  binding?: Expression;
  mapping?: Expression;
};

export type NodeKind =
  | "composite"
  | "operator"
  | "linkedModule"
  | "loader"
  | "renderer"
  | "state"
  | "action";

export type NodeImplementation = {
  key: string;
  config?: Record<string, JsonValue>;
  core?: boolean;
  visual?: boolean;
};

export type CameraState = {
  scale: number;
  x: number;
  y: number;
};

export type NormalizedFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NodeDisplayMode = "expanded" | "minimized";

export type IntentNode = {
  id: string;
  name: string;
  description: string;
  kind: NodeKind;
  operator?: string;
  inputs: IntentPort[];
  outputs: IntentPort[];
  children?: IntentNode[];
  position: { x: number; y: number };
  size?: { width: number; height: number };
  canvasSize?: { width: number; height: number };
  canvasContentOffset?: { x: number; y: number };
  resizeMode?: "simple" | "full";
  displayMode?: NodeDisplayMode;
  moduleRef?: { moduleId: string; version: number };
  implementation?: NodeImplementation;
};

export type PublishedModule = {
  moduleId: string;
  name: string;
  version: number;
  publishedAt: string;
  snapshot: IntentNode;
};

export type IntentDocumentV1 = {
  version: 1;
  rootIntent: IntentNode;
  publishedModules: PublishedModule[];
};

export type IntentDocumentV2 = {
  version: 2;
  rootIntent: IntentNode;
  businessRootId: string;
  publishedModules: PublishedModule[];
  viewState: {
    layoutLocked: boolean;
    cameras: Record<string, CameraState>;
  };
};

export type SurfaceContextSource =
  | { mode: "follow-active-container" }
  | { mode: "fixed-container"; surfaceId: string };

export type SurfaceSubject =
  | { mode: "follow-panel-selection" }
  | { mode: "fixed-node"; nodeId: string };

export type NodeProjectionFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NodeProjectionLayout = {
  frame: NodeProjectionFrame;
  displayMode: "expanded" | "minimized";
  resizeMode: "simple" | "full";
};

export type ScopeProjectionState = {
  camera: CameraState;
  nodeLayouts: Record<string, NodeProjectionLayout>;
};

export type SurfaceViewport = {
  camera: CameraState;
  fitMode: "auto" | "manual";
};

export type FeaturePanelSurface = {
  kind: "feature-panel";
  id: string;
  featureNodeId: string;
  title: string;
  frame: NormalizedFrame;
  zIndex: number;
  viewport: SurfaceViewport;
  contextSource: SurfaceContextSource;
  subject: SurfaceSubject;
  localState: Record<string, JsonValue>;
};

export type ContainerSurface = {
  kind: "current-container";
  id: string;
  title: string;
  frame: NormalizedFrame;
  zIndex: number;
  scope: ScopeAddress;
  navigationStack: ScopeAddress[];
  projections: Record<string, ScopeProjectionState>;
  nodeLayoutLocked: boolean;
  localState: Record<string, JsonValue>;
};

export type SurfaceInstance = FeaturePanelSurface | ContainerSurface;

export type SurfaceTemplate = SurfaceInstance;

export type ViewDefinition = {
  id: string;
  name: string;
  kind: "free-layout" | "workbench";
  layoutLocked: boolean;
  surfaceTemplates: SurfaceTemplate[];
};

export type PanelSelection = {
  nodeIds: string[];
  primaryNodeId?: string;
  revision: number;
};

export type PanelInstance = {
  id: string;
  title: string;
  viewId: string;
  frame: NormalizedFrame;
  zIndex: number;
  layoutLocked: boolean;
  activeContainerSurfaceId?: string;
  selection: PanelSelection;
  surfaces: SurfaceInstance[];
};

export type WorkspaceState = {
  activePanelId: string;
  panels: PanelInstance[];
};

export const CORE_WORKSPACE_PANEL_IDS = [
  "panel-workbench",
  "panel-free-layout",
] as const;

export const isCoreWorkspacePanel = (panelId: string): boolean =>
  CORE_WORKSPACE_PANEL_IDS.some((id) => id === panelId);

export const removeWorkspacePanel = (
  workspace: WorkspaceState,
  panelId: string,
): WorkspaceState => {
  if (isCoreWorkspacePanel(panelId)) return workspace;
  const removed = workspace.panels.find((panel) => panel.id === panelId);
  if (!removed) return workspace;
  const panels = workspace.panels.filter((panel) => panel.id !== panelId);
  const fallback =
    panels
      .filter((panel) => panel.viewId === removed.viewId)
      .toSorted((left, right) => right.zIndex - left.zIndex)[0] ??
    panels.toSorted((left, right) => right.zIndex - left.zIndex)[0];
  return {
    ...workspace,
    activePanelId:
      workspace.activePanelId === panelId
        ? fallback?.id ?? ""
        : workspace.activePanelId,
    panels,
  };
};

export type IntentDocumentV3 = {
  version: 3;
  rootIntent: IntentNode;
  businessRootId: string;
  publishedModules: PublishedModule[];
  views: ViewDefinition[];
  workspaceState: WorkspaceState;
};

export type IntentDocument = IntentDocumentV3;

export const ACTIVE_BUSINESS_SCOPE_REF_ID = "active_business_scope_ref";

export type ScopeAddress =
  | { domain: "app"; nodeId: string }
  | {
      domain: "business";
      nodeId: string;
      viaReferenceId: typeof ACTIVE_BUSINESS_SCOPE_REF_ID;
    };

export const scopeCameraKey = (
  address: Pick<ScopeAddress, "domain" | "nodeId">,
) => `${address.domain}:${address.nodeId}`;

export const appScopeAddress = (nodeId: string): ScopeAddress => ({
  domain: "app",
  nodeId,
});

export const businessScopeAddress = (nodeId: string): ScopeAddress => ({
  domain: "business",
  nodeId,
  viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
});

export const parentScopeStack = (
  stack: readonly ScopeAddress[],
): ScopeAddress[] =>
  stack.length > 1 ? stack.slice(0, -1) : [...stack];

const ref = (nodeId: string, portId: string): Expression => ({
  kind: "ref",
  nodeId,
  portId,
});

const port = (
  id: string,
  name: string,
  type: ValueType,
  channel: PortChannel = "data",
  binding?: Expression,
): IntentPort => ({ id, name, type, channel, binding });

const businessScopeReferenceNode = (): IntentNode => ({
  id: ACTIVE_BUSINESS_SCOPE_REF_ID,
  name: "当前业务容器",
  description: "引用应用状态中的当前业务作用域；进入后解引用为真实业务意图。",
  kind: "renderer",
  inputs: [
    port(
      "document",
      "业务文档",
      "object",
      "data",
      { kind: "ref", portId: "document", env: true },
    ),
    port(
      "scope",
      "作用域引用",
      "string",
      "data",
      { kind: "ref", portId: "scope", env: true },
    ),
    port(
      "selection",
      "当前选择",
      "string",
      "data",
      { kind: "ref", portId: "selection", env: true },
    ),
  ],
  outputs: [
    port("selection", "选择变更", "object", "event"),
    port("navigate", "层级导航", "object", "event"),
    port("edit", "文档编辑", "object", "event"),
  ],
  position: { x: 150, y: 150 },
  size: { width: 600, height: 330 },
  resizeMode: "simple",
  displayMode: "expanded",
  implementation: {
    key: "business-scope-reference",
    core: true,
    visual: true,
    config: {
      target: "active-business-scope",
      lod: "always-live",
    },
  },
});

const wireCurrentContainerReference = (node: IntentNode): IntentNode => {
  const reference =
    node.children?.find(
      (child) => child.id === ACTIVE_BUSINESS_SCOPE_REF_ID,
    ) ?? businessScopeReferenceNode();
  return {
    ...node,
    children: [
      reference,
      ...(node.children ?? []).filter(
        (child) => child.id !== ACTIVE_BUSINESS_SCOPE_REF_ID,
      ),
    ],
    outputs: node.outputs.map((output) => ({
      ...output,
      mapping: {
        kind: "ref",
        nodeId: ACTIVE_BUSINESS_SCOPE_REF_ID,
        portId: output.id,
      },
    })),
    canvasSize: node.canvasSize ?? { width: 900, height: 560 },
  };
};

type AppNodeDefinition = {
  id: string;
  name: string;
  description: string;
  kind: "loader" | "renderer" | "state" | "action";
  key: string;
  lane: "runtime" | "interface" | "output";
  position: { x: number; y: number };
  size: { width: number; height: number };
  inputs: IntentPort[];
  outputs: IntentPort[];
};

const appNodeDefinitions = (): AppNodeDefinition[] => [
  {
    id: "document_loader",
    name: "文档加载器",
    description: "加载、迁移并校验业务意图文档。",
    kind: "loader",
    key: "intent-document-loader",
    lane: "runtime",
    position: { x: 90, y: 120 },
    size: { width: 290, height: 220 },
    inputs: [
      port("file", "文档文件", "object"),
      port("import_event", "导入", "object", "event"),
    ],
    outputs: [
      port("document", "业务文档", "object"),
      port("modules", "模块快照", "array"),
      port("loaded", "加载完成", "object", "event"),
    ],
  },
  {
    id: "app_state",
    name: "应用状态",
    description: "保存当前作用域、选择、校验和布局状态。",
    kind: "state",
    key: "application-state",
    lane: "runtime",
    position: { x: 90, y: 390 },
    size: { width: 290, height: 230 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("command", "状态命令", "object", "event", ref("command_processor", "command")),
    ],
    outputs: [
      port("scope", "当前作用域", "string"),
      port("selection", "当前选择", "string"),
      port("snapshot", "状态快照", "object"),
      port("changed", "状态变更", "object", "event"),
    ],
  },
  {
    id: "event_clock",
    name: "事件时钟",
    description: "按离散事务批次调度界面事件。",
    kind: "action",
    key: "event-clock",
    lane: "runtime",
    position: { x: 90, y: 680 },
    size: { width: 290, height: 190 },
    inputs: [port("events", "事件队列", "array", "event")],
    outputs: [port("tick", "事务批次", "object", "event")],
  },
  {
    id: "command_processor",
    name: "命令处理器",
    description: "将界面事件转换为确定性的状态命令。",
    kind: "action",
    key: "command-processor",
    lane: "runtime",
    position: { x: 90, y: 930 },
    size: { width: 290, height: 210 },
    inputs: [port("tick", "事件批次", "object", "event", ref("event_clock", "tick"))],
    outputs: [port("command", "状态命令", "object", "event")],
  },
  {
    id: "intent_executor",
    name: "意图执行器",
    description: "执行当前业务根意图并产生分层追踪。",
    kind: "action",
    key: "intent-executor",
    lane: "runtime",
    position: { x: 90, y: 1200 },
    size: { width: 290, height: 220 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("run", "运行请求", "object", "event", ref("global_toolbar", "run")),
    ],
    outputs: [
      port("result", "执行结果", "object"),
      port("trace", "运行追踪", "array"),
      port("completed", "运行完成", "object", "event"),
    ],
  },
  {
    id: "global_toolbar",
    name: "顶栏与全局命令",
    description: "品牌、新建、导入导出、撤销重做与运行控制。",
    kind: "renderer",
    key: "global-toolbar",
    lane: "interface",
    position: { x: 540, y: 70 },
    size: { width: 920, height: 170 },
    inputs: [port("state", "应用状态", "object", "data", ref("app_state", "snapshot"))],
    outputs: [
      port("command", "界面命令", "object", "event"),
      port("run", "运行请求", "object", "event"),
    ],
  },
  {
    id: "intent_tree",
    name: "意图结构树",
    description: "浏览和搜索完整业务意图层级。",
    kind: "renderer",
    key: "intent-tree",
    lane: "interface",
    position: { x: 500, y: 330 },
    size: { width: 340, height: 410 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("scope", "当前作用域", "string", "data", ref("app_state", "scope")),
    ],
    outputs: [port("navigate", "导航请求", "object", "event")],
  },
  {
    id: "module_library",
    name: "模块库",
    description: "浏览已发布模块并插入链接实例。",
    kind: "renderer",
    key: "module-library",
    lane: "interface",
    position: { x: 500, y: 790 },
    size: { width: 340, height: 280 },
    inputs: [port("modules", "模块快照", "array", "data", ref("document_loader", "modules"))],
    outputs: [port("insert", "插入模块", "object", "event")],
  },
  {
    id: "validation",
    name: "静态校验",
    description: "显示作用域、端口、类型和依赖校验结果。",
    kind: "renderer",
    key: "validation",
    lane: "interface",
    position: { x: 500, y: 1120 },
    size: { width: 340, height: 220 },
    inputs: [port("document", "业务文档", "object", "data", ref("document_loader", "document"))],
    outputs: [port("issues", "校验问题", "array")],
  },
  {
    id: "breadcrumb",
    name: "面包屑导航",
    description: "显示当前作用域路径并支持逐层跳转。",
    kind: "renderer",
    key: "breadcrumb",
    lane: "interface",
    position: { x: 950, y: 300 },
    size: { width: 760, height: 130 },
    inputs: [port("scope", "当前作用域", "string", "data", ref("app_state", "scope"))],
    outputs: [port("navigate", "导航请求", "object", "event")],
  },
  {
    id: "scope_toolbar",
    name: "当前作用域工具条",
    description: "显示当前节点概要和画布控制。",
    kind: "renderer",
    key: "scope-toolbar",
    lane: "interface",
    position: { x: 950, y: 470 },
    size: { width: 760, height: 140 },
    inputs: [
      port("scope", "当前作用域", "string", "data", ref("app_state", "scope")),
      port("state", "应用状态", "object", "data", ref("app_state", "snapshot")),
    ],
    outputs: [port("command", "画布命令", "object", "event")],
  },
  {
    id: "current_container",
    name: "当前容器渲染器",
    description: "通过稳定作用域引用投影业务意图及直属子节点。",
    kind: "renderer",
    key: "current-container",
    lane: "interface",
    position: { x: 950, y: 650 },
    size: { width: 760, height: 500 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("scope", "作用域引用", "string", "data", ref("app_state", "scope")),
      port("selection", "当前选择", "string", "data", ref("app_state", "selection")),
    ],
    outputs: [
      port("selection", "选择变更", "object", "event"),
      port("navigate", "层级导航", "object", "event"),
      port("edit", "文档编辑", "object", "event"),
    ],
  },
  {
    id: "canvas_status",
    name: "画布状态",
    description: "显示管道图例、连线数量和交互提示。",
    kind: "renderer",
    key: "canvas-status",
    lane: "interface",
    position: { x: 950, y: 1200 },
    size: { width: 760, height: 120 },
    inputs: [
      port("state", "应用状态", "object", "data", ref("app_state", "snapshot")),
      port("issues", "校验问题", "array", "data", ref("validation", "issues")),
    ],
    outputs: [],
  },
  {
    id: "properties",
    name: "属性编辑器",
    description: "编辑节点名称、描述、算子、绑定和接口。",
    kind: "renderer",
    key: "properties",
    lane: "output",
    position: { x: 1860, y: 250 },
    size: { width: 420, height: 500 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("selection", "当前选择", "string", "data", ref("app_state", "selection")),
    ],
    outputs: [port("edit", "文档编辑", "object", "event")],
  },
  {
    id: "run_trace",
    name: "运行追踪",
    description: "填写根输入并查看分层执行结果。",
    kind: "renderer",
    key: "run-trace",
    lane: "output",
    position: { x: 1860, y: 820 },
    size: { width: 420, height: 520 },
    inputs: [
      port("document", "业务文档", "object", "data", ref("document_loader", "document")),
      port("trace", "执行追踪", "array", "data", ref("intent_executor", "trace")),
      port("result", "执行结果", "object", "data", ref("intent_executor", "result")),
    ],
    outputs: [port("run", "运行请求", "object", "event")],
  },
];

const cloneWithoutEdges = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(cloneWithoutEdges) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "edges")
        .map(([key, child]) => [key, cloneWithoutEdges(child)]),
    ) as T;
  }
  return value;
};

const findNode = (node: IntentNode, id: string): IntentNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return undefined;
};

export const defaultNodeDisplayMode = (
  node: Pick<IntentNode, "id" | "implementation">,
): NodeDisplayMode =>
  node.id === "application_root" ||
  node.id === "current_container" ||
  node.implementation?.key === "current-container"
    ? "expanded"
    : "minimized";

export const nodeDisplayMode = (
  node: Pick<IntentNode, "id" | "implementation" | "displayMode">,
): NodeDisplayMode => node.displayMode ?? defaultNodeDisplayMode(node);

const defaultContainerSurface = (
  id: string,
  title: string,
  frame: NormalizedFrame,
  businessRootId: string,
): ContainerSurface => ({
  kind: "current-container",
  id,
  title,
  frame,
  zIndex: 1,
  scope: {
    domain: "business",
    nodeId: businessRootId,
    viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
  },
  navigationStack: [
    {
      domain: "business",
      nodeId: businessRootId,
      viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
    },
  ],
  projections: {
    [`business:${businessRootId}`]: {
      camera: { scale: 0.55, x: 12, y: 12 },
      nodeLayouts: {},
    },
  },
  nodeLayoutLocked: false,
  localState: {
    portsExpanded: false,
  },
});

const defaultFeatureSurface = (
  id: string,
  title: string,
  featureNodeId: string,
  frame: NormalizedFrame,
): FeaturePanelSurface => ({
  kind: "feature-panel",
  id,
  title,
  featureNodeId,
  frame,
  zIndex: 2,
  viewport: {
    camera: { scale: 1, x: 0, y: 0 },
    fitMode: "auto",
  },
  contextSource: { mode: "follow-active-container" },
  subject: { mode: "follow-panel-selection" },
  localState: {},
});

export const createDefaultViews = (
  businessRootId: string,
): ViewDefinition[] => {
  const freeContainer = defaultContainerSurface(
    "free-layout-container",
    "自由布局",
    { x: 0, y: 0, width: 1, height: 1 },
    businessRootId,
  );
  const workbenchContainer = defaultContainerSurface(
    "workbench-container",
    "当前容器",
    { x: 0.245, y: 0.02, width: 0.5, height: 0.96 },
    businessRootId,
  );
  return [
    {
      id: "view-free-layout",
      name: "自由布局",
      kind: "free-layout",
      layoutLocked: false,
      surfaceTemplates: [freeContainer],
    },
    {
      id: "view-workbench",
      name: "工作台",
      kind: "workbench",
      layoutLocked: true,
      surfaceTemplates: [
        workbenchContainer,
        defaultFeatureSurface(
          "workbench-tree",
          "节点树",
          "intent_tree",
          { x: 0.01, y: 0.02, width: 0.225, height: 0.96 },
        ),
        defaultFeatureSurface(
          "workbench-properties",
          "属性检视器",
          "properties",
          { x: 0.755, y: 0.02, width: 0.235, height: 0.96 },
        ),
      ],
    },
  ];
};

const cloneSurface = <T extends SurfaceInstance>(surface: T): T =>
  cloneWithoutEdges(surface);

export const createDefaultWorkspaceState = (
  views: ViewDefinition[],
  businessRootId: string,
): WorkspaceState => {
  const freeView = views.find((view) => view.id === "view-free-layout")!;
  const workbenchView = views.find((view) => view.id === "view-workbench")!;
  return {
    activePanelId: "panel-workbench",
    panels: [
      {
        id: "panel-workbench",
        title: "工作台",
        viewId: workbenchView.id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
        zIndex: 2,
        layoutLocked: true,
        activeContainerSurfaceId: "workbench-container",
        selection: {
          nodeIds: ["scenario_flow"],
          primaryNodeId: "scenario_flow",
          revision: 0,
        },
        surfaces: workbenchView.surfaceTemplates.map(cloneSurface),
      },
      {
        id: "panel-free-layout",
        title: "自由布局",
        viewId: freeView.id,
        frame: { x: 0.51, y: 0.02, width: 0.48, height: 0.96 },
        zIndex: 1,
        layoutLocked: false,
        activeContainerSurfaceId: "free-layout-container",
        selection: {
          nodeIds: ["scenario_flow"],
          primaryNodeId: "scenario_flow",
          revision: 0,
        },
        surfaces: freeView.surfaceTemplates.map(cloneSurface),
      },
    ],
  };
};

export const createApplicationDocument = (
  businessRoot: IntentNode,
  publishedModules: PublishedModule[] = [],
): IntentDocumentV3 => {
  const safeBusinessRoot = cloneWithoutEdges(businessRoot);
  const children = appNodeDefinitions().map((definition) => {
    const node: IntentNode = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      kind: definition.kind,
      inputs: definition.inputs,
      outputs: definition.outputs,
      children:
        definition.id === "document_loader" ? [safeBusinessRoot] : undefined,
      position: definition.position,
      size: definition.size,
      resizeMode: "simple",
      displayMode: ["current_container", "global_toolbar", "intent_tree"].includes(
        definition.id,
      )
        ? "expanded"
        : "minimized",
      implementation: {
        key: definition.key,
        core: true,
        visual: true,
        config: {
          lane: definition.lane,
          ...(definition.id === "scope_toolbar"
            ? { lod: "always-live" }
            : {}),
        },
      },
    };
    return definition.id === "current_container"
      ? wireCurrentContainerReference(node)
      : node;
  });

  const views = createDefaultViews(safeBusinessRoot.id);
  return {
    version: 3,
    rootIntent: {
      id: "application_root",
      name: "Intent Map 应用根",
      description: "加载、编排并渲染全部界面与业务意图管道。",
      kind: "composite",
      inputs: [
        port("viewport", "浏览器视口", "object"),
        port("user_event", "用户事件", "object", "event"),
      ],
      outputs: [
        port("application_state", "应用状态", "object", "data", ref("app_state", "snapshot")),
        port("execution_result", "执行结果", "object", "data", ref("intent_executor", "result")),
      ],
      children,
      position: { x: 0, y: 0 },
      canvasSize: { width: 2400, height: 1500 },
      resizeMode: "simple",
      displayMode: "expanded",
      implementation: {
        key: "application-root",
        core: true,
        visual: true,
      },
    },
    businessRootId: safeBusinessRoot.id,
    publishedModules: cloneWithoutEdges(publishedModules),
    views,
    workspaceState: createDefaultWorkspaceState(views, safeBusinessRoot.id),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCameraState = (value: unknown): value is CameraState =>
  isRecord(value) &&
  ["scale", "x", "y"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
  );

const normalizeScopeAddress = (
  value: unknown,
  root: IntentNode,
  businessRoot: IntentNode,
): ScopeAddress | undefined => {
  if (isRecord(value) && typeof value.nodeId === "string") {
    if (value.domain === "business" && findNode(businessRoot, value.nodeId)) {
      return businessScopeAddress(value.nodeId);
    }
    if (value.domain === "app" && findNode(root, value.nodeId)) {
      return appScopeAddress(value.nodeId);
    }
  }
  if (typeof value !== "string") return undefined;
  return findNode(businessRoot, value)
    ? businessScopeAddress(value)
    : findNode(root, value)
      ? appScopeAddress(value)
      : undefined;
};

const normalizeSurfaceState = (
  rawSurface: unknown,
  root: IntentNode,
  businessRoot: IntentNode,
) => {
  if (!isRecord(rawSurface)) return;
  if (rawSurface.kind === "feature-panel") {
    if (!isRecord(rawSurface.viewport)) {
      rawSurface.viewport = {
        camera: { scale: 1, x: 0, y: 0 },
        fitMode: "auto",
      };
    }
    return;
  }
  if (rawSurface.kind !== "current-container") return;

  const scope =
    normalizeScopeAddress(rawSurface.scope, root, businessRoot) ??
    normalizeScopeAddress(rawSurface.scopeNodeId, root, businessRoot) ??
    businessScopeAddress(businessRoot.id);
  const rawStack = Array.isArray(rawSurface.navigationStack)
    ? rawSurface.navigationStack
    : [];
  const navigationStack = rawStack
    .map((item) => normalizeScopeAddress(item, root, businessRoot))
    .filter((item): item is ScopeAddress => Boolean(item));
  rawSurface.scope = scope;
  rawSurface.navigationStack = navigationStack.length
    ? navigationStack
    : [scope];

  const projections = isRecord(rawSurface.projections)
    ? rawSurface.projections
    : {};
  const legacyLocalState = isRecord(rawSurface.localState)
    ? rawSurface.localState
    : {};
  const legacyCameras = isRecord(legacyLocalState.cameras)
    ? legacyLocalState.cameras
    : {};
  for (const [key, camera] of Object.entries(legacyCameras)) {
    if (isCameraState(camera) && !isRecord(projections[key])) {
      projections[key] = { camera, nodeLayouts: {} };
    }
  }
  const activeKey = scopeCameraKey(scope);
  if (!isRecord(projections[activeKey])) {
    projections[activeKey] = {
      camera: isCameraState(rawSurface.camera)
        ? rawSurface.camera
        : { scale: 0.55, x: 12, y: 12 },
      nodeLayouts: {},
    };
  }
  rawSurface.projections = projections;
  const localState = { ...legacyLocalState };
  delete localState.cameras;
  rawSurface.localState = localState;
  delete rawSurface.scopeNodeId;
  delete rawSurface.camera;
};

const normalizeV3Document = (input: Record<string, unknown>) => {
  const normalized = cloneWithoutEdges(input) as unknown as Record<
    string,
    unknown
  >;
  if (
    !isRecord(normalized.rootIntent) ||
    typeof normalized.businessRootId !== "string"
  ) {
    return normalized;
  }
  const root = normalized.rootIntent as unknown as IntentNode;
  const businessRoot = findNode(root, normalized.businessRootId);
  if (!businessRoot) return normalized;
  if (Array.isArray(normalized.views)) {
    for (const view of normalized.views) {
      if (!isRecord(view) || !Array.isArray(view.surfaceTemplates)) continue;
      view.surfaceTemplates.forEach((surface) =>
        normalizeSurfaceState(surface, root, businessRoot),
      );
    }
  }
  if (
    isRecord(normalized.workspaceState) &&
    Array.isArray(normalized.workspaceState.panels)
  ) {
    for (const panel of normalized.workspaceState.panels) {
      if (!isRecord(panel) || !Array.isArray(panel.surfaces)) continue;
      panel.surfaces.forEach((surface) =>
        normalizeSurfaceState(surface, root, businessRoot),
      );
    }
  }
  return normalized;
};

const assertNodeShape: (
  value: unknown,
  path: string,
) => asserts value is IntentNode = (value, path) => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.inputs) ||
    !Array.isArray(value.outputs) ||
    !isRecord(value.position)
  ) {
    throw new Error(`${path}: 无效节点结构`);
  }
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) throw new Error(`${path}.children: 必须是数组`);
    value.children.forEach((child, index) =>
      assertNodeShape(child, `${path}.children[${index}]`),
    );
  }
};

const assertFrame = (value: unknown, path: string) => {
  if (
    !isRecord(value) ||
    !["x", "y", "width", "height"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) ||
    (value.width as number) <= 0 ||
    (value.height as number) <= 0 ||
    (value.x as number) < 0 ||
    (value.y as number) < 0 ||
    (value.x as number) + (value.width as number) > 1.000001 ||
    (value.y as number) + (value.height as number) > 1.000001
  ) {
    throw new Error(`${path}: 无效矩形视口`);
  }
};

const assertCamera = (value: unknown, path: string) => {
  if (
    !isRecord(value) ||
    typeof value.scale !== "number" ||
    !Number.isFinite(value.scale) ||
    value.scale <= 0 ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y)
  ) {
    throw new Error(`${path}: invalid camera`);
  }
};

const assertScopeAddressShape = (
  value: unknown,
  path: string,
  root: IntentNode,
) => {
  if (
    !isRecord(value) ||
    !["app", "business"].includes(String(value.domain)) ||
    typeof value.nodeId !== "string" ||
    !findNode(root, value.nodeId)
  ) {
    throw new Error(`${path}: invalid scope address`);
  }
  if (
    value.domain === "business" &&
    value.viaReferenceId !== ACTIVE_BUSINESS_SCOPE_REF_ID
  ) {
    throw new Error(`${path}: invalid business reference`);
  }
};

const assertProjectionFrame = (value: unknown, path: string) => {
  if (
    !isRecord(value) ||
    !["x", "y", "width", "height"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) ||
    (value.width as number) <= 0 ||
    (value.height as number) <= 0
  ) {
    throw new Error(`${path}: invalid node projection frame`);
  }
};

function assertSurface(
  value: unknown,
  path: string,
  root: IntentNode,
): asserts value is SurfaceInstance {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string"
  ) {
    throw new Error(`${path}: 无效 Surface`);
  }
  assertFrame(value.frame, `${path}.frame`);
  if (value.kind === "current-container") {
    if (
      !Array.isArray(value.navigationStack) ||
      !isRecord(value.projections)
    ) {
      throw new Error(`${path}: 无效当前容器 Surface`);
    }
    assertScopeAddressShape(value.scope, `${path}.scope`, root);
    value.navigationStack.forEach((scope, index) =>
      assertScopeAddressShape(
        scope,
        `${path}.navigationStack[${index}]`,
        root,
      ),
    );
    for (const [key, projection] of Object.entries(value.projections)) {
      if (!isRecord(projection) || !isRecord(projection.nodeLayouts)) {
        throw new Error(`${path}.projections.${key}: invalid projection`);
      }
      assertCamera(projection.camera, `${path}.projections.${key}.camera`);
      for (const [nodeId, layout] of Object.entries(
        projection.nodeLayouts,
      )) {
        if (
          !isRecord(layout) ||
          !["expanded", "minimized"].includes(String(layout.displayMode)) ||
          !["simple", "full"].includes(String(layout.resizeMode))
        ) {
          throw new Error(
            `${path}.projections.${key}.nodeLayouts.${nodeId}: invalid layout`,
          );
        }
        assertProjectionFrame(
          layout.frame,
          `${path}.projections.${key}.nodeLayouts.${nodeId}.frame`,
        );
      }
    }
    return;
  }
  if (value.kind === "feature-panel") {
    const feature = root.children?.find(
      (node) => node.id === String(value.featureNodeId),
    );
    if (
      !feature ||
      feature.kind !== "renderer" ||
      !isRecord(value.viewport) ||
      !["auto", "manual"].includes(String(value.viewport.fitMode)) ||
      !isRecord(value.contextSource) ||
      !isRecord(value.subject)
    ) {
      throw new Error(`${path}: 无效功能面板 Surface`);
    }
    assertCamera(value.viewport.camera, `${path}.viewport.camera`);
    return;
  }
  throw new Error(`${path}: 不支持的 Surface 类型`);
}

function assertViews(
  value: unknown,
  root: IntentNode,
): asserts value is ViewDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("views: 至少需要一个 View 定义");
  }
  const ids = new Set<string>();
  value.forEach((rawView, viewIndex) => {
    const path = `views[${viewIndex}]`;
    if (
      !isRecord(rawView) ||
      typeof rawView.id !== "string" ||
      typeof rawView.name !== "string" ||
      !["free-layout", "workbench"].includes(String(rawView.kind)) ||
      !Array.isArray(rawView.surfaceTemplates)
    ) {
      throw new Error(`${path}: 无效 View 定义`);
    }
    if (ids.has(rawView.id)) throw new Error(`${path}: View ID 重复`);
    ids.add(rawView.id);
    const surfaceIds = new Set<string>();
    rawView.surfaceTemplates.forEach((surface, surfaceIndex) => {
      assertSurface(surface, `${path}.surfaceTemplates[${surfaceIndex}]`, root);
      if (surfaceIds.has(surface.id)) {
        throw new Error(`${path}: Surface 模板 ID 重复`);
      }
      surfaceIds.add(surface.id);
    });
  });
}

function assertWorkspace(
  value: unknown,
  views: ViewDefinition[],
  root: IntentNode,
): asserts value is WorkspaceState {
  if (
    !isRecord(value) ||
    typeof value.activePanelId !== "string" ||
    !Array.isArray(value.panels)
  ) {
    throw new Error("workspaceState: 无效工作区");
  }
  const viewIds = new Set(views.map((view) => view.id));
  const surfaceOwners = new Map<string, string>();
  for (const rawPanel of value.panels) {
    if (!isRecord(rawPanel) || !Array.isArray(rawPanel.surfaces)) continue;
    for (const rawSurface of rawPanel.surfaces) {
      if (isRecord(rawSurface) && typeof rawSurface.id === "string") {
        surfaceOwners.set(rawSurface.id, String(rawPanel.id));
      }
    }
  }
  const panelIds = new Set<string>();
  for (const [panelIndex, rawPanel] of value.panels.entries()) {
    const path = `workspaceState.panels[${panelIndex}]`;
    if (
      !isRecord(rawPanel) ||
      typeof rawPanel.id !== "string" ||
      typeof rawPanel.viewId !== "string" ||
      !viewIds.has(rawPanel.viewId) ||
      !Array.isArray(rawPanel.surfaces) ||
      !isRecord(rawPanel.selection)
    ) {
      throw new Error(`${path}: 无效 Panel`);
    }
    if (panelIds.has(rawPanel.id)) throw new Error(`${path}: Panel ID 重复`);
    panelIds.add(rawPanel.id);
    assertFrame(rawPanel.frame, `${path}.frame`);
    rawPanel.surfaces.forEach((surface, index) =>
      assertSurface(surface, `${path}.surfaces[${index}]`, root),
    );
    if (
      rawPanel.activeContainerSurfaceId !== undefined &&
      !rawPanel.surfaces.some(
        (surface) =>
          (surface as SurfaceInstance).id ===
            rawPanel.activeContainerSurfaceId &&
          (surface as SurfaceInstance).kind === "current-container",
      )
    ) {
      throw new Error(`${path}: 活动上下文必须引用同 Panel 当前容器`);
    }
    for (const surface of rawPanel.surfaces as FeaturePanelSurface[]) {
      if (
        surface.kind === "feature-panel" &&
        surface.contextSource.mode === "fixed-container" &&
        surfaceOwners.has(surface.contextSource.surfaceId) &&
        surfaceOwners.get(surface.contextSource.surfaceId) !== rawPanel.id
      ) {
        throw new Error(`${path}: 固定来源不属于当前 Panel`);
      }
    }
  }
  if (value.panels.length && !panelIds.has(value.activePanelId)) {
    throw new Error("workspaceState.activePanelId: Panel 不存在");
  }
}

export const loadIntentDocument = (input: unknown): IntentDocumentV3 => {
  if (!isRecord(input)) throw new Error("文档必须是 JSON 对象");
  if (input.version !== 3) {
    throw new Error(
      `不支持的文档版本：${String(input.version)}；请导入 v3 工作区文档`,
    );
  }
  const normalized = normalizeV3Document(input);
  assertNodeShape(normalized.rootIntent, "rootIntent");
  if (
    typeof normalized.businessRootId !== "string" ||
    !findNode(normalized.rootIntent, normalized.businessRootId)
  ) {
    throw new Error(`业务根节点不存在：${String(input.businessRootId)}`);
  }
  assertViews(normalized.views, normalized.rootIntent);
  assertWorkspace(
    normalized.workspaceState,
    normalized.views,
    normalized.rootIntent,
  );
  const cloned = normalized as unknown as IntentDocumentV3;
  cloned.publishedModules ??= [];
  return cloned;
};

export const getPanel = (
  document: IntentDocumentV3,
  panelId: string,
): PanelInstance | undefined =>
  document.workspaceState.panels.find((panel) => panel.id === panelId);

export const getContainerSurface = (
  document: IntentDocumentV3,
  panelId: string,
  surfaceId?: string,
): ContainerSurface | undefined => {
  const panel = getPanel(document, panelId);
  const targetId = surfaceId ?? panel?.activeContainerSurfaceId;
  const surface = panel?.surfaces.find((candidate) => candidate.id === targetId);
  return surface?.kind === "current-container" ? surface : undefined;
};

export const updatePanel = (
  document: IntentDocumentV3,
  panelId: string,
  updater: (panel: PanelInstance) => PanelInstance,
): IntentDocumentV3 => ({
  ...document,
  workspaceState: {
    ...document.workspaceState,
    panels: document.workspaceState.panels.map((panel) =>
      panel.id === panelId ? updater(panel) : panel,
    ),
  },
});

export const updateSurface = (
  document: IntentDocumentV3,
  panelId: string,
  surfaceId: string,
  updater: (surface: SurfaceInstance) => SurfaceInstance,
): IntentDocumentV3 =>
  updatePanel(document, panelId, (panel) => ({
    ...panel,
    surfaces: panel.surfaces.map((surface) =>
      surface.id === surfaceId ? updater(surface) : surface,
    ),
  }));

export const removeSurface = (
  document: IntentDocumentV3,
  panelId: string,
  surfaceId: string,
): IntentDocumentV3 =>
  updatePanel(document, panelId, (panel) => {
    const surfaces = panel.surfaces.filter(
      (surface) => surface.id !== surfaceId,
    );
    return {
      ...panel,
      surfaces,
      activeContainerSurfaceId:
        panel.activeContainerSurfaceId === surfaceId
          ? surfaces.find((surface) => surface.kind === "current-container")?.id
          : panel.activeContainerSurfaceId,
    };
  });

export const removeNodeFromPanelSelections = (
  document: IntentDocumentV3,
  nodeId: string,
): IntentDocumentV3 => ({
  ...document,
  workspaceState: {
    ...document.workspaceState,
    panels: document.workspaceState.panels.map((panel) => {
      const nodeIds = panel.selection.nodeIds.filter((id) => id !== nodeId);
      const removedPrimary = panel.selection.primaryNodeId === nodeId;
      return {
        ...panel,
        selection: {
          nodeIds,
          primaryNodeId: removedPrimary
            ? nodeIds[0]
            : panel.selection.primaryNodeId,
          revision: removedPrimary
            ? panel.selection.revision + 1
            : panel.selection.revision,
        },
      };
    }),
  },
});

export const resolveFeatureContext = (
  document: IntentDocumentV3,
  panelId: string,
  surfaceId: string,
): {
  panel?: PanelInstance;
  feature?: FeaturePanelSurface;
  container?: ContainerSurface;
  subject?: IntentNode;
} => {
  const panel = getPanel(document, panelId);
  const candidate = panel?.surfaces.find((surface) => surface.id === surfaceId);
  const feature =
    candidate?.kind === "feature-panel" ? candidate : undefined;
  const sourceId =
    feature?.contextSource.mode === "fixed-container"
      ? feature.contextSource.surfaceId
      : panel?.activeContainerSurfaceId;
  const source = panel?.surfaces.find((surface) => surface.id === sourceId);
  const container =
    source?.kind === "current-container" ? source : undefined;
  const subjectId =
    feature?.subject.mode === "fixed-node"
      ? feature.subject.nodeId
      : panel?.selection.primaryNodeId;
  return {
    panel,
    feature,
    container,
    subject: subjectId ? findNode(document.rootIntent, subjectId) : undefined,
  };
};

const sortForExport = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortForExport);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== "edges")
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, sortForExport(value[key])]),
    );
  }
  return value;
};

export const serializeIntentDocument = (document: IntentDocument): string =>
  JSON.stringify(sortForExport(document), null, 2);

export const getBusinessRoot = (document: IntentDocumentV3): IntentNode => {
  const root = findNode(document.rootIntent, document.businessRootId);
  if (!root) throw new Error(`业务根节点不存在：${document.businessRootId}`);
  return root;
};

export const APPLICATION_NODE_IDS = appNodeDefinitions().map(({ id }) => id);
