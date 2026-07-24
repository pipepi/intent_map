"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
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

const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const sampleDocument = (): IntentDocument => {
  const customer: IntentNode = {
    id: "customer",
    name: "读取客户等级",
    description: "读取当前作用域中的客户等级。",
    kind: "operator",
    operator: "identity",
    inputs: [
      {
        id: "level_in",
        name: "客户等级",
        type: "string",
        binding: { kind: "env", portId: "customer_level" },
      },
    ],
    outputs: [{ id: "level_out", name: "等级", type: "string" }],
    position: { x: 270, y: 86 },
  };
  const subtotal: IntentNode = {
    id: "subtotal",
    name: "计算基础价",
    description: "将商品数量与单价相乘。",
    kind: "operator",
    operator: "multiply",
    inputs: [
      {
        id: "quantity_in",
        name: "数量",
        type: "number",
        binding: { kind: "env", portId: "quantity" },
      },
      {
        id: "price_in",
        name: "单价",
        type: "number",
        binding: { kind: "env", portId: "unit_price" },
      },
    ],
    outputs: [{ id: "subtotal_out", name: "基础金额", type: "number" }],
    position: { x: 270, y: 270 },
  };
  const discount: IntentNode = {
    id: "discount",
    name: "应用会员折扣",
    description: "根据客户等级计算折后金额。",
    kind: "operator",
    operator: "discount",
    inputs: [
      {
        id: "amount_in",
        name: "基础金额",
        type: "number",
        binding: { kind: "ref", nodeId: "subtotal", portId: "subtotal_out" },
      },
      {
        id: "tier_in",
        name: "等级",
        type: "string",
        binding: { kind: "ref", nodeId: "customer", portId: "level_out" },
      },
    ],
    outputs: [{ id: "discounted_out", name: "折后金额", type: "number" }],
    position: { x: 545, y: 176 },
  };
  const quote: IntentNode = {
    id: "quote",
    name: "生成报价单",
    description: "组合成交金额和客户等级。",
    kind: "operator",
    operator: "object",
    inputs: [
      {
        id: "total_in",
        name: "成交金额",
        type: "number",
        binding: { kind: "ref", nodeId: "discount", portId: "discounted_out" },
      },
      {
        id: "tier_quote",
        name: "客户等级",
        type: "string",
        binding: { kind: "ref", nodeId: "customer", portId: "level_out" },
      },
    ],
    outputs: [{ id: "quote_out", name: "报价单", type: "object" }],
    position: { x: 745, y: 328 },
  };

  // 第 3 层：策略容器；其直属算子构成第 4 层。
  const pricingStrategy: IntentNode = {
    id: "pricing_strategy",
    name: "价格策略",
    description: "第 3 层意图：组织基础价、会员折扣与报价单生成。",
    kind: "composite",
    inputs: [
      { id: "quantity", name: "商品数量", type: "number" },
      { id: "unit_price", name: "商品单价", type: "number" },
      { id: "customer_level", name: "客户等级", type: "string" },
    ],
    outputs: [
      {
        id: "strategy_quote",
        name: "策略报价",
        type: "object",
        mapping: { kind: "ref", nodeId: "quote", portId: "quote_out" },
      },
    ],
    children: [customer, subtotal, discount, quote],
    position: { x: 345, y: 190 },
  };

  // 第 2 层：编排容器，只能通过公开接口访问第 3 层。
  const quoteOrchestration: IntentNode = {
    id: "quote_orchestration",
    name: "报价编排",
    description: "第 2 层意图：绑定根环境并调用内部价格策略。",
    kind: "composite",
    inputs: [
      { id: "quantity", name: "商品数量", type: "number" },
      { id: "unit_price", name: "商品单价", type: "number" },
      { id: "customer_level", name: "客户等级", type: "string" },
    ],
    outputs: [
      {
        id: "orchestration_quote",
        name: "编排报价",
        type: "object",
        mapping: {
          kind: "ref",
          nodeId: "pricing_strategy",
          portId: "strategy_quote",
        },
      },
    ],
    children: [
      {
        ...pricingStrategy,
        inputs: pricingStrategy.inputs.map((port) => ({
          ...port,
          binding: { kind: "env", portId: port.id },
        })),
      },
    ],
    position: { x: 375, y: 190 },
  };

  // 第 1 层：根意图。默认树为 根 → 报价编排 → 价格策略 → 叶子算子。
  const root: IntentNode = {
    id: "root",
    name: "智能报价系统",
    description: "第 1 层根意图：展示四层分形模块与逐层导出。",
    kind: "composite",
    inputs: [
      { id: "quantity", name: "商品数量", type: "number" },
      { id: "unit_price", name: "商品单价", type: "number" },
      { id: "customer_level", name: "客户等级", type: "string" },
    ],
    outputs: [
      {
        id: "final_quote",
        name: "最终报价",
        type: "object",
        mapping: {
          kind: "ref",
          nodeId: "quote_orchestration",
          portId: "orchestration_quote",
        },
      },
    ],
    children: [
      {
        ...quoteOrchestration,
        inputs: quoteOrchestration.inputs.map((port) => ({
          ...port,
          binding: { kind: "env", portId: port.id },
        })),
      },
    ],
    position: { x: 0, y: 0 },
  };

  return {
    version: 1,
    rootIntent: root,
    publishedModules: [
      {
        moduleId: "pricing-core",
        name: "价格策略",
        version: 4,
        publishedAt: "刚刚",
        snapshot: structuredClone(pricingStrategy),
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
  const [selectedId, setSelectedId] = useState<string>("discount");
  const [history, setHistory] = useState<IntentDocument[]>([]);
  const [future, setFuture] = useState<IntentDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [rootInput, setRootInput] = useState<Record<string, unknown>>({
    quantity: 24,
    unit_price: 128,
    customer_level: "VIP",
  });
  const [activeTab, setActiveTab] = useState<"properties" | "run">("properties");
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasViewport = useRef<HTMLDivElement>(null);
  const cancelRun = useRef(false);

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

  const navigateTo = (targetPath: string[]) => {
    setPath(targetPath);
    setZoom(1);
    requestAnimationFrame(() => canvasViewport.current?.scrollTo({ left: 0, top: 0 }));
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
    if (target.kind === "composite" || target.children?.length) {
      setPath((items) => [...items, node.id]);
      setZoom(1);
      requestAnimationFrame(() => canvasViewport.current?.scrollTo({ left: 0, top: 0 }));
      setSelectedId(target.children?.[0]?.id ?? target.id);
    }
  };

  const getZoomAnchor = (
    viewport: HTMLDivElement,
    pointer?: { x: number; y: number },
  ) => {
    const viewportRect = viewport.getBoundingClientRect();
    const stage = viewport.querySelector<HTMLElement>(".canvas-stage");
    const stageRect = stage?.getBoundingClientRect() ?? viewportRect;
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
      stageX: Math.max(0, Math.min(1000, (anchorClientX - stageRect.left) / zoom)),
      stageY: Math.max(0, Math.min(650, (anchorClientY - stageRect.top) / zoom)),
      viewportX: anchorClientX - viewportRect.left,
      viewportY: anchorClientY - viewportRect.top,
      stageOffsetX: stageRect.left - viewportRect.left + viewport.scrollLeft,
      stageOffsetY: stageRect.top - viewportRect.top + viewport.scrollTop,
    };
  };

  const applyAnchoredZoom = (
    viewport: HTMLDivElement,
    nextZoom: number,
    anchor: ReturnType<typeof getZoomAnchor>,
  ) => {
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      const desiredLeft =
        anchor.stageOffsetX + anchor.stageX * nextZoom - anchor.viewportX;
      const desiredTop =
        anchor.stageOffsetY + anchor.stageY * nextZoom - anchor.viewportY;
      const maxLeft = Math.max(
        0,
        anchor.stageOffsetX + 1000 * nextZoom - viewport.clientWidth,
      );
      const maxTop = Math.max(
        0,
        anchor.stageOffsetY + 650 * nextZoom - viewport.clientHeight,
      );
      viewport.scrollTo({
        left: Math.max(0, Math.min(maxLeft, desiredLeft)),
        top: Math.max(0, Math.min(maxTop, desiredTop)),
      });
    });
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();

    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.max(0.5, Math.min(2, zoom + direction * 0.1));
    const viewport = event.currentTarget;
    const anchor = getZoomAnchor(viewport, { x: event.clientX, y: event.clientY });

    if (direction > 0 && nextZoom >= 2) {
      const candidates = current.children ?? [];

      if (candidates.length > 0) {
        const nearest = candidates.reduce((closest, node) => {
          const closestDistance =
            (closest.position.x + 89 - anchor.stageX) ** 2 +
            (closest.position.y + 52 - anchor.stageY) ** 2;
          const nodeDistance =
            (node.position.x + 89 - anchor.stageX) ** 2 +
            (node.position.y + 52 - anchor.stageY) ** 2;
          return nodeDistance < closestDistance ? node : closest;
        });
        navigateTo([...path, nearest.id]);
        return;
      }
    }

    if (direction < 0 && nextZoom <= 0.5 && path.length > 1) {
      navigateTo(path.slice(0, -1));
      return;
    }

    applyAnchoredZoom(viewport, nextZoom, anchor);
  };

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
    const target = event.currentTarget;
    const onMove = (moveEvent: PointerEvent) => {
      target.style.left = `${start.x + (moveEvent.clientX - originX) / zoom}px`;
      target.style.top = `${start.y + (moveEvent.clientY - originY) / zoom}px`;
    };
    const onUp = (upEvent: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      const nextPosition = {
        x: Math.max(195, Math.min(760, start.x + (upEvent.clientX - originX) / zoom)),
        y: Math.max(62, Math.min(520, start.y + (upEvent.clientY - originY) / zoom)),
      };
      updateCurrent((scope) => ({
        ...scope,
        children: scope.children?.map((child) =>
          child.id === nodeId ? { ...child, position: nextPosition } : child,
        ),
      }));
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
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
    return source
      ? { x: source.position.x + 172, y: source.position.y + 51 }
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
            setSelectedId("customer");
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
              <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>＋</button>
            </div>
          </div>
          <div
            ref={canvasViewport}
            className="canvas-viewport"
            onWheel={handleCanvasWheel}
          >
            <div className="canvas-scale" style={{ transform: `scale(${zoom})` }}>
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
                    const tx = target.position.x;
                    const ty = target.position.y + 50;
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

                {(current.children ?? []).map((node) => (
                  <button
                    key={node.id}
                    className={`intent-node graph-node kind-${node.kind} ${selectedId === node.id ? "selected" : ""} ${trace.some((item) => item.name === node.name && item.status === "success") ? "executed" : ""}`}
                    style={{ left: node.position.x, top: node.position.y }}
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
                    <span className="node-ports">
                      <span>{node.inputs.length} in</span>
                      <span>{node.outputs.length} out</span>
                    </span>
                  </button>
                ))}

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
