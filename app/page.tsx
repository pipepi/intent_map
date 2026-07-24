"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  createApplicationDocument,
  exportCompatibleV1,
  getBusinessRoot,
  loadIntentDocument,
  nodeDisplayMode,
  serializeIntentDocument,
  type CameraState,
  type Expression,
  type IntentDocumentV2,
  type IntentNode,
  type JsonValue,
  type PublishedModule,
} from "./runtime/model";
import {
  MINIMIZED_NODE_SIZE,
  NodeRenderer,
  resizeDirectionsFor,
  runtimeNodeRenderSize,
  type ResizeDirection,
} from "./runtime/node-renderer";
import {
  resolveRenderer,
  type RuntimeCommand,
} from "./runtime/registry";
import {
  createRuntimeEvent,
  processEventBatch,
  type ApplicationRuntimeState,
  type PipelineTraceEntry,
  type RuntimeCommand as PipelineCommand,
  type RuntimeEvent,
} from "./runtime/pipeline";

type Trace = {
  id: string;
  name: string;
  path: string;
  status: "waiting" | "running" | "success" | "failed" | "skipped" | "cancelled";
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
};

type DerivedEdge = {
  id: string;
  sourceId: string;
  sourcePortId: string;
  targetId: string;
  targetPortId: string;
  channel: "data" | "event";
};

type AggregatedEdge = DerivedEdge & {
  count: number;
  members: DerivedEdge[];
};

const DEFAULT_CAMERA: CameraState = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const NODE_MIN_SIZE = { width: 220, height: 140 };
const NODE_MAX_SIZE = { width: 1200, height: 900 };
const ROOT_CANVAS_MIN_SIZE = { width: 640, height: 420 };
const ROOT_CANVAS_MAX_SIZE = { width: 8000, height: 6000 };
const ROOT_CANVAS_PADDING = 40;
const PORT_ROW = 26;
const PORT_TOP = 65;
const BUSINESS_PORT_TOP = 112;
const BUSINESS_PORT_ROW = 28;
const BUSINESS_PORT_HEIGHT = 24;
const BUSINESS_NODE_BORDER_WIDTH = 2;
const BUSINESS_PORT_DOT_OFFSET = 7;
const BUSINESS_NODE_BOTTOM_PADDING = 12;

const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const sampleBusinessRoot = (): IntentNode => {
  const steps = [
    {
      id: "scenario_flow",
      name: "核心物流动场景序列与约束",
      description: "识别核心业务流动场景、参与者、前后置条件、主序列、异常分支与约束。",
      position: { x: 190, y: 150 },
      inputs: [
        { id: "product_goal", name: "产品目标", type: "string" as const, binding: { kind: "ref" as const, portId: "product_goal", env: true } },
        { id: "constraints", name: "业务约束", type: "object" as const, binding: { kind: "ref" as const, portId: "business_constraints", env: true } },
      ],
      output: { id: "scenario_spec", name: "场景序列与约束", type: "object" as const },
      operator: "object",
    },
    {
      id: "ui_consensus",
      name: "场景匹配的 UI Demo 与流程共识",
      description: "基于业务场景形成可交互 UI Demo，使需求方与实现方确认业务处理流程。",
      position: { x: 450, y: 360 },
      inputs: [{ id: "scenario", name: "场景规格", type: "object" as const, binding: { kind: "ref" as const, nodeId: "scenario_flow", portId: "scenario_spec" } }],
      output: { id: "demo_consensus", name: "UI Demo 与流程共识", type: "object" as const },
      operator: "identity",
    },
    {
      id: "database_schema",
      name: "业务流程匹配的数据库表结构",
      description: "根据已确认的业务流程和约束抽象实体、关系、状态与审计字段。",
      position: { x: 710, y: 150 },
      inputs: [{ id: "consensus", name: "流程共识", type: "object" as const, binding: { kind: "ref" as const, nodeId: "ui_consensus", portId: "demo_consensus" } }],
      output: { id: "schema_model", name: "数据库表结构", type: "object" as const },
      operator: "object",
    },
    {
      id: "business_api",
      name: "基于表结构的业务逻辑与 UI API",
      description: "依据表结构实现确定性的业务处理逻辑，并输出 UI 所需 API 契约。",
      position: { x: 970, y: 360 },
      inputs: [{ id: "schema", name: "数据库结构", type: "object" as const, binding: { kind: "ref" as const, nodeId: "database_schema", portId: "schema_model" } }],
      output: { id: "api_contract", name: "业务逻辑与 UI API", type: "object" as const },
      operator: "identity",
    },
  ];

  const children = steps.map<IntentNode>((step, index) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    kind: index === 0 ? "composite" : "operator",
    operator: step.operator,
    inputs: step.inputs,
    outputs: [step.output],
    children:
      index === 0
        ? [
            {
              id: "scenario_participants",
              name: "参与者与触发条件",
              description: "明确参与角色、入口和前置条件。",
              kind: "composite",
              inputs: [],
              outputs: [{ id: "participants", name: "参与者模型", type: "object" }],
              children: [
                {
                  id: "scenario_actor_leaf",
                  name: "识别核心参与者",
                  description: "四层初始化叶子意图。",
                  kind: "operator",
                  operator: "object",
                  inputs: [],
                  outputs: [{ id: "actors", name: "参与者", type: "array" }],
                  position: { x: 280, y: 180 },
                },
              ],
              position: { x: 260, y: 170 },
            },
          ]
        : undefined,
    position: step.position,
    size: { width: 220, height: 150 },
    resizeMode: "simple",
  }));

  return {
    id: "business_root",
    name: "Agentic 软件开发框架",
    description: "从核心场景共识出发，依次形成 UI Demo、数据库表结构以及可供 UI 使用的业务 API。",
    kind: "composite",
    inputs: [
      { id: "product_goal", name: "产品目标", type: "string" },
      { id: "business_constraints", name: "业务约束", type: "object" },
      { id: "stakeholders", name: "协作角色", type: "array" },
    ],
    outputs: [
      {
        id: "delivery_blueprint",
        name: "可实施软件交付蓝图",
        type: "object",
        mapping: { kind: "ref", nodeId: "business_api", portId: "api_contract" },
      },
    ],
    children,
    position: { x: 0, y: 0 },
    canvasSize: { width: 1400, height: 850 },
    resizeMode: "simple",
  };
};

const sampleDocument = () => createApplicationDocument(sampleBusinessRoot());

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const findNode = (node: IntentNode, id: string): IntentNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
};

const findPath = (node: IntentNode, id: string, path: IntentNode[] = []): IntentNode[] | null => {
  const next = [...path, node];
  if (node.id === id) return next;
  for (const child of node.children ?? []) {
    const found = findPath(child, id, next);
    if (found) return found;
  }
  return null;
};

const updateNode = (
  node: IntentNode,
  id: string,
  updater: (target: IntentNode) => IntentNode,
): IntentNode => {
  if (node.id === id) return updater(node);
  return {
    ...node,
    children: node.children?.map((child) => updateNode(child, id, updater)),
  };
};

const removeNode = (node: IntentNode, id: string): IntentNode => ({
  ...node,
  children: node.children
    ?.filter((child) => child.id !== id)
    .map((child) => removeNode(child, id)),
});

const collectRefs = (expression?: Expression): Array<Extract<Expression, { kind: "ref" }>> => {
  if (!expression) return [];
  if (expression.kind === "ref") return [expression];
  if (expression.kind === "op") return expression.args.flatMap(collectRefs);
  return [];
};

const nodeSize = (node: IntentNode) => node.size ?? { width: 320, height: 220 };
const nodeResizeMode = (node: IntentNode) => node.resizeMode ?? "simple";
const businessNodeMinimumHeight = (node: IntentNode) => {
  const rows = Math.max(node.inputs.length, node.outputs.length);
  return Math.max(
    NODE_MIN_SIZE.height,
    rows > 0
      ? BUSINESS_PORT_TOP +
          BUSINESS_NODE_BORDER_WIDTH +
          rows * BUSINESS_PORT_ROW +
          BUSINESS_NODE_BOTTOM_PADDING
      : NODE_MIN_SIZE.height,
  );
};
const businessNodeSize = (node: IntentNode) => {
  const size = nodeSize(node);
  if (nodeDisplayMode(node) === "minimized") {
    return {
      width: Math.min(size.width, 220),
      height: 52,
    };
  }
  return {
    width: size.width,
    height: Math.max(size.height, businessNodeMinimumHeight(node)),
  };
};

const deriveEdges = (scope: IntentNode): DerivedEdge[] =>
  (scope.children ?? []).flatMap((target) =>
    target.inputs.flatMap((input) =>
      collectRefs(input.binding)
        .filter((reference) => reference.nodeId)
        .map((reference, index) => ({
          id: `${reference.nodeId}:${reference.portId}>${target.id}:${input.id}:${index}`,
          sourceId: reference.nodeId!,
          sourcePortId: reference.portId,
          targetId: target.id,
          targetPortId: input.id,
          channel: input.channel ?? "data",
        })),
    ),
  );

const aggregateEdges = (edges: DerivedEdge[]): AggregatedEdge[] => {
  const groups = new Map<string, DerivedEdge[]>();
  for (const edge of edges) {
    const key = `${edge.sourceId}>${edge.targetId}:${edge.channel}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  return [...groups.entries()].map(([id, members]) => ({
    ...members[0],
    id,
    count: members.length,
    members,
  }));
};

const detectCycle = (scope: IntentNode): string[] | null => {
  const dataEdges = deriveEdges(scope).filter((edge) => edge.channel === "data");
  const graph = new Map<string, string[]>();
  (scope.children ?? []).forEach((child) => graph.set(child.id, []));
  dataEdges.forEach((edge) => graph.get(edge.targetId)?.push(edge.sourceId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    if (visiting.has(id)) return [...path, id];
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      const found = walk(dependency, [...path, id]);
      if (found) return found;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of graph.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
};

const evaluateExpression = (
  expression: Expression | undefined,
  environment: Record<string, unknown>,
  outputs: Map<string, Record<string, unknown>>,
): unknown => {
  if (!expression) return undefined;
  if (expression.kind === "const") return expression.value;
  if (expression.kind === "ref") {
    if (expression.env) return environment[expression.portId];
    return expression.nodeId ? outputs.get(expression.nodeId)?.[expression.portId] : undefined;
  }
  const values = expression.args.map((argument) =>
    evaluateExpression(argument, environment, outputs),
  );
  if (expression.op === "concat") return values.join("");
  if (expression.op === "add") return values.reduce<number>((sum, value) => sum + Number(value), 0);
  if (expression.op === "and") return values.every(Boolean);
  if (expression.op === "or") return values.some(Boolean);
  if (expression.op === "array") return values;
  return values[0];
};

const executeBusinessNode = async (
  node: IntentNode,
  inputs: Record<string, unknown>,
  path: string,
  onTrace: (trace: Trace) => void,
  cancelled: () => boolean,
): Promise<Record<string, unknown>> => {
  if (cancelled()) throw new Error("cancelled");
  const started = performance.now();
  onTrace({ id: node.id, name: node.name, path, status: "running" });
  try {
    if (!node.children?.length) {
      let value: unknown = Object.values(inputs)[0];
      if (node.operator === "object") value = { ...inputs };
      if (node.operator === "array") value = Object.values(inputs);
      if (node.operator === "concat") value = Object.values(inputs).join("");
      const result = Object.fromEntries(
        node.outputs.map((output, index) => [
          output.id,
          index === 0 ? value : undefined,
        ]),
      );
      onTrace({
        id: node.id,
        name: node.name,
        path,
        status: "success",
        duration: Math.round(performance.now() - started),
        output: result,
      });
      return result;
    }
    const cycle = detectCycle(node);
    if (cycle) throw new Error(`循环依赖：${cycle.join(" → ")}`);
    const outputs = new Map<string, Record<string, unknown>>();
    const pending = new Set(node.children.map((child) => child.id));
    while (pending.size) {
      if (cancelled()) throw new Error("cancelled");
      const ready = node.children.filter(
        (child) =>
          pending.has(child.id) &&
          child.inputs.every((input) =>
            collectRefs(input.binding).every(
              (reference) => reference.env || !reference.nodeId || outputs.has(reference.nodeId),
            ),
          ),
      );
      if (!ready.length) throw new Error(`作用域 ${path} 中存在无法解析的依赖`);
      const resolved = await Promise.all(
        ready.map(async (child) => {
          const childInputs = Object.fromEntries(
            child.inputs.map((input) => [
              input.id,
              evaluateExpression(input.binding, inputs, outputs),
            ]),
          );
          return [
            child.id,
            await executeBusinessNode(
              child,
              childInputs,
              `${path} / ${child.name}`,
              onTrace,
              cancelled,
            ),
          ] as const;
        }),
      );
      resolved.forEach(([id, result]) => {
        outputs.set(id, result);
        pending.delete(id);
      });
    }
    const result = Object.fromEntries(
      node.outputs.map((output) => [
        output.id,
        evaluateExpression(output.mapping, inputs, outputs),
      ]),
    );
    onTrace({
      id: node.id,
      name: node.name,
      path,
      status: "success",
      duration: Math.round(performance.now() - started),
      output: result,
    });
    return result;
  } catch (error) {
    onTrace({
      id: node.id,
      name: node.name,
      path,
      status: error instanceof Error && error.message === "cancelled" ? "cancelled" : "failed",
      duration: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const downloadJson = (name: string, value: unknown) => {
  const blob = new Blob([serializeIntentDocument(value as IntentDocumentV2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

export default function Home() {
  const [documentState, setDocumentState] = useState<IntentDocumentV2>(() => sampleDocument());
  const [history, setHistory] = useState<IntentDocumentV2[]>([]);
  const [future, setFuture] = useState<IntentDocumentV2[]>([]);
  const [scopePath, setScopePath] = useState<string[]>(["application_root"]);
  const [selectedAppNodeId, setSelectedAppNodeId] = useState("current_container");
  const [camera, setCamera] = useState<CameraState>({ scale: 0.5, x: 12, y: 12 });
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [runState, setRunState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [trace, setTrace] = useState<Trace[]>([]);
  const [runtimeState, setRuntimeState] = useState<ApplicationRuntimeState>({
    scopeId: "business_root",
    selectionId: "scenario_flow",
    layoutLocked: false,
    documentRevision: 0,
    lastEventType: "BOOT",
  });
  const [pendingEvents, setPendingEvents] = useState<RuntimeEvent[]>([]);
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceEntry[]>([]);
  const [lastCommands, setLastCommands] = useState<PipelineCommand[]>([]);
  const [eventTick, setEventTick] = useState(0);
  const [rootInput, setRootInput] = useState<Record<string, unknown>>({
    product_goal: "构建可验证、可持续演进的业务应用",
    business_constraints: "确定性、可审计、严格模块边界",
    stakeholders: "需求方, 产品设计, 工程实现",
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRunRef = useRef(false);
  const cameraRef = useRef(camera);
  const touchPointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const touchGestureRef = useRef<{
    startCamera: CameraState;
    startCenter: { x: number; y: number };
  } | null>(null);
  const businessScopeId = runtimeState.scopeId;
  const selectedBusinessNodeId = runtimeState.selectionId;
  const layoutLocked = runtimeState.layoutLocked;

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

  const setBusinessScopeId = useCallback(
    (scopeId: string) =>
      dispatchRuntimeEvent("NAVIGATE_SCOPE", "scope-navigation", { scopeId }),
    [dispatchRuntimeEvent],
  );

  const setSelectedBusinessNodeId = useCallback(
    (nodeId: string) =>
      dispatchRuntimeEvent("SELECT_NODE", "node-selection", { nodeId }),
    [dispatchRuntimeEvent],
  );

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

  const appRoot = documentState.rootIntent;
  const scopeNode = useMemo(
    () => findNode(appRoot, scopePath.at(-1) ?? appRoot.id) ?? appRoot,
    [appRoot, scopePath],
  );
  const businessRoot = useMemo(() => getBusinessRoot(documentState), [documentState]);
  const businessScope = useMemo(
    () => findNode(businessRoot, businessScopeId) ?? businessRoot,
    [businessRoot, businessScopeId],
  );
  const selectedBusinessNode =
    findNode(businessRoot, selectedBusinessNodeId) ?? businessScope;
  const appEdges = useMemo(() => aggregateEdges(deriveEdges(scopeNode)), [scopeNode]);
  const businessCycle = useMemo(() => detectCycle(businessScope), [businessScope]);
  const visibleNodes = useMemo(() => scopeNode.children ?? [], [scopeNode.children]);
  const scopeMinimized = nodeDisplayMode(scopeNode) === "minimized";

  const commit = useCallback(
    (next: IntentDocumentV2) => {
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDocumentState(next);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [dispatchRuntimeEvent, documentState],
  );

  const updateDocumentNode = useCallback(
    (id: string, updater: (node: IntentNode) => IntentNode) => {
      commit({
        ...documentState,
        rootIntent: updateNode(documentState.rootIntent, id, updater),
      });
    },
    [commit, documentState],
  );

  const toggleNodeResizeMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNode(node.id, (item) => ({
        ...item,
        resizeMode: nodeResizeMode(item) === "simple" ? "full" : "simple",
      }));
      setSelectedAppNodeId(node.id);
    },
    [updateDocumentNode],
  );

  const toggleNodeDisplayMode = useCallback(
    (node: IntentNode) => {
      updateDocumentNode(node.id, (item) => ({
        ...item,
        displayMode:
          nodeDisplayMode(item) === "expanded" ? "minimized" : "expanded",
      }));
      setSelectedAppNodeId(node.id);
    },
    [updateDocumentNode],
  );

  const setScopeCamera = useCallback(
    (next: CameraState, persist = false) => {
      cameraRef.current = next;
      setCamera(next);
      if (persist) {
        setDocumentState((active) => ({
          ...active,
          viewState: {
            ...active.viewState,
            cameras: { ...active.viewState.cameras, [scopeNode.id]: next },
          },
        }));
      }
    },
    [scopeNode.id],
  );

  const fitScope = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const world = scopeMinimized
      ? MINIMIZED_NODE_SIZE
      : scopeNode.canvasSize ?? {
          width: Math.max(900, ...visibleNodes.map((node) => node.position.x + nodeSize(node).width + 100)),
          height: Math.max(600, ...visibleNodes.map((node) => node.position.y + nodeSize(node).height + 100)),
        };
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min((viewport.clientWidth - 36) / world.width, (viewport.clientHeight - 36) / world.height)),
    );
    setScopeCamera({
      scale,
      x: (viewport.clientWidth - world.width * scale) / 2,
      y: (viewport.clientHeight - world.height * scale) / 2,
    });
  }, [scopeMinimized, scopeNode, setScopeCamera, visibleNodes]);

  useEffect(() => {
    const saved = documentState.viewState.cameras[scopeNode.id];
    const frame = window.requestAnimationFrame(() => {
      if (saved) setScopeCamera(saved);
      else fitScope();
    });
    return () => window.cancelAnimationFrame(frame);
    // Scope identity is the intentional trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeNode.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitScope);
    return () => window.cancelAnimationFrame(frame);
    // Display-mode changes intentionally refit the same scope to its new boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMinimized]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && scopePath.length > 1) {
        setScopePath((path) => path.slice(0, -1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        fitScope();
      }
      if (event.key === "0") {
        event.preventDefault();
        setScopeCamera({ scale: 1, x: 0, y: 0 }, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitScope, scopePath.length, setScopeCamera]);

  useEffect(() => {
    const warning = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);

  const enterNode = (node: IntentNode) => {
    setScopePath((path) => [...path, node.id]);
    setSelectedAppNodeId(node.id);
    setScopeCamera(documentState.viewState.cameras[node.id] ?? DEFAULT_CAMERA);
  };

  const nearestNode = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !visibleNodes.length) return undefined;
    const rect = viewport.getBoundingClientRect();
    const x = (clientX - rect.left - cameraRef.current.x) / cameraRef.current.scale;
    const y = (clientY - rect.top - cameraRef.current.y) / cameraRef.current.scale;
    return visibleNodes.reduce<IntentNode | undefined>((closest, node) => {
      if (!closest) return node;
      const size = runtimeNodeRenderSize(node);
      const closestSize = runtimeNodeRenderSize(closest);
      const distance = (node.position.x + size.width / 2 - x) ** 2 + (node.position.y + size.height / 2 - y) ** 2;
      const closestDistance = (closest.position.x + closestSize.width / 2 - x) ** 2 + (closest.position.y + closestSize.height / 2 - y) ** 2;
      return distance < closestDistance ? node : closest;
    }, undefined);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
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
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old.scale * Math.exp(-event.deltaY * 0.002)));
    if (direction > 0 && nextScale >= MAX_SCALE) {
      const target = nearestNode(event.clientX, event.clientY);
      if (target) {
        enterNode(target);
        setToast(`进入「${target.name}」`);
        return;
      }
      setToast("当前叶子没有更深层节点，可使用“添加子节点”扩展");
    }
    if (direction < 0 && nextScale <= MIN_SCALE && scopePath.length > 1) {
      setScopePath((path) => path.slice(0, -1));
      setToast("返回上级节点");
      return;
    }
    if (direction < 0 && nextScale <= MIN_SCALE && scopePath.length === 1) {
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

  const onViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") {
      event.preventDefault();
      const target = event.currentTarget;
      const points = touchPointersRef.current;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const center = () => {
        const active = [...points.values()];
        return {
          x: active.reduce((sum, point) => sum + point.x, 0) / active.length,
          y: active.reduce((sum, point) => sum + point.y, 0) / active.length,
        };
      };
      touchGestureRef.current = {
        startCamera: { ...cameraRef.current },
        startCenter: center(),
      };
      target.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        points.set(moveEvent.pointerId, {
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        const gesture = touchGestureRef.current;
        if (!gesture || points.size === 0) return;
        const currentCenter = center();
        setScopeCamera({
          ...gesture.startCamera,
          x:
            gesture.startCamera.x +
            currentCenter.x -
            gesture.startCenter.x,
          y:
            gesture.startCamera.y +
            currentCenter.y -
            gesture.startCenter.y,
        });
      };
      const finish = (finishEvent: PointerEvent) => {
        if (finishEvent.pointerId !== event.pointerId) return;
        points.delete(finishEvent.pointerId);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
        if (points.size > 0) {
          touchGestureRef.current = {
            startCamera: { ...cameraRef.current },
            startCenter: center(),
          };
        } else {
          touchGestureRef.current = null;
          setScopeCamera(cameraRef.current, true);
        }
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
      return;
    }
    const start = { x: event.clientX, y: event.clientY };
    const startCamera = { ...cameraRef.current };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      setScopeCamera({
        ...startCamera,
        x: startCamera.x + moveEvent.clientX - start.x,
        y: startCamera.y + moveEvent.clientY - start.y,
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setScopeCamera(cameraRef.current, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const moveNodeStart = (
    node: IntentNode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (layoutLocked || event.button !== 0) return;
    const start = { ...node.position };
    const size = runtimeNodeRenderSize(node);
    const bounds = scopeNode.canvasSize ?? { width: 2400, height: 1500 };
    const origin = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest = start;
    const move = (moveEvent: PointerEvent) => {
      latest = {
        x: Math.max(20, Math.min(bounds.width - size.width - 20, start.x + (moveEvent.clientX - origin.x) / cameraRef.current.scale)),
        y: Math.max(56, Math.min(bounds.height - size.height - 20, start.y + (moveEvent.clientY - origin.y) / cameraRef.current.scale)),
      };
      setDocumentState((active) => ({
        ...active,
        rootIntent: updateNode(active.rootIntent, node.id, (item) => ({
          ...item,
          position: latest,
        })),
      }));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "node-move");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const resizeNodeStart = (
    node: IntentNode,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (layoutLocked || event.button !== 0) return;
    const startSize = nodeSize(node);
    const startPosition = { ...node.position };
    const bounds = scopeNode.canvasSize ?? { width: 2400, height: 1500 };
    const origin = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - origin.x) / cameraRef.current.scale;
      const dy = (moveEvent.clientY - origin.y) / cameraRef.current.scale;
      let x = startPosition.x;
      let y = startPosition.y;
      let width = startSize.width;
      let height = startSize.height;
      if (direction.includes("e")) width = Math.max(NODE_MIN_SIZE.width, Math.min(NODE_MAX_SIZE.width, bounds.width - startPosition.x - 20, startSize.width + dx));
      if (direction.includes("s")) height = Math.max(NODE_MIN_SIZE.height, Math.min(NODE_MAX_SIZE.height, bounds.height - startPosition.y - 20, startSize.height + dy));
      if (direction.includes("w")) {
        width = Math.max(NODE_MIN_SIZE.width, Math.min(NODE_MAX_SIZE.width, startSize.width - dx));
        x = Math.max(20, startPosition.x + startSize.width - width);
        width = startPosition.x + startSize.width - x;
      }
      if (direction.includes("n")) {
        height = Math.max(NODE_MIN_SIZE.height, Math.min(NODE_MAX_SIZE.height, startSize.height - dy));
        y = Math.max(56, startPosition.y + startSize.height - height);
        height = startPosition.y + startSize.height - y;
      }
      setDocumentState((active) => ({
        ...active,
        rootIntent: updateNode(active.rootIntent, node.id, (item) => ({
          ...item,
          position: { x, y },
          size: { width, height },
        })),
      }));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "node-resize");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const resizeScopeCanvasStart = (
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (layoutLocked || event.button !== 0) return;
    const startSize = scopeNode.canvasSize ?? { width: 1200, height: 800 };
    const startCamera = { ...cameraRef.current };
    const origin = { x: event.clientX, y: event.clientY };
    const contentMinimum = visibleNodes.reduce(
      (minimum, node) => {
        const size = runtimeNodeRenderSize(node);
        return {
          width: Math.max(
            minimum.width,
            node.position.x + size.width + ROOT_CANVAS_PADDING,
          ),
          height: Math.max(
            minimum.height,
            node.position.y + size.height + ROOT_CANVAS_PADDING,
          ),
        };
      },
      ROOT_CANVAS_MIN_SIZE,
    );
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dx =
        (moveEvent.clientX - origin.x) / cameraRef.current.scale;
      const dy =
        (moveEvent.clientY - origin.y) / cameraRef.current.scale;
      let width = startSize.width;
      let height = startSize.height;

      if (direction.includes("e")) {
        width = Math.max(
          contentMinimum.width,
          Math.min(ROOT_CANVAS_MAX_SIZE.width, startSize.width + dx),
        );
      }
      if (direction.includes("s")) {
        height = Math.max(
          contentMinimum.height,
          Math.min(ROOT_CANVAS_MAX_SIZE.height, startSize.height + dy),
        );
      }
      if (direction.includes("w")) {
        width = Math.max(
          contentMinimum.width,
          Math.min(ROOT_CANVAS_MAX_SIZE.width, startSize.width - dx),
        );
      }
      if (direction.includes("n")) {
        height = Math.max(
          contentMinimum.height,
          Math.min(ROOT_CANVAS_MAX_SIZE.height, startSize.height - dy),
        );
      }

      setDocumentState((active) => ({
        ...active,
        rootIntent: updateNode(active.rootIntent, scopeNode.id, (item) => ({
          ...item,
          canvasSize: { width, height },
        })),
      }));
      setScopeCamera({
        ...startCamera,
        x: direction.includes("w")
          ? startCamera.x + (startSize.width - width) * startCamera.scale
          : startCamera.x,
        y: direction.includes("n")
          ? startCamera.y + (startSize.height - height) * startCamera.scale
          : startCamera.y,
      });
    };

    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      setScopeCamera(cameraRef.current, true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "scope-canvas-resize");
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const autoLayout = () => {
    const laneColumns = {
      runtime: [90],
      interface: [500, 950, 1400],
      output: [1880],
    };
    const laneHeights = {
      runtime: [80],
      interface: [80, 80, 80],
      output: [80],
    };
    let maximumBottom = 0;
    updateDocumentNode(scopeNode.id, (scope) => ({
      ...scope,
      children: scope.children?.map((node) => {
        const lane = String(node.implementation?.config?.lane ?? "interface") as keyof typeof laneColumns;
        const size = runtimeNodeRenderSize(node);
        const column = laneHeights[lane].indexOf(Math.min(...laneHeights[lane]));
        const x = laneColumns[lane][column];
        const y = laneHeights[lane][column];
        laneHeights[lane][column] += size.height + 48;
        maximumBottom = Math.max(maximumBottom, y + size.height + 80);
        return {
          ...node,
          position: { x, y },
        };
      }),
      canvasSize: {
        width: Math.max(scope.canvasSize?.width ?? 0, 2400),
        height: Math.max(1500, maximumBottom),
      },
    }));
    setTimeout(fitScope, 0);
  };

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

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const loaded = loadIntentDocument(parsed);
      setHistory((items) => [...items, documentState]);
      setDocumentState(loaded);
      dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
        scopeId: loaded.businessRootId,
        selectionId: loaded.businessRootId,
      });
      setScopePath([loaded.rootIntent.id]);
      setDirty(false);
      setToast("文档已在临时状态校验并加载");
    } catch (error) {
      setToast(error instanceof Error ? `导入失败：${error.message}` : "导入失败");
    } finally {
      event.target.value = "";
    }
  };

  const publishModule = () => {
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

  const insertModule = (module: PublishedModule) => {
    const snapshot = clone(module.snapshot);
    const linked: IntentNode = {
      ...snapshot,
      id: uid("linked"),
      name: `${snapshot.name} · 链接`,
      kind: "linkedModule",
      children: clone(snapshot.children),
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

  const addBusinessChild = () => {
    const node: IntentNode = {
      id: uid("intent"),
      name: "新子意图",
      description: "通过节点管道扩展当前作用域。",
      kind: "operator",
      operator: "identity",
      inputs: [{ id: uid("input"), name: "输入", type: "any" }],
      outputs: [{ id: uid("output"), name: "输出", type: "any" }],
      position: { x: 320, y: 240 },
      size: { width: 220, height: 150 },
      resizeMode: "simple",
      displayMode: "minimized",
    };
    updateDocumentNode(businessScope.id, (scope) => ({
      ...scope,
      children: [...(scope.children ?? []), node],
    }));
    setSelectedBusinessNodeId(node.id);
  };

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

  const duplicateSelected = () => {
    if (selectedBusinessNode.id === businessRoot.id) return;
    const parentPath = findPath(businessRoot, selectedBusinessNode.id);
    const parent = parentPath?.at(-2);
    if (!parent) return;
    const duplicate: IntentNode = {
      ...clone(selectedBusinessNode),
      id: uid("copy"),
      name: `${selectedBusinessNode.name} · 副本`,
      position: {
        x: selectedBusinessNode.position.x + 36,
        y: selectedBusinessNode.position.y + 36,
      },
    };
    updateDocumentNode(parent.id, (node) => ({
      ...node,
      children: [...(node.children ?? []), duplicate],
    }));
    setSelectedBusinessNodeId(duplicate.id);
  };

  const deleteSelected = () => {
    if (selectedBusinessNode.id === businessRoot.id) return;
    commit({
      ...documentState,
      rootIntent: removeNode(documentState.rootIntent, selectedBusinessNode.id),
    });
    setSelectedBusinessNodeId(businessScope.id);
  };

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

  const resetApplicationGraph = () => {
    if (!window.confirm("重置全部应用节点布局和系统绑定？业务意图与模块快照会保留。")) return;
    const reset = createApplicationDocument(clone(businessRoot), clone(documentState.publishedModules));
    setHistory((items) => [...items.slice(-29), documentState]);
    setFuture([]);
    setDocumentState(reset);
    setScopePath([reset.rootIntent.id]);
    setSelectedAppNodeId("current_container");
    dispatchRuntimeEvent("DOCUMENT_LOADED", "application_root", {
      scopeId: reset.businessRootId,
      selectionId: reset.businessRootId,
    });
    setDirty(true);
  };

  const run = async () => {
    setRunState("running");
    setTrace([]);
    cancelRunRef.current = false;
    try {
      await executeBusinessNode(
        businessRoot,
        rootInput,
        businessRoot.name,
        (next) =>
          setTrace((items) => {
            const existing = items.findIndex((item) => item.id === next.id && item.path === next.path);
            if (existing < 0) return [...items, next];
            return items.map((item, index) => (index === existing ? next : item));
          }),
        () => cancelRunRef.current,
      );
      setRunState("success");
    } catch (error) {
      setRunState(error instanceof Error && error.message === "cancelled" ? "idle" : "failed");
    }
  };

  const stop = () => {
    cancelRunRef.current = true;
    setRunState("idle");
  };

  const newDocument = () => {
    const next = sampleDocument();
    setHistory((items) => [...items, documentState]);
    setFuture([]);
    setDocumentState(next);
    setScopePath([next.rootIntent.id]);
    dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
      scopeId: next.businessRootId,
      selectionId: next.businessRootId,
    });
    setDirty(false);
  };

  useEffect(() => {
    if (!lastCommands.length) return;
    const timer = window.setTimeout(() => {
      lastCommands.forEach((command) => {
        if (command.type === "NEW_DOCUMENT") newDocument();
        if (command.type === "IMPORT_REQUEST") fileInputRef.current?.click();
        if (command.type === "EXPORT_V2")
          downloadJson("intent-map-v2.intent-map.json", documentState);
        if (command.type === "EXPORT_V1")
          downloadJson(
            "intent-map-v1-compatible.intent-map.json",
            exportCompatibleV1(documentState),
          );
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
        if (command.type === "NAVIGATE_APP_PARENT" && scopePath.length > 1)
          setScopePath((path) => path.slice(0, -1));
        if (command.type === "FIT_SCOPE") fitScope();
        if (command.type === "RESET_CAMERA")
          setScopeCamera({ scale: 1, x: 0, y: 0 }, true);
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // Commands intentionally execute once for each immutable batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCommands]);

  const emit = (command: RuntimeCommand) => {
    dispatchRuntimeEvent(command.type, command.source ?? "renderer", command.payload);
  };

  const renderTree = (node: IntentNode, depth = 0): React.ReactNode => {
    const matches =
      !search ||
      node.name.toLowerCase().includes(search.toLowerCase()) ||
      node.description.toLowerCase().includes(search.toLowerCase());
    return (
      <Fragment key={node.id}>
        {matches && (
          <button
            className={`runtime-tree-row ${businessScope.id === node.id ? "scope" : ""} ${selectedBusinessNodeId === node.id ? "selected" : ""}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => setSelectedBusinessNodeId(node.id)}
            onDoubleClick={() => setBusinessScopeId(node.id)}
          >
            <span>{node.children?.length ? "◇" : "ƒ"}</span>
            <strong>{node.name}</strong>
            <small>{node.children?.length ?? 0}</small>
          </button>
        )}
        {node.children?.map((child) => renderTree(child, depth + 1))}
      </Fragment>
    );
  };

  const parentScopeFor = (nodeId: string) =>
    findPath(businessRoot, nodeId)?.at(-2) ?? businessRoot;

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
  };

  const outputMappingOptionsFor = (node: IntentNode) => [
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

  const updateOutputMapping = (
    nodeId: string,
    portId: string,
    value: string,
  ) => {
    let mapping: Expression | undefined;
    if (value.startsWith("env:")) {
      mapping = { kind: "ref", portId: value.slice(4), env: true };
    } else if (value.startsWith("ref:")) {
      const [, nodeIdValue, portIdValue] = value.split(":");
      mapping = {
        kind: "ref",
        nodeId: nodeIdValue,
        portId: portIdValue,
      };
    }
    updateDocumentNode(nodeId, (node) => ({
      ...node,
      outputs: node.outputs.map((output) =>
        output.id === portId ? { ...output, mapping } : output,
      ),
    }));
  };

  const moveBusinessNodeStart = (
    node: IntentNode,
    previewScale: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if (layoutLocked || event.button !== 0) return;
    const target = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const start = { ...node.position };
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
      const position = {
        x: Math.max(20, Math.min(bounds.width - size.width - 20, start.x + (moveEvent.clientX - origin.x) / pointerScale)),
        y: Math.max(70, Math.min(bounds.height - size.height - 20, start.y + (moveEvent.clientY - origin.y) / pointerScale)),
      };
      setDocumentState((active) => ({
        ...active,
        rootIntent: updateNode(active.rootIntent, node.id, (item) => ({
          ...item,
          position,
        })),
      }));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "current_container");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const resizeBusinessNodeStart = (
    node: IntentNode,
    direction: ResizeDirection,
    previewScale: number,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    event.stopPropagation();
    if (layoutLocked || event.button !== 0) return;
    const target = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const startSize = businessNodeSize(node);
    const minimumHeight = businessNodeMinimumHeight(node);
    const startPosition = { ...node.position };
    const bounds = businessScope.canvasSize ?? { width: 1400, height: 850 };
    const world = target.closest<HTMLElement>(".business-preview-world");
    const renderedScale =
      world && world.offsetWidth > 0
        ? world.getBoundingClientRect().width / world.offsetWidth
        : previewScale * cameraRef.current.scale;
    const pointerScale = renderedScale > 0 ? renderedScale : previewScale;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - origin.x) / pointerScale;
      const dy = (moveEvent.clientY - origin.y) / pointerScale;
      let x = startPosition.x;
      let y = startPosition.y;
      let width = startSize.width;
      let height = startSize.height;
      if (direction.includes("e")) {
        width = Math.max(
          NODE_MIN_SIZE.width,
          Math.min(520, bounds.width - startPosition.x - 20, startSize.width + dx),
        );
      }
      if (direction.includes("s")) {
        height = Math.max(
          minimumHeight,
          Math.min(420, bounds.height - startPosition.y - 20, startSize.height + dy),
        );
      }
      if (direction.includes("w")) {
        width = Math.max(
          NODE_MIN_SIZE.width,
          Math.min(520, startPosition.x + startSize.width - 20, startSize.width - dx),
        );
        x = startPosition.x + startSize.width - width;
      }
      if (direction.includes("n")) {
        height = Math.max(
          minimumHeight,
          Math.min(420, startPosition.y + startSize.height - 70, startSize.height - dy),
        );
        y = startPosition.y + startSize.height - height;
      }
      setDocumentState((active) => ({
        ...active,
        rootIntent: updateNode(active.rootIntent, node.id, (item) => ({
          ...item,
          position: { x, y },
          size: { width, height },
        })),
      }));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setHistory((items) => [...items.slice(-29), documentState]);
      setFuture([]);
      setDirty(true);
      dispatchRuntimeEvent("DOCUMENT_CHANGED", "current_container");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const toggleBusinessResizeMode = (node: IntentNode) => {
    updateDocumentNode(node.id, (item) => ({
      ...item,
      resizeMode: nodeResizeMode(item) === "simple" ? "full" : "simple",
    }));
    setSelectedBusinessNodeId(node.id);
  };

  const toggleBusinessDisplayMode = (node: IntentNode) => {
    updateDocumentNode(node.id, (item) => ({
      ...item,
      displayMode:
        nodeDisplayMode(item) === "expanded" ? "minimized" : "expanded",
    }));
    setSelectedBusinessNodeId(node.id);
  };

  const renderBusinessCanvas = () => {
    const size = businessScope.canvasSize ?? { width: 1400, height: 850 };
    const expanded =
      scopePath.length > 1 &&
      scopeNode.implementation?.key === "current-container";
    const focusedCanvas = scopeNode.canvasSize ?? { width: 1200, height: 800 };
    const availableWidth = expanded
      ? Math.max(650, focusedCanvas.width - 80)
      : 650;
    const availableHeight = expanded
      ? Math.max(360, focusedCanvas.height - 100)
      : 360;
    const scale = Math.min(
      expanded ? 1 : 0.58,
      availableWidth / size.width,
      availableHeight / size.height,
    );
    return (
      <div className="business-preview">
        <div
          className="business-preview-world"
          style={{
            width: size.width,
            height: size.height,
            transform: `scale(${scale})`,
          }}
        >
          <section
            className="business-container-node"
            aria-label={`当前业务容器：${businessScope.name}`}
          >
            <header className="business-container-header">
              <span>{businessScope.kind.toUpperCase()}</span>
              <div>
                <strong>{businessScope.name}</strong>
                <small>{businessScope.description}</small>
              </div>
              <i aria-hidden="true" />
            </header>
            <div className="business-container-interfaces">
              <div className="business-container-inputs">
                {businessScope.inputs.map((port) => (
                  <span key={port.id}><i />{port.name}</span>
                ))}
              </div>
              <div className="business-container-outputs">
                {businessScope.outputs.map((port) => (
                  <span key={port.id}>{port.name}<i /></span>
                ))}
              </div>
            </div>
            <footer>
              <span>{businessScope.inputs.length} in</span>
              <span>{businessScope.children?.length ?? 0} children</span>
              <span>{businessScope.outputs.length} out</span>
            </footer>
          </section>
          <svg className="business-edges" viewBox={`0 0 ${size.width} ${size.height}`}>
            {deriveEdges(businessScope).map((edge) => {
              const source = findNode(businessScope, edge.sourceId);
              const target = findNode(businessScope, edge.targetId);
              if (!source || !target) return null;
              const sourceSize = businessNodeSize(source);
              const targetSize = businessNodeSize(target);
              const sourceMinimized =
                nodeDisplayMode(source) === "minimized";
              const targetMinimized =
                nodeDisplayMode(target) === "minimized";
              const sourceIndex = Math.max(0, source.outputs.findIndex((port) => port.id === edge.sourcePortId));
              const targetIndex = Math.max(0, target.inputs.findIndex((port) => port.id === edge.targetPortId));
              const sx =
                source.position.x +
                sourceSize.width +
                (sourceMinimized ? 0 : BUSINESS_PORT_DOT_OFFSET);
              const sy = sourceMinimized
                ? source.position.y + sourceSize.height / 2
                : source.position.y +
                  BUSINESS_PORT_TOP +
                  BUSINESS_NODE_BORDER_WIDTH +
                  BUSINESS_PORT_HEIGHT / 2 +
                  sourceIndex * BUSINESS_PORT_ROW;
              const tx =
                target.position.x -
                (targetMinimized ? 0 : BUSINESS_PORT_DOT_OFFSET);
              const ty = targetMinimized
                ? target.position.y + targetSize.height / 2
                : target.position.y +
                  BUSINESS_PORT_TOP +
                  BUSINESS_NODE_BORDER_WIDTH +
                  BUSINESS_PORT_HEIGHT / 2 +
                  targetIndex * BUSINESS_PORT_ROW;
              return <path key={edge.id} d={`M ${sx} ${sy} C ${sx + 45} ${sy}, ${tx - 45} ${ty}, ${tx} ${ty}`} />;
            })}
          </svg>
          {(businessScope.children ?? []).map((node) => {
            const size = businessNodeSize(node);
            const resizeMode = nodeResizeMode(node);
            const visibleDirections = resizeDirectionsFor(resizeMode);
            const selected = selectedBusinessNodeId === node.id;
            const minimized = nodeDisplayMode(node) === "minimized";
            return (
              <Fragment key={node.id}>
                <article
                  role="button"
                  tabIndex={0}
                  className={`business-node ${minimized ? "minimized" : "expanded"} ${selected ? "selected" : ""}`}
                  style={{ left: node.position.x, top: node.position.y, width: size.width, height: size.height }}
                  onClick={() => setSelectedBusinessNodeId(node.id)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (minimized) toggleBusinessDisplayMode(node);
                    else setBusinessScopeId(node.id);
                  }}
                  onPointerDown={(event) => moveBusinessNodeStart(node, scale, event)}
                  data-display-mode={minimized ? "minimized" : "expanded"}
                  title={minimized ? "双击展开节点" : undefined}
                >
                  {minimized ? (
                    <strong>{node.name}</strong>
                  ) : (
                    <>
                      <span>{node.kind.toUpperCase()}</span>
                      <strong>{node.name}</strong>
                      <small>{node.description}</small>
                      <button
                        className="node-display-toggle business-display-toggle"
                        aria-label={`最小化「${node.name}」`}
                        title="只显示节点名称"
                        onPointerDown={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleBusinessDisplayMode(node);
                        }}
                      >
                        −
                      </button>
                      <div
                        className="business-node-ports"
                        style={{ top: BUSINESS_PORT_TOP }}
                      >
                        {node.inputs.map((port, index) => (
                          <i
                            className="input"
                            style={{ top: index * BUSINESS_PORT_ROW }}
                            key={port.id}
                          >
                            {port.name}
                          </i>
                        ))}
                        {node.outputs.map((port, index) => (
                          <i
                            className="output"
                            style={{ top: index * BUSINESS_PORT_ROW }}
                            key={port.id}
                          >
                            {port.name}
                          </i>
                        ))}
                      </div>
                      {!layoutLocked &&
                        visibleDirections.map((direction) => (
                          <span
                            className={`resize-handle resize-${direction}`}
                            key={direction}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) =>
                              resizeBusinessNodeStart(node, direction, scale, event)
                            }
                          />
                        ))}
                    </>
                  )}
                </article>
                {!layoutLocked && !minimized && (
                  <button
                    className={`resize-mode-toggle business-mode-toggle ${resizeMode} ${selected ? "selected" : ""}`}
                    style={{
                      left: node.position.x + size.width - 30,
                      top: node.position.y + size.height + 5,
                    }}
                    aria-label={
                      resizeMode === "simple"
                        ? `将「${node.name}」切换为四边四角缩放`
                        : `将「${node.name}」切换为右边、下边和右下角缩放`
                    }
                    title={
                      resizeMode === "simple"
                        ? "当前：右边、下边、右下角 · 点击切换为八向"
                        : "当前：四边四角 · 点击切换为三向"
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => toggleBusinessResizeMode(node)}
                  >
                    {resizeMode === "simple" ? "┘" : "⤢"}
                  </button>
                )}
              </Fragment>
            );
          })}
          {!businessScope.children?.length && (
            <button className="business-empty" onClick={addBusinessChild}>＋ 添加子意图</button>
          )}
        </div>
      </div>
    );
  };

  const renderNodeContent = (node: IntentNode) => {
    const key = node.implementation?.key;
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
    if (key === "global-toolbar") {
      return (
        <div className="global-toolbar-surface">
          <div className="runtime-brand"><i>◈</i><span><strong>Intent Map</strong><small>一切皆节点 · v2</small></span></div>
          <div className="runtime-command-grid">
            <button onClick={() => dispatchRuntimeEvent("NEW_DOCUMENT", "global_toolbar")}>新建</button>
            <button onClick={() => dispatchRuntimeEvent("IMPORT_REQUEST", "global_toolbar")}>导入</button>
            <button onClick={() => dispatchRuntimeEvent("EXPORT_V2", "global_toolbar")}>导出 v2</button>
            <button onClick={() => dispatchRuntimeEvent("EXPORT_V1", "global_toolbar")}>兼容 v1</button>
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
    if (key === "intent-tree") {
      return (
        <div className="tree-surface">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索意图或端口" />
          <div>{renderTree(businessRoot)}</div>
        </div>
      );
    }
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
    if (key === "validation") {
      return (
        <div className={`validation-surface ${businessCycle ? "error" : "ok"}`}>
          <i>{businessCycle ? "!" : "✓"}</i>
          <span><strong>{businessCycle ? "发现循环依赖" : "作用域有效"}</strong><small>{businessCycle ? businessCycle.join(" → ") : "端口、可见性与数据 DAG 校验通过"}</small></span>
        </div>
      );
    }
    if (key === "breadcrumb") {
      const path = findPath(businessRoot, businessScope.id) ?? [businessRoot];
      return <div className="breadcrumb-surface">{path.map((item, index) => <Fragment key={item.id}><button onClick={() => setBusinessScopeId(item.id)}>{item.name}</button>{index < path.length - 1 && <i>›</i>}</Fragment>)}</div>;
    }
    if (key === "scope-toolbar") {
      return (
        <div className="scope-toolbar-surface">
          <div className="scope-toolbar-context">
            <span>{scopeNode.kind.toUpperCase()}</span>
            <strong>
              {scopePath
                .map((id) => findNode(appRoot, id)?.name ?? id)
                .join(" / ")}
            </strong>
            <small>
              {businessScope.name} · {businessScope.inputs.length} 输入 ·{" "}
              {businessScope.outputs.length} 输出
            </small>
          </div>
          <div className="scope-toolbar-actions">
            <button
              disabled={scopePath.length === 1}
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
            <button onClick={() => setBusinessScopeId(businessRoot.id)}>
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
    if (key === "current-container") return renderBusinessCanvas();
    if (key === "canvas-status") {
      return (
        <div className="canvas-status-surface">
          <span><i className="data" />数据管道</span>
          <span><i className="event" />事件管道</span>
          <span>{deriveEdges(businessScope).length} 条业务引用</span>
          <span>双指平移 · Ctrl+滚轮 50%–200%</span>
        </div>
      );
    }
    if (key === "properties") {
      return (
        <div className="properties-surface">
          <div className="property-heading"><span>{selectedBusinessNode.kind === "operator" ? "ƒ" : "◇"}</span><div><small>{selectedBusinessNode.kind}</small><strong>{selectedBusinessNode.name}</strong></div></div>
          <label>名称<input value={selectedBusinessNode.name} onChange={(event) => updateDocumentNode(selectedBusinessNode.id, (item) => ({ ...item, name: event.target.value }))} /></label>
          <label>描述<textarea rows={3} value={selectedBusinessNode.description} onChange={(event) => updateDocumentNode(selectedBusinessNode.id, (item) => ({ ...item, description: event.target.value }))} /></label>
          {selectedBusinessNode.kind === "operator" && <label>内置算子<select value={selectedBusinessNode.operator ?? "identity"} onChange={(event) => updateDocumentNode(selectedBusinessNode.id, (item) => ({ ...item, operator: event.target.value }))}><option value="identity">identity</option><option value="object">object</option><option value="array">array</option><option value="concat">concat</option></select></label>}
          <div className="property-ports"><strong>输入</strong>{selectedBusinessNode.inputs.map((port) => {
            const reference = collectRefs(port.binding)[0];
            const value = reference?.env
              ? `env:${reference.portId}`
              : reference?.nodeId
                ? `ref:${reference.nodeId}:${reference.portId}`
                : "";
            return <span className="binding-port-row" key={port.id}><i />{port.name}<select value={value} onChange={(event) => updateInputBinding(selectedBusinessNode.id, port.id, event.target.value)}><option value="">未绑定</option>{bindingOptionsFor(selectedBusinessNode.id).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span>;
          })}</div>
          <div className="property-ports outputs"><strong>输出</strong>{selectedBusinessNode.outputs.map((port) => {
            const reference = collectRefs(port.mapping)[0];
            const value = reference?.env
              ? `env:${reference.portId}`
              : reference?.nodeId
                ? `ref:${reference.nodeId}:${reference.portId}`
                : "";
            return selectedBusinessNode.kind === "composite"
              ? <span className="binding-port-row" key={port.id}><i />{port.name}<select value={value} onChange={(event) => updateOutputMapping(selectedBusinessNode.id, port.id, event.target.value)}><option value="">未映射</option>{outputMappingOptionsFor(selectedBusinessNode).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span>
              : <span key={port.id}><i />{port.name}<small>{port.type}</small></span>;
          })}</div>
          <div className="property-actions"><button onClick={() => dispatchRuntimeEvent("DUPLICATE_NODE", "properties")} disabled={selectedBusinessNode.id === businessRoot.id}>创建副本</button><button className="danger" onClick={() => dispatchRuntimeEvent("DELETE_NODE", "properties")} disabled={selectedBusinessNode.id === businessRoot.id}>删除</button></div>
        </div>
      );
    }
    if (key === "run-trace") {
      return (
        <div className="trace-surface">
          <div className="run-state"><i className={runState} /><span><small>本地确定性执行</small><strong>{runState === "idle" ? "尚未运行" : runState === "running" ? "运行中" : runState === "success" ? "执行成功" : "执行失败"}</strong></span><button onClick={() => dispatchRuntimeEvent("RUN_REQUEST", "run_trace")} disabled={runState === "running"}>重新运行</button></div>
          <div className="run-input-grid">{businessRoot.inputs.map((port) => <label key={port.id}><span>{port.name}<small>{port.type}</small></span><input value={String(rootInput[port.id] ?? "")} onChange={(event) => setRootInput((value) => ({ ...value, [port.id]: event.target.value }))} /></label>)}</div>
          <div className="trace-list">{trace.length ? trace.map((item, index) => <div className={`trace-row ${item.status}`} key={`${item.id}-${item.path}`}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{item.name}</strong><small>{item.path}</small></span><i>{item.status}{item.duration ? ` · ${item.duration}ms` : ""}</i></div>) : <div className="surface-empty">运行后显示每层输入、输出与耗时</div>}</div>
        </div>
      );
    }
    const Renderer = resolveRenderer(node);
    return <Renderer node={node} document={documentState} scale={camera.scale} active={scopeNode.id === node.id} selected={selectedAppNodeId === node.id} summary={camera.scale < 0.75} emit={emit} />;
  };

  const renderEdge = (edge: AggregatedEdge) => {
    const source = findNode(scopeNode, edge.sourceId);
    const target = findNode(scopeNode, edge.targetId);
    if (!source || !target) return null;
    const sourceSize = runtimeNodeRenderSize(source);
    const targetSize = runtimeNodeRenderSize(target);
    const sourceMinimized = nodeDisplayMode(source) === "minimized";
    const targetMinimized = nodeDisplayMode(target) === "minimized";
    const sourcePortIndex = Math.max(0, source.outputs.findIndex((port) => port.id === edge.sourcePortId));
    const targetPortIndex = Math.max(0, target.inputs.findIndex((port) => port.id === edge.targetPortId));
    const sx =
      source.position.x + sourceSize.width + (sourceMinimized ? 0 : 6);
    const sy = sourceMinimized
      ? source.position.y + sourceSize.height / 2
      : source.position.y + PORT_TOP + sourcePortIndex * PORT_ROW;
    const tx = target.position.x - (targetMinimized ? 0 : 6);
    const ty = targetMinimized
      ? target.position.y + targetSize.height / 2
      : target.position.y + PORT_TOP + targetPortIndex * PORT_ROW;
    const bend = Math.max(70, Math.abs(tx - sx) * 0.42);
    const selected = selectedEdgeId === edge.id;
    return (
      <g
        className={`runtime-edge channel-${edge.channel} ${selected ? "selected" : ""}`}
        key={edge.id}
        onPointerDown={(event) => {
          event.stopPropagation();
          setSelectedEdgeId(selected ? null : edge.id);
        }}
      >
        <path d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`} />
        <circle cx={(sx + tx) / 2} cy={(sy + ty) / 2} r={selected ? 12 : 9} />
        <text x={(sx + tx) / 2} y={(sy + ty) / 2 + 3}>{edge.count}</text>
        {selected && <text className="edge-detail" x={(sx + tx) / 2} y={(sy + ty) / 2 + 28}>{edge.members.map((member) => `${member.sourcePortId}→${member.targetPortId}`).join(" · ")}</text>}
      </g>
    );
  };

  const worldSize = scopeNode.canvasSize ?? { width: 1200, height: 800 };
  const renderedWorldSize = scopeMinimized ? MINIMIZED_NODE_SIZE : worldSize;
  const focusedLeaf = scopePath.length > 1 && !scopeNode.children?.length;

  return (
    <main className="everything-app">
      <input ref={fileInputRef} type="file" accept=".json,.intent-map.json" hidden onChange={importDocument} />
      <div
        ref={viewportRef}
        className={`root-node-viewport ${layoutLocked ? "layout-locked" : ""}`}
        onWheel={onWheel}
        onPointerDown={onViewportPointerDown}
      >
        <div className="root-grid" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, width: renderedWorldSize.width, height: renderedWorldSize.height }}>
          <div
            className={`root-boundary ${scopeMinimized ? "minimized" : "expanded"}`}
            style={{ width: renderedWorldSize.width, height: renderedWorldSize.height }}
            data-display-mode={scopeMinimized ? "minimized" : "expanded"}
          >
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
            ) : (
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
            )}
            {!scopeMinimized && scopePath.length === 1 && <svg className="runtime-edges" viewBox={`0 0 ${worldSize.width} ${worldSize.height}`}>{appEdges.map(renderEdge)}</svg>}
            {!scopeMinimized && visibleNodes.map((node) => (
              <NodeRenderer
                key={node.id}
                node={node}
                scale={camera.scale}
                selected={selectedAppNodeId === node.id}
                active={false}
                layoutLocked={layoutLocked}
                content={renderNodeContent(node)}
                onSelect={setSelectedAppNodeId}
                onEnter={enterNode}
                onMoveStart={moveNodeStart}
                onResizeStart={resizeNodeStart}
                onResizeModeToggle={toggleNodeResizeMode}
                onDisplayModeToggle={toggleNodeDisplayMode}
              />
            ))}
            {!scopeMinimized && scopePath.length > 1 && (
              <section
                className="focused-runtime-content"
                style={{
                  width: Math.max(640, worldSize.width - 64),
                  height: Math.max(420, worldSize.height - 96),
                }}
              >
                {renderNodeContent(scopeNode)}
              </section>
            )}
            {!scopeMinimized && (focusedLeaf || !visibleNodes.length) && (
              <button className="runtime-add-child" onClick={addRuntimeChild}>＋ 添加子节点</button>
            )}
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
                    left: worldSize.width - 30,
                    top: worldSize.height + 5,
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
        {!scopeMinimized && <div className="root-legend">
          <span><i className="data" />数据</span>
          <span><i className="event" />事件</span>
          <span>{appEdges.length} 组聚合管道</span>
          <span>双指平移 · Ctrl + 滚轮进入 / 返回</span>
        </div>}
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
      </div>
    </main>
  );
}
