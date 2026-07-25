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

export type IntentDocument = IntentDocumentV1 | IntentDocumentV2;

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
  position: { x: 250, y: 150 },
  size: { width: 520, height: 300 },
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
    canvasSize: node.canvasSize ?? { width: 1020, height: 680 },
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

export const createApplicationDocument = (
  businessRoot: IntentNode,
  publishedModules: PublishedModule[] = [],
): IntentDocumentV2 => {
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
      displayMode:
        definition.id === "current_container" ? "expanded" : "minimized",
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

  return {
    version: 2,
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
    viewState: {
      layoutLocked: false,
      cameras: {
        "app:application_root": { scale: 1, x: 0, y: 0 },
      },
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

export const loadIntentDocument = (input: unknown): IntentDocumentV2 => {
  if (!isRecord(input)) throw new Error("文档必须是 JSON 对象");
  if (input.version === 1) {
    assertNodeShape(input.rootIntent, "rootIntent");
    const modules = Array.isArray(input.publishedModules)
      ? (input.publishedModules as PublishedModule[])
      : [];
    return createApplicationDocument(input.rootIntent, modules);
  }
  if (input.version !== 2) throw new Error(`不支持的文档版本：${String(input.version)}`);
  assertNodeShape(input.rootIntent, "rootIntent");
  if (typeof input.businessRootId !== "string")
    throw new Error("businessRootId 缺失");
  if (!findNode(input.rootIntent, input.businessRootId))
    throw new Error(`业务根节点不存在：${input.businessRootId}`);
  const cloned = cloneWithoutEdges(input) as unknown as IntentDocumentV2;
  cloned.publishedModules ??= [];
  cloned.viewState ??= { layoutLocked: false, cameras: {} };
  cloned.viewState.cameras ??= {};
  const scopeToolbar = findNode(cloned.rootIntent, "scope_toolbar");
  if (scopeToolbar?.implementation?.key === "scope-toolbar") {
    scopeToolbar.implementation.config = {
      ...scopeToolbar.implementation.config,
      lod: "always-live",
    };
  }
  const currentContainer = findNode(cloned.rootIntent, "current_container");
  if (currentContainer?.implementation?.key === "current-container") {
    const wired = wireCurrentContainerReference(currentContainer);
    Object.assign(currentContainer, wired);
  }
  const businessRoot = findNode(cloned.rootIntent, cloned.businessRootId);
  const businessIds = new Set<string>();
  const collectBusinessIds = (node?: IntentNode) => {
    if (!node) return;
    businessIds.add(node.id);
    node.children?.forEach(collectBusinessIds);
  };
  collectBusinessIds(businessRoot);
  cloned.viewState.cameras = Object.fromEntries(
    Object.entries(cloned.viewState.cameras).map(([key, value]) => {
      if (key.startsWith("app:") || key.startsWith("business:")) {
        return [key, value];
      }
      return [
        `${businessIds.has(key) ? "business" : "app"}:${key}`,
        value,
      ];
    }),
  );
  return cloned;
};

export const exportCompatibleV1 = (
  document: IntentDocumentV2,
): IntentDocumentV1 => {
  const businessRoot = findNode(document.rootIntent, document.businessRootId);
  if (!businessRoot)
    throw new Error(`业务根节点不存在：${document.businessRootId}`);
  return {
    version: 1,
    rootIntent: cloneWithoutEdges(businessRoot),
    publishedModules: cloneWithoutEdges(document.publishedModules),
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

export const getBusinessRoot = (document: IntentDocumentV2): IntentNode => {
  const root = findNode(document.rootIntent, document.businessRootId);
  if (!root) throw new Error(`业务根节点不存在：${document.businessRootId}`);
  return root;
};

export const APPLICATION_NODE_IDS = appNodeDefinitions().map(({ id }) => id);
