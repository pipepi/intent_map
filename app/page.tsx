"use client";

import {
  ChangeEvent,
  CSSProperties,
  Fragment,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ValueType = "number" | "string" | "boolean" | "object" | "array" | "any";
type NodeKind = "composite" | "operator" | "linkedModule";
type Operator =
  | "identity"
  | "multiply"
  | "discount"
  | "subtract"
  | "concat"
  | "object"
  | "array"
  | "compare"
  | "convert";

type Expression =
  | { kind: "literal"; value: unknown }
  | { kind: "env"; portId: string }
  | { kind: "ref"; nodeId: string; portId: string }
  | {
      kind: "binary";
      op: "+" | "-" | "*" | "/" | "==" | "&&" | "||";
      left: Expression;
      right: Expression;
    };

type Port = {
  id: string;
  name: string;
  type: ValueType;
  binding?: Expression;
  mapping?: Expression;
};

type IntentNode = {
  id: string;
  name: string;
  description: string;
  kind: NodeKind;
  operator?: Operator;
  inputs: Port[];
  outputs: Port[];
  children?: IntentNode[];
  position: { x: number; y: number };
  size?: { width: number; height: number };
  resizeMode?: "simple" | "full";
  moduleRef?: { moduleId: string; version: number };
};

type PublishedModule = {
  moduleId: string;
  name: string;
  version: number;
  publishedAt: string;
  snapshot: IntentNode;
};

type IntentDocument = {
  version: 1;
  rootIntent: IntentNode;
  publishedModules: PublishedModule[];
};

type Trace = {
  id: string;
  name: string;
  path: string;
  status: "waiting" | "running" | "success" | "failed" | "skipped" | "cancelled";
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
};

type ScopeMotion = {
  phase: "enter-leave" | "enter-arrive" | "exit-leave" | "exit-arrive";
  originX: number;
  originY: number;
};

type ZoomCue = {
  mode: "enter" | "exit" | "limit";
  progress: number;
  x: number;
  y: number;
  title: string;
  detail: string;
};

const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const DEFAULT_NODE_SIZE = { width: 174, height: 102 };
const MIN_NODE_SIZE = { width: 150, height: 96 };
const MAX_NODE_SIZE = { width: 520, height: 360 };
const NODE_BOUNDS = { left: 195, top: 62, right: 900, bottom: 590 };
const NODE_PORT_SIZE = { width: 82, height: 22 };
const NODE_PORT_ANCHOR_INSET = 10.5;
const NODE_PORT_SECTION_TOP = 76;
const NODE_PORT_ROW_GAP = 28;
const NODE_FOOTER_SPACE = 34;
const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const simpleResizeDirections = ["e", "s", "se"] as const;
type ResizeDirection = (typeof resizeDirections)[number];
const getNodeMinimumHeight = (node: IntentNode) => {
  const portRows = Math.max(node.inputs.length, node.outputs.length);
  if (!portRows) return MIN_NODE_SIZE.height;
  return NODE_PORT_SECTION_TOP + portRows * NODE_PORT_ROW_GAP + NODE_FOOTER_SPACE;
};
const getNodeSize = (node: IntentNode) => {
  const stored = node.size ?? DEFAULT_NODE_SIZE;
  return {
    width: stored.width,
    height: Math.max(stored.height, getNodeMinimumHeight(node)),
  };
};
const getResizeMode = (node: IntentNode) => node.resizeMode ?? "simple";
const getNodePortY = (index: number) =>
  NODE_PORT_SECTION_TOP + NODE_PORT_SIZE.height / 2 + index * NODE_PORT_ROW_GAP;
const getNodePortAnchorX = (
  node: IntentNode,
  side: "input" | "output",
) => {
  const size = getNodeSize(node);
  const outsideOffset = NODE_PORT_SIZE.width / 2 - NODE_PORT_ANCHOR_INSET;
  return side === "input"
    ? node.position.x - outsideOffset
    : node.position.x + size.width + outsideOffset;
};

const sampleDocument = (): IntentDocument => {
  const scenarioFlow: IntentNode = {
    id: "scenario_flow",
    name: "核心物流动场景序列与约束",
    description: "识别核心业务流动场景、参与者、前后置条件、主序列、异常分支与约束。",
    kind: "operator",
    operator: "object",
    inputs: [
      {
        id: "scenario_goal",
        name: "产品目标",
        type: "string",
        binding: { kind: "env", portId: "product_goal" },
      },
      {
        id: "scenario_constraints",
        name: "业务约束",
        type: "object",
        binding: { kind: "env", portId: "business_constraints" },
      },
    ],
    outputs: [{ id: "scenario_spec", name: "场景序列与约束", type: "object" }],
    position: { x: 205, y: 105 },
  };

  const uiDemo: IntentNode = {
    id: "ui_demo",
    name: "场景匹配的 UI Demo 与流程共识",
    description: "用与场景匹配的 UI 界面组成可操作 Demo，使需求方和实现方对业务处理流程达成共识。",
    kind: "operator",
    operator: "object",
    inputs: [
      {
        id: "demo_scenarios",
        name: "场景序列",
        type: "object",
        binding: {
          kind: "ref",
          nodeId: "scenario_flow",
          portId: "scenario_spec",
        },
      },
      {
        id: "demo_stakeholders",
        name: "协作角色",
        type: "array",
        binding: { kind: "env", portId: "stakeholders" },
      },
    ],
    outputs: [{ id: "demo_consensus", name: "UI Demo 与流程共识", type: "object" }],
    position: { x: 385, y: 285 },
  };

  const databaseSchema: IntentNode = {
    id: "database_schema",
    name: "业务流程匹配的数据库表结构",
    description: "根据已确认的业务流程和约束，抽象出实体、关系、状态与完整性规则匹配的数据库表结构。",
    kind: "operator",
    operator: "object",
    inputs: [
      {
        id: "schema_scenarios",
        name: "业务流程",
        type: "object",
        binding: {
          kind: "ref",
          nodeId: "scenario_flow",
          portId: "scenario_spec",
        },
      },
      {
        id: "schema_constraints",
        name: "业务约束",
        type: "object",
        binding: { kind: "env", portId: "business_constraints" },
      },
    ],
    outputs: [{ id: "schema_model", name: "数据库表结构", type: "object" }],
    position: { x: 555, y: 105 },
  };

  const businessApi: IntentNode = {
    id: "business_api",
    name: "基于表结构的业务逻辑与 UI API",
    description: "根据数据库表结构实现业务处理逻辑，并输出 UI 界面需要的稳定 API 契约。",
    kind: "operator",
    operator: "object",
    inputs: [
      {
        id: "api_schema",
        name: "数据库表结构",
        type: "object",
        binding: {
          kind: "ref",
          nodeId: "database_schema",
          portId: "schema_model",
        },
      },
      {
        id: "api_ui_contract",
        name: "UI 交互契约",
        type: "object",
        binding: {
          kind: "ref",
          nodeId: "ui_demo",
          portId: "demo_consensus",
        },
      },
    ],
    outputs: [{ id: "api_contract", name: "业务逻辑与 UI API", type: "object" }],
    position: { x: 725, y: 285 },
  };

  const root: IntentNode = {
    id: "root",
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
        mapping: {
          kind: "ref",
          nodeId: "business_api",
          portId: "api_contract",
        },
      },
    ],
    children: [scenarioFlow, uiDemo, databaseSchema, businessApi],
    position: { x: 0, y: 0 },
  };

  return {
    version: 1,
    rootIntent: root,
    publishedModules: [
      {
        moduleId: "scenario-flow-core",
        name: "核心场景建模",
        version: 1,
        publishedAt: "刚刚",
        snapshot: structuredClone(scenarioFlow),
      },
    ],
  };
};

const collectRefs = (expr?: Expression): { nodeId?: string; portId: string; env?: boolean }[] => {
  if (!expr) return [];
  if (expr.kind === "ref") return [{ nodeId: expr.nodeId, portId: expr.portId }];
  if (expr.kind === "env") return [{ portId: expr.portId, env: true }];
  if (expr.kind === "binary")
    return [...collectRefs(expr.left), ...collectRefs(expr.right)];
  return [];
};

const expressionLabel = (
  expr: Expression | undefined,
  scope: IntentNode,
): string => {
  if (!expr) return "未绑定";
  if (expr.kind === "literal")
    return typeof expr.value === "string" ? `"${expr.value}"` : String(expr.value);
  if (expr.kind === "env")
    return `env.${scope.inputs.find((p) => p.id === expr.portId)?.name ?? expr.portId}`;
  if (expr.kind === "ref") {
    const node = scope.children?.find((n) => n.id === expr.nodeId);
    const port = node?.outputs.find((p) => p.id === expr.portId);
    return `${node?.name ?? "缺失节点"}.${port?.name ?? expr.portId}`;
  }
  return `(${expressionLabel(expr.left, scope)} ${expr.op} ${expressionLabel(expr.right, scope)})`;
};

const getNodeAtPath = (root: IntentNode, path: string[]) => {
  let current = root;
  for (const id of path.slice(1)) {
    const next = current.children?.find((node) => node.id === id);
    if (!next) break;
    current = next;
  }
  return current;
};

const updateAtPath = (
  root: IntentNode,
  path: string[],
  updater: (node: IntentNode) => IntentNode,
): IntentNode => {
  if (path.length === 1) return updater(root);
  const nextId = path[1];
  return {
    ...root,
    children: root.children?.map((child) =>
      child.id === nextId
        ? updateAtPath(child, path.slice(1), updater)
        : child,
    ),
  };
};

const cloneNode = (node: IntentNode): IntentNode => {
  const idMap = new Map<string, string>();
  const assign = (item: IntentNode) => {
    idMap.set(item.id, uid("intent"));
    item.children?.forEach(assign);
  };
  assign(node);
  const remapExpr = (expr?: Expression): Expression | undefined => {
    if (!expr) return undefined;
    if (expr.kind === "ref")
      return { ...expr, nodeId: idMap.get(expr.nodeId) ?? expr.nodeId };
    if (expr.kind === "binary")
      return { ...expr, left: remapExpr(expr.left)!, right: remapExpr(expr.right)! };
    return structuredClone(expr);
  };
  const copy = (item: IntentNode): IntentNode => ({
    ...structuredClone(item),
    id: idMap.get(item.id)!,
    name: item === node ? `${item.name} 副本` : item.name,
    inputs: item.inputs.map((port) => ({ ...port, binding: remapExpr(port.binding) })),
    outputs: item.outputs.map((port) => ({ ...port, mapping: remapExpr(port.mapping) })),
    children: item.children?.map(copy),
    position: { x: item.position.x + 28, y: item.position.y + 28 },
  });
  return copy(node);
};

const findCycle = (scope: IntentNode): string[] | null => {
  const children = scope.children ?? [];
  const graph = new Map<string, string[]>();
  children.forEach((child) => {
    graph.set(
      child.id,
      child.inputs.flatMap((input) =>
        collectRefs(input.binding).flatMap((ref) => (ref.nodeId ? [ref.nodeId] : [])),
      ),
    );
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    if (visiting.has(id)) return [...path, id];
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      const cycle = walk(dep, [...path, id]);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const child of children) {
    const cycle = walk(child.id, []);
    if (cycle) return cycle;
  }
  return null;
};

const evaluateExpression = (
  expr: Expression | undefined,
  env: Record<string, unknown>,
  results: Map<string, Record<string, unknown>>,
): unknown => {
  if (!expr) return undefined;
  if (expr.kind === "literal") return expr.value;
  if (expr.kind === "env") return env[expr.portId];
  if (expr.kind === "ref") return results.get(expr.nodeId)?.[expr.portId];
  const left = evaluateExpression(expr.left, env, results);
  const right = evaluateExpression(expr.right, env, results);
  switch (expr.op) {
    case "+":
      return Number(left) + Number(right);
    case "-":
      return Number(left) - Number(right);
    case "*":
      return Number(left) * Number(right);
    case "/":
      return Number(left) / Number(right);
    case "==":
      return left === right;
    case "&&":
      return Boolean(left) && Boolean(right);
    case "||":
      return Boolean(left) || Boolean(right);
  }
};

const runOperator = (
  node: IntentNode,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  const values = node.inputs.map((port) => inputs[port.id]);
  let value: unknown;
  switch (node.operator) {
    case "multiply":
      value = values.reduce<number>((total, item) => total * Number(item), 1);
      break;
    case "discount":
      value = Number(values[0]) * (String(values[1]).toUpperCase() === "VIP" ? 0.85 : 0.95);
      break;
    case "subtract":
      value = Number(values[0]) - Number(values[1]);
      break;
    case "concat":
      value = values.join("");
      break;
    case "object":
      value = Object.fromEntries(node.inputs.map((port, index) => [port.name, values[index]]));
      break;
    case "array":
      value = values;
      break;
    case "compare":
      value = values[0] === values[1];
      break;
    case "convert":
      value =
        node.outputs[0]?.type === "number"
          ? Number(values[0])
          : node.outputs[0]?.type === "boolean"
            ? Boolean(values[0])
            : String(values[0]);
      break;
    default:
      value = values[0];
  }
  return Object.fromEntries(node.outputs.map((port, index) => [port.id, index ? values[index] : value]));
};

const statusText: Record<Trace["status"], string> = {
  waiting: "等待",
  running: "运行中",
  success: "成功",
  failed: "失败",
  skipped: "跳过",
  cancelled: "已取消",
};

export default function Home() {
  const [doc, setDoc] = useState<IntentDocument>(() => sampleDocument());
  const [path, setPath] = useState<string[]>(["root"]);
  const [selectedId, setSelectedId] = useState<string>("scenario_flow");
  const [history, setHistory] = useState<IntentDocument[]>([]);
  const [future, setFuture] = useState<IntentDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const [trace, setTrace] = useState<Trace[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [rootInput, setRootInput] = useState<Record<string, unknown>>({
    product_goal: "构建一个需求方与实现方可共同验证、可持续演进的业务应用",
    business_constraints: {
      deterministic: true,
      auditable: true,
      moduleBoundary: "strict",
    },
    stakeholders: ["需求方", "产品设计", "工程实现"],
  });
  const [activeTab, setActiveTab] = useState<"properties" | "run">("properties");
  const [toast, setToast] = useState("");
  const [scopeMotion, setScopeMotion] = useState<ScopeMotion | null>(null);
  const [zoomCue, setZoomCue] = useState<ZoomCue | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasViewport = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined);
  const cameraTouched = useRef(false);
  const scopeLockUntil = useRef(0);
  const scopeTimers = useRef<number[]>([]);
  const thresholdIntent = useRef({
    direction: 0,
    armedAt: 0,
    travel: 0,
    lastAt: 0,
  });
  const cancelRun = useRef(false);
  const zoom = camera.scale;
  cameraRef.current = camera;

  const current = useMemo(() => getNodeAtPath(doc.rootIntent, path), [doc, path]);
  const selected =
    current.children?.find((node) => node.id === selectedId) ??
    (current.id === selectedId ? current : undefined);
  const cycle = useMemo(() => findCycle(current), [current]);
  const refs = useMemo(
    () =>
      (current.children ?? []).flatMap((child) =>
        child.inputs.flatMap((port) =>
          collectRefs(port.binding).map((ref) => ({ ...ref, targetId: child.id, targetPort: port.id })),
        ),
      ),
    [current],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const commit = (next: IntentDocument) => {
    setHistory((items) => [...items.slice(-24), doc]);
    setFuture([]);
    setDoc(next);
    setDirty(true);
  };

  const updateCurrent = (updater: (node: IntentNode) => IntentNode) =>
    commit({ ...doc, rootIntent: updateAtPath(doc.rootIntent, path, updater) });

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [doc, ...items]);
    setHistory((items) => items.slice(0, -1));
    setDoc(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, doc]);
    setFuture((items) => items.slice(1));
    setDoc(next);
  };

  const resetCamera = () => {
    const viewport = canvasViewport.current;
    const nextCamera = {
      scale: 1,
      x: viewport ? (viewport.clientWidth - 1000) / 2 : 0,
      y: viewport ? (viewport.clientHeight - 650) / 2 : 0,
    };
    cameraTouched.current = false;
    thresholdIntent.current = {
      direction: 0,
      armedAt: 0,
      travel: 0,
      lastAt: 0,
    };
    setZoomCue(null);
    cameraRef.current = nextCamera;
    setCamera(nextCamera);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(resetCamera);
    const viewport = canvasViewport.current;
    const observer = viewport
      ? new ResizeObserver(() => {
          if (!cameraTouched.current) resetCamera();
        })
      : undefined;
    if (viewport && observer) observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scopeTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!zoomCue) return;
    const timer = window.setTimeout(() => setZoomCue(null), 1400);
    return () => window.clearTimeout(timer);
  }, [zoomCue]);

  const navigateTo = (targetPath: string[]) => {
    setPath(targetPath);
    resetCamera();
    const node = getNodeAtPath(doc.rootIntent, targetPath);
    setSelectedId(node.children?.[0]?.id ?? node.id);
  };

  const enterNode = (node: IntentNode) => {
    let target = node;
    if (node.kind === "linkedModule" && node.moduleRef) {
      const module = doc.publishedModules.find(
        (item) =>
          item.moduleId === node.moduleRef?.moduleId && item.version === node.moduleRef?.version,
      );
      if (module) target = module.snapshot;
    }
    const viewport = canvasViewport.current;
    if (!viewport) {
      setPath((items) => [...items, node.id]);
      resetCamera();
      setSelectedId(target.children?.[0]?.id ?? target.id);
      return;
    }
    beginScopeTransition(
      [...path, node.id],
      "enter",
      getZoomAnchor(viewport),
      target,
    );
  };

  const getZoomAnchor = (
    viewport: HTMLDivElement,
    pointer?: { x: number; y: number },
  ) => {
    const viewportRect = viewport.getBoundingClientRect();
    const activeCamera = cameraRef.current;
    const renderedScale = activeCamera.scale;
    const stageRect = {
      left: viewportRect.left + activeCamera.x,
      top: viewportRect.top + activeCamera.y,
      right: viewportRect.left + activeCamera.x + 1000 * renderedScale,
      bottom: viewportRect.top + activeCamera.y + 650 * renderedScale,
    };
    const visibleLeft = Math.max(viewportRect.left, stageRect.left);
    const visibleTop = Math.max(viewportRect.top, stageRect.top);
    const visibleRight = Math.min(viewportRect.right, stageRect.right);
    const visibleBottom = Math.min(viewportRect.bottom, stageRect.bottom);
    const hasVisibleStage = visibleRight > visibleLeft && visibleBottom > visibleTop;
    const pointerIsVisible =
      pointer &&
      hasVisibleStage &&
      pointer.x >= visibleLeft &&
      pointer.x <= visibleRight &&
      pointer.y >= visibleTop &&
      pointer.y <= visibleBottom;
    const anchorClientX = pointerIsVisible
      ? pointer.x
      : hasVisibleStage
        ? (visibleLeft + visibleRight) / 2
        : (viewportRect.left + viewportRect.right) / 2;
    const anchorClientY = pointerIsVisible
      ? pointer.y
      : hasVisibleStage
        ? (visibleTop + visibleBottom) / 2
        : (viewportRect.top + viewportRect.bottom) / 2;

    return {
      stageX: hasVisibleStage
        ? Math.max(0, Math.min(1000, (anchorClientX - stageRect.left) / renderedScale))
        : 500,
      stageY: hasVisibleStage
        ? Math.max(0, Math.min(650, (anchorClientY - stageRect.top) / renderedScale))
        : 325,
      viewportX: anchorClientX - viewportRect.left,
      viewportY: anchorClientY - viewportRect.top,
    };
  };

  const applyAnchoredZoom = (
    nextZoom: number,
    anchor: ReturnType<typeof getZoomAnchor>,
  ) => {
    cameraTouched.current = true;
    const nextCamera = {
      scale: nextZoom,
      x: anchor.viewportX - anchor.stageX * nextZoom,
      y: anchor.viewportY - anchor.stageY * nextZoom,
    };
    cameraRef.current = nextCamera;
    setCamera(nextCamera);
  };

  const zoomFromControls = (delta: number) => {
    const viewport = canvasViewport.current;
    if (!viewport) return;
    clearThresholdIntent();
    const nextZoom = Math.max(0.5, Math.min(2, cameraRef.current.scale + delta));
    const anchor = getZoomAnchor(viewport);
    applyAnchoredZoom(nextZoom, anchor);

    if (delta > 0 && nextZoom >= 2) {
      const candidates = current.children ?? [];
      const nearest = candidates.length
        ? candidates.reduce((closest, node) => {
            const closestSize = getNodeSize(closest);
            const nodeSize = getNodeSize(node);
            const closestDistance =
              (closest.position.x + closestSize.width / 2 - anchor.stageX) ** 2 +
              (closest.position.y + closestSize.height / 2 - anchor.stageY) ** 2;
            const nodeDistance =
              (node.position.x + nodeSize.width / 2 - anchor.stageX) ** 2 +
              (node.position.y + nodeSize.height / 2 - anchor.stageY) ** 2;
            return nodeDistance < closestDistance ? node : closest;
          })
        : undefined;
      setZoomCue({
        mode: nearest ? "enter" : "limit",
        progress: nearest ? 0 : 1,
        x: anchor.viewportX,
        y: anchor.viewportY,
        title: nearest ? `靠近「${nearest.name}」` : "已在最深层",
        detail: nearest ? "Ctrl + 滚轮继续放大即可进入" : "可通过“添加子意图”继续扩展",
      });
    }

    if (delta < 0 && nextZoom <= 0.5) {
      const parent =
        path.length > 1
          ? getNodeAtPath(doc.rootIntent, path.slice(0, -1))
          : undefined;
      setZoomCue({
        mode: parent ? "exit" : "limit",
        progress: parent ? 0 : 1,
        x: anchor.viewportX,
        y: anchor.viewportY,
        title: parent ? `可返回「${parent.name}」` : "根意图概览",
        detail: parent ? "Ctrl + 滚轮继续缩小即可返回" : "已经位于最外层",
      });
    }
  };

  const fitCamera = () => {
    const viewport = canvasViewport.current;
    if (!viewport) return;
    clearThresholdIntent();
    const nextZoom = Math.max(
      0.5,
      Math.min(1, Math.min(viewport.clientWidth / 1000, viewport.clientHeight / 650) * 0.92),
    );
    cameraTouched.current = true;
    const nextCamera = {
      scale: nextZoom,
      x: (viewport.clientWidth - 1000 * nextZoom) / 2,
      y: (viewport.clientHeight - 650 * nextZoom) / 2,
    };
    cameraRef.current = nextCamera;
    setCamera(nextCamera);
  };

  const clearThresholdIntent = () => {
    thresholdIntent.current = {
      direction: 0,
      armedAt: 0,
      travel: 0,
      lastAt: 0,
    };
    setZoomCue(null);
  };

  const thresholdIsConfirmed = (direction: number, delta: number) => {
    const now = performance.now();
    const intent = thresholdIntent.current;
    const startsNewIntent =
      intent.direction !== direction || now - intent.lastAt > 420;

    if (startsNewIntent) {
      thresholdIntent.current = {
        direction,
        armedAt: now,
        travel: 0,
        lastAt: now,
      };
      return { confirmed: false, progress: 0 };
    }

    intent.travel += Math.abs(delta);
    intent.lastAt = now;
    return {
      confirmed: now - intent.armedAt >= 70 && intent.travel >= 54,
      progress: Math.min(1, intent.travel / 54),
    };
  };

  const beginScopeTransition = (
    targetPath: string[],
    direction: "enter" | "exit",
    anchor: ReturnType<typeof getZoomAnchor>,
    target?: IntentNode,
  ) => {
    if (performance.now() < scopeLockUntil.current) return;

    scopeLockUntil.current = performance.now() + 720;
    clearThresholdIntent();
    scopeTimers.current.forEach((timer) => window.clearTimeout(timer));
    scopeTimers.current = [];
    setScopeMotion({
      phase: direction === "enter" ? "enter-leave" : "exit-leave",
      originX: anchor.stageX,
      originY: anchor.stageY,
    });
    applyAnchoredZoom(direction === "enter" ? 2 : 0.5, anchor);

    scopeTimers.current.push(
      window.setTimeout(() => {
        const viewport = canvasViewport.current;
        const nextNode = target ?? getNodeAtPath(doc.rootIntent, targetPath);
        setPath(targetPath);
        setSelectedId(nextNode.children?.[0]?.id ?? nextNode.id);
        cameraTouched.current = false;
        const nextCamera = {
          scale: 1,
          x: viewport ? (viewport.clientWidth - 1000) / 2 : 0,
          y: viewport ? (viewport.clientHeight - 650) / 2 : 0,
        };
        cameraRef.current = nextCamera;
        setCamera(nextCamera);
        setScopeMotion({
          phase: direction === "enter" ? "enter-arrive" : "exit-arrive",
          originX: direction === "enter" ? 500 : anchor.stageX,
          originY: direction === "enter" ? 325 : anchor.stageY,
        });

        scopeTimers.current.push(
          window.setTimeout(() => setScopeMotion(null), 260),
        );
      }, 170),
    );
  };

  const handleCanvasWheel = (event: WheelEvent) => {
    event.preventDefault();

    if (performance.now() < scopeLockUntil.current) return;

    if (!event.ctrlKey) {
      clearThresholdIntent();
      const horizontalDelta =
        event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
      const verticalDelta = event.shiftKey ? 0 : event.deltaY;
      cameraTouched.current = true;
      setCamera((value) => {
        const nextCamera = {
          ...value,
          x: value.x - horizontalDelta,
          y: value.y - verticalDelta,
        };
        cameraRef.current = nextCamera;
        return nextCamera;
      });
      return;
    }

    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.max(
      0.5,
      Math.min(2, cameraRef.current.scale * Math.exp(-event.deltaY * 0.002)),
    );
    const viewport = canvasViewport.current;
    if (!viewport) return;
    const anchor = getZoomAnchor(viewport, { x: event.clientX, y: event.clientY });

    if (direction > 0 && nextZoom >= 2) {
      const candidates = current.children ?? [];

      applyAnchoredZoom(2, anchor);
      if (candidates.length > 0) {
        const nearest = candidates.reduce((closest, node) => {
          const closestSize = getNodeSize(closest);
          const nodeSize = getNodeSize(node);
          const closestDistance =
            (closest.position.x + closestSize.width / 2 - anchor.stageX) ** 2 +
            (closest.position.y + closestSize.height / 2 - anchor.stageY) ** 2;
          const nodeDistance =
            (node.position.x + nodeSize.width / 2 - anchor.stageX) ** 2 +
            (node.position.y + nodeSize.height / 2 - anchor.stageY) ** 2;
          return nodeDistance < closestDistance ? node : closest;
        });
        const intent = thresholdIsConfirmed(direction, event.deltaY);
        setZoomCue({
          mode: "enter",
          progress: intent.progress,
          x: anchor.viewportX,
          y: anchor.viewportY,
          title: `进入「${nearest.name}」`,
          detail: intent.progress > 0 ? "继续放大以确认" : "已到 200% · 再向内滚动",
        });
        if (intent.confirmed) {
          beginScopeTransition([...path, nearest.id], "enter", anchor, nearest);
          return;
        }
      } else {
        clearThresholdIntent();
        setZoomCue({
          mode: "limit",
          progress: 1,
          x: anchor.viewportX,
          y: anchor.viewportY,
          title: "已在最深层",
          detail: "可通过“添加子意图”继续扩展",
        });
      }
      return;
    }

    if (direction < 0 && nextZoom <= 0.5 && path.length > 1) {
      applyAnchoredZoom(0.5, anchor);
      const parent = getNodeAtPath(doc.rootIntent, path.slice(0, -1));
      const intent = thresholdIsConfirmed(direction, event.deltaY);
      setZoomCue({
        mode: "exit",
        progress: intent.progress,
        x: anchor.viewportX,
        y: anchor.viewportY,
        title: `返回「${parent.name}」`,
        detail: intent.progress > 0 ? "继续缩小以确认" : "已到 50% · 再向外滚动",
      });
      if (intent.confirmed) {
        beginScopeTransition(path.slice(0, -1), "exit", anchor);
      }
      return;
    }

    if (direction < 0 && nextZoom <= 0.5) {
      applyAnchoredZoom(0.5, anchor);
      clearThresholdIntent();
      setZoomCue({
        mode: "limit",
        progress: 1,
        x: anchor.viewportX,
        y: anchor.viewportY,
        title: "根意图概览",
        detail: "已经位于最外层",
      });
      return;
    }

    clearThresholdIntent();
    applyAnchoredZoom(nextZoom, anchor);
  };

  wheelHandlerRef.current = handleCanvasWheel;

  useEffect(() => {
    const viewport = canvasViewport.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => wheelHandlerRef.current(event);
    viewport.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () =>
      viewport.removeEventListener("wheel", handleWheel, {
        capture: true,
      });
  }, []);

  const sourceOptions = (scope: IntentNode) => [
    ...scope.inputs.map((port) => ({
      value: `env:${port.id}`,
      label: `环境 · ${port.name}`,
      expr: { kind: "env", portId: port.id } as Expression,
    })),
    ...(scope.children ?? []).flatMap((node) =>
      node.outputs.map((port) => ({
        value: `ref:${node.id}:${port.id}`,
        label: `${node.name} · ${port.name}`,
        expr: { kind: "ref", nodeId: node.id, portId: port.id } as Expression,
      })),
    ),
  ];

  const setInputBinding = (nodeId: string, portId: string, value: string) => {
    const option = sourceOptions(current).find((item) => item.value === value);
    if (!option) return;
    updateCurrent((scope) => ({
      ...scope,
      children: scope.children?.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              inputs: node.inputs.map((port) =>
                port.id === portId ? { ...port, binding: option.expr } : port,
              ),
            }
          : node,
      ),
    }));
  };

  const previewNodeFrame = (
    nodeId: string,
    position: { x: number; y: number },
    size?: { width: number; height: number },
  ) =>
    setDoc((activeDocument) => ({
      ...activeDocument,
      rootIntent: updateAtPath(activeDocument.rootIntent, path, (scope) => ({
        ...scope,
        children: scope.children?.map((child) =>
          child.id === nodeId
            ? {
                ...child,
                position,
                size: size ?? child.size,
              }
            : child,
        ),
      })),
    }));

  const moveNode = (
    nodeId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    const originX = event.clientX;
    const originY = event.clientY;
    const node = current.children?.find((child) => child.id === nodeId);
    if (!node) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = node.position;
    const size = getNodeSize(node);
    const target = event.currentTarget;
    const positionFromEvent = (pointerEvent: PointerEvent) => ({
      x: Math.max(
        NODE_BOUNDS.left,
        Math.min(
          NODE_BOUNDS.right - size.width,
          start.x + (pointerEvent.clientX - originX) / cameraRef.current.scale,
        ),
      ),
      y: Math.max(
        NODE_BOUNDS.top,
        Math.min(
          NODE_BOUNDS.bottom - size.height,
          start.y + (pointerEvent.clientY - originY) / cameraRef.current.scale,
        ),
      ),
    });
    let latestPosition = { ...start };
    const onMove = (moveEvent: PointerEvent) => {
      latestPosition = positionFromEvent(moveEvent);
      target.style.left = `${latestPosition.x}px`;
      target.style.top = `${latestPosition.y}px`;
      previewNodeFrame(nodeId, latestPosition);
    };
    const onUp = (upEvent: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      const nextPosition =
        upEvent.type === "pointercancel" ? latestPosition : positionFromEvent(upEvent);
      updateCurrent((scope) => ({
        ...scope,
        children: scope.children?.map((child) =>
          child.id === nodeId ? { ...child, position: nextPosition } : child,
        ),
      }));
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const resizeNode = (
    nodeId: string,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = current.children?.find((child) => child.id === nodeId);
    if (!node) return;

    const handle = event.currentTarget;
    const target = handle.parentElement as HTMLButtonElement | null;
    if (!target) return;
    handle.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    const startSize = getNodeSize(node);
    const minimumHeight = getNodeMinimumHeight(node);
    const startLeft = node.position.x;
    const startTop = node.position.y;
    const startRight = startLeft + startSize.width;
    const startBottom = startTop + startSize.height;

    const rectFromEvent = (pointerEvent: PointerEvent) => {
      const dx = (pointerEvent.clientX - originX) / cameraRef.current.scale;
      const dy = (pointerEvent.clientY - originY) / cameraRef.current.scale;
      let left = startLeft;
      let right = startRight;
      let top = startTop;
      let bottom = startBottom;

      if (direction.includes("w")) {
        left = Math.max(
          NODE_BOUNDS.left,
          Math.min(startRight - MIN_NODE_SIZE.width, startLeft + dx),
        );
        if (startRight - left > MAX_NODE_SIZE.width)
          left = startRight - MAX_NODE_SIZE.width;
      }
      if (direction.includes("e")) {
        right = Math.min(
          NODE_BOUNDS.right,
          Math.max(startLeft + MIN_NODE_SIZE.width, startRight + dx),
        );
        if (right - startLeft > MAX_NODE_SIZE.width)
          right = startLeft + MAX_NODE_SIZE.width;
      }
      if (direction.includes("n")) {
        top = Math.max(
          NODE_BOUNDS.top,
          Math.min(startBottom - minimumHeight, startTop + dy),
        );
        if (startBottom - top > MAX_NODE_SIZE.height)
          top = startBottom - MAX_NODE_SIZE.height;
      }
      if (direction.includes("s")) {
        bottom = Math.min(
          NODE_BOUNDS.bottom,
          Math.max(startTop + minimumHeight, startBottom + dy),
        );
        if (bottom - startTop > MAX_NODE_SIZE.height)
          bottom = startTop + MAX_NODE_SIZE.height;
      }

      return {
        position: { x: left, y: top },
        size: { width: right - left, height: bottom - top },
      };
    };

    const applyRect = (rect: ReturnType<typeof rectFromEvent>) => {
      target.style.left = `${rect.position.x}px`;
      target.style.top = `${rect.position.y}px`;
      target.style.width = `${rect.size.width}px`;
      target.style.height = `${rect.size.height}px`;
    };
    let latestRect = {
      position: { x: startLeft, y: startTop },
      size: { ...startSize },
    };
    const onMove = (moveEvent: PointerEvent) => {
      latestRect = rectFromEvent(moveEvent);
      applyRect(latestRect);
      previewNodeFrame(nodeId, latestRect.position, latestRect.size);
    };
    const onUp = (upEvent: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      const nextRect =
        upEvent.type === "pointercancel" ? latestRect : rectFromEvent(upEvent);
      applyRect(nextRect);
      updateCurrent((scope) => ({
        ...scope,
        children: scope.children?.map((child) =>
          child.id === nodeId
            ? {
                ...child,
                position: nextRect.position,
                size: nextRect.size,
              }
            : child,
        ),
      }));
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const toggleResizeMode = (nodeId: string) => {
    updateCurrent((scope) => ({
      ...scope,
      children: scope.children?.map((child) =>
        child.id === nodeId
          ? {
              ...child,
              resizeMode: getResizeMode(child) === "simple" ? "full" : "simple",
            }
          : child,
      ),
    }));
    setSelectedId(nodeId);
  };

  const addOperator = () => {
    if (current.kind === "linkedModule") return;
    const node: IntentNode = {
      id: uid("intent"),
      name: "新意图",
      description: "配置这个叶子意图的输入、输出与内置算子。",
      kind: "operator",
      operator: "identity",
      inputs: [
        {
          id: uid("input"),
          name: "输入",
          type: "any",
          binding: current.inputs[0]
            ? { kind: "env", portId: current.inputs[0].id }
            : { kind: "literal", value: null },
        },
      ],
      outputs: [{ id: uid("output"), name: "结果", type: "any" }],
      position: { x: 360, y: 390 },
    };
    updateCurrent((scope) =>
      scope.kind === "operator"
        ? {
            ...scope,
            kind: "composite",
            operator: undefined,
            children: [node],
          }
        : { ...scope, children: [...(scope.children ?? []), node] },
    );
    setSelectedId(node.id);
  };

  const duplicateSelected = () => {
    if (!selected || selected.id === current.id) return;
    const copy = cloneNode(selected);
    updateCurrent((scope) => ({ ...scope, children: [...(scope.children ?? []), copy] }));
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selected || selected.id === current.id) return;
    updateCurrent((scope) => ({
      ...scope,
      children: scope.children?.filter((node) => node.id !== selected.id),
    }));
    setSelectedId(current.id);
  };

  const autoLayout = () =>
    updateCurrent((scope) => ({
      ...scope,
      children: scope.children?.map((node, index) => ({
        ...node,
        position: {
          x: 270 + (index % 3) * 235,
          y: 88 + Math.floor(index / 3) * 190,
        },
      })),
    }));

  const publishModule = () => {
    if (cycle) {
      setToast("存在循环依赖，无法发布");
      return;
    }
    const source = selected ?? current;
    const related = doc.publishedModules.filter((item) => item.name === source.name);
    const version = related.length ? Math.max(...related.map((item) => item.version)) + 1 : 1;
    const moduleId = related[0]?.moduleId ?? uid("module");
    commit({
      ...doc,
      publishedModules: [
        ...doc.publishedModules,
        {
          moduleId,
          name: source.name,
          version,
          publishedAt: "刚刚",
          snapshot: structuredClone(source),
        },
      ],
    });
    setToast(`${source.name} 已发布为 v${version}`);
  };

  const insertModule = (module: PublishedModule) => {
    const instance: IntentNode = {
      ...structuredClone(module.snapshot),
      id: uid("linked"),
      name: `${module.name} 实例`,
      kind: "linkedModule",
      moduleRef: { moduleId: module.moduleId, version: module.version },
      children: undefined,
      position: { x: 410, y: 420 },
      inputs: module.snapshot.inputs.map((port, index) => ({
        ...port,
        binding: current.inputs[index]
          ? { kind: "env", portId: current.inputs[index].id }
          : { kind: "literal", value: null },
      })),
    };
    updateCurrent((scope) => ({ ...scope, children: [...(scope.children ?? []), instance] }));
    setSelectedId(instance.id);
  };

  const detachModule = () => {
    if (!selected?.moduleRef) return;
    const module = doc.publishedModules.find(
      (item) =>
        item.moduleId === selected.moduleRef?.moduleId &&
        item.version === selected.moduleRef?.version,
    );
    if (!module) return;
    updateCurrent((scope) => ({
      ...scope,
      children: scope.children?.map((node) =>
        node.id === selected.id
          ? {
              ...structuredClone(module.snapshot),
              id: node.id,
              name: node.name.replace(" 实例", ""),
              position: node.position,
              size: node.size,
              resizeMode: node.resizeMode,
              inputs: node.inputs,
              moduleRef: undefined,
              kind: module.snapshot.kind,
            }
          : node,
      ),
    }));
    setToast("已脱离模块，成为独立意图");
  };

  const exportDocument = () => {
    if (cycle) {
      setToast("请先解除循环依赖");
      return;
    }
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "intent-map.intent-map.json";
    link.click();
    URL.revokeObjectURL(url);
    setDirty(false);
  };

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as IntentDocument;
      if (
        parsed.version !== 1 ||
        !parsed.rootIntent?.id ||
        !Array.isArray(parsed.publishedModules)
      )
        throw new Error("invalid");
      setHistory((items) => [...items, doc]);
      setDoc(parsed);
      setPath([parsed.rootIntent.id]);
      setSelectedId(parsed.rootIntent.children?.[0]?.id ?? parsed.rootIntent.id);
      setDirty(false);
      setToast("意图地图已导入");
    } catch {
      setToast("文件无效，当前地图未被覆盖");
    }
    event.target.value = "";
  };

  const executeNode = async (
    node: IntentNode,
    env: Record<string, unknown>,
    parentPath: string,
  ): Promise<Record<string, unknown>> => {
    const started = performance.now();
    const traceId = `${parentPath}/${node.id}`;
    setTrace((items) => [
      ...items,
      { id: traceId, name: node.name, path: traceId, status: "running" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (cancelRun.current) throw new Error("cancelled");
    try {
      let output: Record<string, unknown>;
      if (node.kind === "operator") {
        output = runOperator(node, env);
      } else if (node.kind === "linkedModule" && node.moduleRef) {
        const module = doc.publishedModules.find(
          (item) =>
            item.moduleId === node.moduleRef?.moduleId &&
            item.version === node.moduleRef?.version,
        );
        if (!module) throw new Error("找不到模块版本");
        output = await executeScope(module.snapshot, env, traceId);
      } else {
        output = await executeScope(node, env, traceId);
      }
      setTrace((items) =>
        items.map((item) =>
          item.id === traceId
            ? {
                ...item,
                status: "success",
                duration: Math.round(performance.now() - started),
                output,
              }
            : item,
        ),
      );
      return output;
    } catch (error) {
      const cancelled = error instanceof Error && error.message === "cancelled";
      setTrace((items) =>
        items.map((item) =>
          item.id === traceId
            ? {
                ...item,
                status: cancelled ? "cancelled" : "failed",
                duration: Math.round(performance.now() - started),
                error: error instanceof Error ? error.message : "执行失败",
              }
            : item,
        ),
      );
      throw error;
    }
  };

  const executeScope = async (
    scope: IntentNode,
    env: Record<string, unknown>,
    parentPath: string,
  ): Promise<Record<string, unknown>> => {
    const results = new Map<string, Record<string, unknown>>();
    const pending = new Set((scope.children ?? []).map((node) => node.id));
    while (pending.size) {
      const ready = (scope.children ?? []).filter((node) => {
        if (!pending.has(node.id)) return false;
        const dependencies = node.inputs.flatMap((input) =>
          collectRefs(input.binding).flatMap((ref) => (ref.nodeId ? [ref.nodeId] : [])),
        );
        return dependencies.every((id) => results.has(id));
      });
      if (!ready.length) throw new Error("检测到循环依赖");
      await Promise.all(
        ready.map(async (node) => {
          const inputs = Object.fromEntries(
            node.inputs.map((port) => [
              port.id,
              evaluateExpression(port.binding, env, results),
            ]),
          );
          const output = await executeNode(node, inputs, parentPath);
          results.set(node.id, output);
          pending.delete(node.id);
        }),
      );
    }
    return Object.fromEntries(
      scope.outputs.map((port) => [
        port.id,
        evaluateExpression(port.mapping, env, results),
      ]),
    );
  };

  const run = async () => {
    if (cycle) {
      setToast("存在循环依赖，无法运行");
      return;
    }
    cancelRun.current = false;
    setTrace([]);
    setActiveTab("run");
    setRunState("running");
    try {
      const result = await executeScope(doc.rootIntent, rootInput, doc.rootIntent.name);
      setTrace((items) => [
        ...items,
        {
          id: "root-output",
          name: "根意图输出",
          path: doc.rootIntent.name,
          status: "success",
          duration: 0,
          output: result,
        },
      ]);
      setRunState("success");
    } catch (error) {
      setRunState(error instanceof Error && error.message === "cancelled" ? "idle" : "failed");
    }
  };

  const stop = () => {
    cancelRun.current = true;
    setRunState("idle");
    setTrace((items) =>
      items.map((item) =>
        item.status === "running" || item.status === "waiting"
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
  };

  const sourcePosition = (ref: { nodeId?: string; portId: string; env?: boolean }) => {
    if (ref.env) {
      const index = current.inputs.findIndex((port) => port.id === ref.portId);
      return { x: 178, y: 115 + Math.max(index, 0) * 116 };
    }
    const source = current.children?.find((node) => node.id === ref.nodeId);
    const outputIndex = source?.outputs.findIndex((port) => port.id === ref.portId) ?? -1;
    return source
      ? {
          x: getNodePortAnchorX(source, "output"),
          y:
            source.position.y +
            getNodePortY(Math.max(outputIndex, 0)),
        }
      : { x: 0, y: 0 };
  };

  const renderTree = (node: IntentNode, nodePath: string[], depth = 0): React.ReactNode => {
    const matches =
      !search ||
      node.name.toLowerCase().includes(search.toLowerCase()) ||
      node.children?.some((child) => child.name.toLowerCase().includes(search.toLowerCase()));
    if (!matches) return null;
    return (
      <div key={node.id}>
        <button
          className={`tree-item ${path.at(-1) === node.id ? "active" : ""}`}
          style={{ paddingLeft: 12 + depth * 17 }}
          onClick={() => navigateTo(nodePath)}
        >
          <span className={`tree-caret ${node.children?.length ? "" : "empty"}`}>⌄</span>
          <span className={`kind-dot kind-${node.kind}`} />
          <span>{node.name}</span>
          {node.moduleRef && <small>v{node.moduleRef.version}</small>}
        </button>
        {node.children?.map((child) => renderTree(child, [...nodePath, child.id], depth + 1))}
      </div>
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Intent Map</span>
          <span className="version-chip">分形运行时 · v0.1</span>
        </div>
        <nav className="toolbar" aria-label="地图工具">
          <button onClick={() => {
            const next = sampleDocument();
            setHistory((items) => [...items, doc]);
            setDoc(next);
            setPath(["root"]);
            setSelectedId(next.rootIntent.children?.[0]?.id ?? next.rootIntent.id);
            setDirty(false);
          }}>新建</button>
          <button onClick={() => fileInput.current?.click()}>导入</button>
          <button onClick={exportDocument} disabled={Boolean(cycle)}>导出</button>
          <span className="toolbar-divider" />
          <button onClick={undo} disabled={!history.length} aria-label="撤销">↶</button>
          <button onClick={redo} disabled={!future.length} aria-label="重做">↷</button>
          <span className="toolbar-divider" />
          <button onClick={autoLayout}>自动布局</button>
          <button onClick={publishModule}>发布模块</button>
        </nav>
        <div className="run-actions">
          {runState === "running" ? (
            <button className="stop-button" onClick={stop}>■ 停止</button>
          ) : (
            <button className="run-button" onClick={run}>▶ 运行</button>
          )}
          <span className={`save-state ${dirty ? "dirty" : ""}`}>
            <i />{dirty ? "未导出" : "已同步到文件"}
          </span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.intent-map.json"
          onChange={importDocument}
          hidden
        />
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>意图结构</span>
            <button
              aria-label="新增叶子意图"
              onClick={addOperator}
              disabled={current.kind === "linkedModule"}
            >
              ＋
            </button>
          </div>
          <label className="search-field">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索意图或端口"
            />
          </label>
          <div className="tree-scroll">
            {renderTree(doc.rootIntent, [doc.rootIntent.id])}
          </div>
          <section className="module-section">
            <div className="panel-heading">
              <span>已发布模块</span>
              <span className="count-chip">{doc.publishedModules.length}</span>
            </div>
            {doc.publishedModules
              .slice()
              .reverse()
              .slice(0, 4)
              .map((module) => (
                <button
                  className="module-row"
                  key={`${module.moduleId}-${module.version}`}
                  onClick={() => insertModule(module)}
                >
                  <span className="module-icon">◇</span>
                  <span>
                    <strong>{module.name}</strong>
                    <small>v{module.version} · {module.publishedAt}</small>
                  </span>
                  <span className="insert-module">＋</span>
                </button>
              ))}
          </section>
          <section className="validation-section">
            <div className="panel-heading"><span>静态校验</span></div>
            <div className={`validation-row ${cycle ? "error" : "ok"}`}>
              <span>{cycle ? "!" : "✓"}</span>
              <div>
                <strong>{cycle ? "发现循环依赖" : "作用域有效"}</strong>
                <small>{cycle ? cycle.join(" → ") : "可见性、端口与依赖均有效"}</small>
              </div>
            </div>
          </section>
        </aside>

        <section className="center-panel">
          <div className="crumbbar">
            <button className="home-crumb" onClick={() => navigateTo([doc.rootIntent.id])}>⌂</button>
            {path.map((id, index) => {
              const crumbNode = getNodeAtPath(doc.rootIntent, path.slice(0, index + 1));
              return (
                <span key={id}>
                  <b>›</b>
                  <button onClick={() => navigateTo(path.slice(0, index + 1))}>
                    {crumbNode.name}
                  </button>
                </span>
              );
            })}
            <span className="scope-note">严格模块边界 · 仅显示直属子意图</span>
          </div>
          <div className="canvas-toolbar">
            <span className="scope-badge">{current.kind.toUpperCase()}</span>
            <strong>{current.name}</strong>
            <span>{current.inputs.length} 输入</span>
            <span>{current.outputs.length} 输出</span>
            <div className="zoom-controls">
              <button aria-label="缩小画布" title="缩小" onClick={() => zoomFromControls(-0.1)}>−</button>
              <button
                className="zoom-value"
                aria-label="重置为 100%"
                title="重置为 100%"
                onClick={resetCamera}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button aria-label="放大画布" title="放大" onClick={() => zoomFromControls(0.1)}>＋</button>
              <button className="fit-button" onClick={fitCamera} title="完整显示当前容器">
                适应
              </button>
            </div>
          </div>
          <div
            ref={canvasViewport}
            className={`canvas-viewport ${zoom <= 0.72 ? "overview-mode" : ""} ${scopeMotion ? `scope-motion ${scopeMotion.phase}` : ""}`}
            style={
              scopeMotion
                ? ({
                    "--scope-origin-x": `${(scopeMotion.originX / 1000) * 100}%`,
                    "--scope-origin-y": `${(scopeMotion.originY / 650) * 100}%`,
                  } as CSSProperties)
                : undefined
            }
          >
            <div
              className="canvas-scale"
              style={{
                transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`,
              }}
            >
              <div className="canvas-stage" aria-label={`${current.name} 内部意图地图`}>
                <svg className="edges" viewBox="0 0 1000 650" role="img" aria-label="由输入绑定动态推导的依赖连线">
                  <defs>
                    <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                    </marker>
                    <marker id="arrow-purple" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                    </marker>
                  </defs>
                  {refs.map((ref, index) => {
                    const source = sourcePosition(ref);
                    const target = current.children?.find((node) => node.id === ref.targetId);
                    if (!target) return null;
                    const targetPortIndex = target.inputs.findIndex(
                      (port) => port.id === ref.targetPort,
                    );
                    const tx = getNodePortAnchorX(target, "input");
                    const ty =
                      target.position.y +
                      getNodePortY(Math.max(targetPortIndex, 0));
                    const bend = Math.max(45, (tx - source.x) * 0.45);
                    return (
                      <path
                        key={`${ref.targetId}-${ref.targetPort}-${index}`}
                        className={ref.env ? "edge-input" : "edge-compute"}
                        d={`M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${tx - bend} ${ty}, ${tx} ${ty}`}
                        markerEnd={`url(#${ref.env ? "arrow-blue" : "arrow-purple"})`}
                      />
                    );
                  })}
                  {current.outputs.flatMap((port, outputIndex) =>
                    collectRefs(port.mapping).map((ref, index) => {
                      const source = sourcePosition(ref);
                      const targetY = 170 + outputIndex * 116;
                      return (
                        <path
                          key={`output-${port.id}-${index}`}
                          className="edge-output"
                          d={`M ${source.x} ${source.y} C ${source.x + 55} ${source.y}, 865 ${targetY}, 900 ${targetY}`}
                          markerEnd="url(#arrow-purple)"
                        />
                      );
                    }),
                  )}
                </svg>

                <div className="container-caption">
                  <span>当前容器</span>
                  <strong>{current.name}</strong>
                  <small>{current.description}</small>
                </div>

                <div className="environment-stack">
                  <div className="stack-label">环境输入</div>
                  {current.inputs.map((port) => (
                    <button
                      key={port.id}
                      className="intent-node env-node"
                      onClick={() => setSelectedId(current.id)}
                    >
                      <span className="node-topline"><b>ENV</b><i /></span>
                      <strong>{port.name}</strong>
                      <span className="port-line"><em>{port.type}</em><i /></span>
                    </button>
                  ))}
                </div>

                {(current.children ?? []).map((node) => {
                  const size = getNodeSize(node);
                  const resizeMode = getResizeMode(node);
                  const visibleDirections =
                    resizeMode === "full" ? resizeDirections : simpleResizeDirections;
                  const isSelected = selectedId === node.id;
                  return (
                    <Fragment key={node.id}>
                      <button
                        className={`intent-node graph-node kind-${node.kind} ${isSelected ? "selected" : ""} ${trace.some((item) => item.name === node.name && item.status === "success") ? "executed" : ""}`}
                        style={{
                          left: node.position.x,
                          top: node.position.y,
                          width: size.width,
                          height: size.height,
                        }}
                        onClick={() => setSelectedId(node.id)}
                        onDoubleClick={() => enterNode(node)}
                        onPointerDown={(event) => moveNode(node.id, event)}
                      >
                        <span className="node-topline">
                          <b>{node.kind === "operator" ? node.operator?.toUpperCase() : node.kind === "linkedModule" ? "LINKED" : "COMPOSITE"}</b>
                          {node.moduleRef ? <em>v{node.moduleRef.version}</em> : <i />}
                        </span>
                        <strong>{node.name}</strong>
                        <small>{node.description}</small>
                        <span className="node-interface-list input-interface-list">
                          {node.inputs.map((port, portIndex) => (
                            <span
                              key={port.id}
                              className="node-interface-port input-interface-port"
                              style={{
                                top: getNodePortY(portIndex) - NODE_PORT_SIZE.height / 2,
                              }}
                              title={port.name}
                            >
                              <span className="node-port-dot" />
                              <span className="node-port-name">{port.name}</span>
                            </span>
                          ))}
                        </span>
                        <span className="node-interface-list output-interface-list">
                          {node.outputs.map((port, portIndex) => (
                            <span
                              key={port.id}
                              className="node-interface-port output-interface-port"
                              style={{
                                top: getNodePortY(portIndex) - NODE_PORT_SIZE.height / 2,
                              }}
                              title={port.name}
                            >
                              <span className="node-port-name">{port.name}</span>
                              <span className="node-port-dot" />
                            </span>
                          ))}
                        </span>
                        <span className="node-ports">
                          <span>{node.inputs.length} in</span>
                          <span>{node.outputs.length} out</span>
                        </span>
                        {visibleDirections.map((direction) => (
                          <span
                            key={direction}
                            className={`resize-handle resize-${direction}`}
                            aria-hidden="true"
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => resizeNode(node.id, direction, event)}
                          />
                        ))}
                      </button>
                      <button
                        className={`resize-mode-toggle ${resizeMode} ${isSelected ? "selected" : ""}`}
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
                        onClick={() => toggleResizeMode(node.id)}
                      >
                        {resizeMode === "simple" ? "┘" : "⤢"}
                      </button>
                    </Fragment>
                  );
                })}

                <div className="output-stack">
                  <div className="stack-label">父级输出</div>
                  {current.outputs.map((port) => (
                    <button
                      key={port.id}
                      className="intent-node output-node"
                      onClick={() => setSelectedId(current.id)}
                    >
                      <span className="node-topline"><b>EXPORT</b><i /></span>
                      <strong>{port.name}</strong>
                      <span className="port-line"><i /><em>{port.type}</em></span>
                    </button>
                  ))}
                </div>

                {current.kind !== "linkedModule" && !current.children?.length && (
                  <button className="empty-canvas" onClick={addOperator}>
                    <span>＋</span>
                    添加第一个子意图
                  </button>
                )}
              </div>
            </div>
            {zoomCue && (
              <div
                className={`zoom-cue ${zoomCue.mode}`}
                style={{
                  left: Math.max(118, Math.min(zoomCue.x, (canvasViewport.current?.clientWidth ?? 236) - 118)),
                  top: Math.max(54, Math.min(zoomCue.y, (canvasViewport.current?.clientHeight ?? 108) - 54)),
                }}
                role="status"
              >
                <span className="zoom-cue-icon">
                  {zoomCue.mode === "enter" ? "↘" : zoomCue.mode === "exit" ? "↖" : "◎"}
                </span>
                <span>
                  <strong>{zoomCue.title}</strong>
                  <small>{zoomCue.detail}</small>
                </span>
                <i style={{ transform: `scaleX(${zoomCue.progress})` }} />
              </div>
            )}
          </div>
          <div className="canvas-status">
            <span><i className="blue-dot" /> 数据输入</span>
            <span><i className="purple-dot" /> 计算 / 导出</span>
            <span>{refs.length + current.outputs.length} 条派生连线</span>
            <span className="status-right">Ctrl + 滚轮 50%–200% · 到达阈值切换层级</span>
          </div>
        </section>

        <aside className="right-panel">
          <div className="right-tabs">
            <button className={activeTab === "properties" ? "active" : ""} onClick={() => setActiveTab("properties")}>属性</button>
            <button className={activeTab === "run" ? "active" : ""} onClick={() => setActiveTab("run")}>
              运行追踪
              {trace.length > 0 && <span>{trace.length}</span>}
            </button>
          </div>

          {activeTab === "properties" ? (
            <div className="inspector-scroll">
              {selected ? (
                <>
                  <div className="inspector-title">
                    <span className={`large-kind kind-${selected.kind}`}>{selected.kind === "operator" ? "ƒ" : "◇"}</span>
                    <div>
                      <small>{selected.kind === "operator" ? "叶子意图" : selected.kind === "linkedModule" ? "链接模块" : "复合意图"}</small>
                      <strong>{selected.name}</strong>
                    </div>
                    <button aria-label="更多操作">•••</button>
                  </div>
                  <label className="field-label">
                    名称
                    <input
                      value={selected.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (selected.id === current.id) {
                          updateCurrent((node) => ({ ...node, name: value }));
                        } else {
                          updateCurrent((scope) => ({
                            ...scope,
                            children: scope.children?.map((node) =>
                              node.id === selected.id ? { ...node, name: value } : node,
                            ),
                          }));
                        }
                      }}
                    />
                  </label>
                  <label className="field-label">
                    描述
                    <textarea
                      value={selected.description}
                      rows={3}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (selected.id === current.id) {
                          updateCurrent((node) => ({ ...node, description: value }));
                        } else {
                          updateCurrent((scope) => ({
                            ...scope,
                            children: scope.children?.map((node) =>
                              node.id === selected.id ? { ...node, description: value } : node,
                            ),
                          }));
                        }
                      }}
                    />
                  </label>
                  {selected.kind === "operator" && (
                    <label className="field-label">
                      内置算子
                      <select
                        value={selected.operator}
                        onChange={(event) => {
                          const operator = event.target.value as Operator;
                          updateCurrent((scope) => ({
                            ...scope,
                            children: scope.children?.map((node) =>
                              node.id === selected.id ? { ...node, operator } : node,
                            ),
                          }));
                        }}
                      >
                        <option value="identity">透传 identity</option>
                        <option value="multiply">数值相乘 multiply</option>
                        <option value="discount">等级折扣 discount</option>
                        <option value="subtract">数值相减 subtract</option>
                        <option value="concat">文本拼接 concat</option>
                        <option value="object">对象构造 object</option>
                        <option value="array">数组构造 array</option>
                        <option value="compare">比较 compare</option>
                        <option value="convert">类型转换 convert</option>
                      </select>
                    </label>
                  )}
                  <div className="section-title">
                    <span>输入绑定</span>
                    <button>＋ 输入</button>
                  </div>
                  <div className="binding-list">
                    {selected.inputs.map((port) => {
                      const ref = collectRefs(port.binding)[0];
                      const sourceValue = ref?.env
                        ? `env:${ref.portId}`
                        : ref?.nodeId
                          ? `ref:${ref.nodeId}:${ref.portId}`
                          : "";
                      return (
                        <div className="binding-card" key={port.id}>
                          <div>
                            <strong>{port.name}</strong>
                            <span className="type-chip">{port.type}</span>
                          </div>
                          {selected.id !== current.id ? (
                            <select
                              value={sourceValue}
                              onChange={(event) => setInputBinding(selected.id, port.id, event.target.value)}
                            >
                              <option value="">未绑定</option>
                              {sourceOptions(current)
                                .filter((option) => !option.value.includes(`:${selected.id}:`))
                                .map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                          ) : (
                            <code>env.{port.name}</code>
                          )}
                          <code>{expressionLabel(port.binding, current)}</code>
                        </div>
                      );
                    })}
                  </div>
                  <div className="section-title">
                    <span>输出接口</span>
                    <button>＋ 输出</button>
                  </div>
                  <div className="output-list">
                    {selected.outputs.map((port) => (
                      <div key={port.id}>
                        <span className="output-port-dot" />
                        <strong>{port.name}</strong>
                        <span>{port.type}</span>
                        {port.mapping && <code>{expressionLabel(port.mapping, current)}</code>}
                      </div>
                    ))}
                  </div>
                  <div className="inspector-actions">
                    {selected.moduleRef && <button onClick={detachModule}>脱离模块</button>}
                    <button onClick={duplicateSelected} disabled={selected.id === current.id}>创建副本</button>
                    <button className="danger" onClick={deleteSelected} disabled={selected.id === current.id}>删除</button>
                  </div>
                </>
              ) : (
                <div className="empty-inspector">选择一个意图以编辑属性</div>
              )}
            </div>
          ) : (
            <div className="run-panel">
              <div className="run-summary">
                <div>
                  <span className={`run-orb ${runState}`} />
                  <span>
                    <small>最近一次执行</small>
                    <strong>{runState === "idle" ? "尚未运行" : runState === "running" ? "正在解析依赖" : runState === "success" ? "执行成功" : "执行失败"}</strong>
                  </span>
                </div>
                <button onClick={run} disabled={runState === "running"}>重新运行</button>
              </div>
              <section className="run-inputs">
                <div className="section-title"><span>根意图输入</span><small>JSON 值</small></div>
                {doc.rootIntent.inputs.map((port) => (
                  <label key={port.id}>
                    <span>{port.name}<small>{port.type}</small></span>
                    <input
                      value={String(rootInput[port.id] ?? "")}
                      onChange={(event) =>
                        setRootInput((values) => ({
                          ...values,
                          [port.id]:
                            port.type === "number" ? Number(event.target.value) : event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </section>
              <section className="trace-list">
                <div className="section-title"><span>分层追踪</span><small>{trace.length} 步</small></div>
                {trace.length ? (
                  trace.map((item, index) => (
                    <div className={`trace-row ${item.status}`} key={`${item.id}-${index}`}>
                      <span className="trace-rail"><i /></span>
                      <span className="trace-index">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.path}</small>
                        {item.output && <code>{JSON.stringify(item.output)}</code>}
                        {item.error && <code>{item.error}</code>}
                      </div>
                      <span className="trace-state">{statusText[item.status]} {item.duration ? `${item.duration}ms` : ""}</span>
                    </div>
                  ))
                ) : (
                  <div className="trace-empty">
                    <span>▷</span>
                    运行根意图后，这里会显示每层输入、输出与耗时
                  </div>
                )}
              </section>
            </div>
          )}
        </aside>
      </div>

      {toast && (
        <button className="toast" onClick={() => setToast("")}>{toast}<span>×</span></button>
      )}
    </main>
  );
}
