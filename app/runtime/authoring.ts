import type {
  Expression,
  IntentNode,
  IntentPort,
  PortChannel,
  ValueType,
} from "./model";

export type IdFactory = (sourceId: string) => string;

const rewriteExpression = (
  expression: Expression | undefined,
  nodeIds: ReadonlyMap<string, string>,
): Expression | undefined => {
  if (!expression) return undefined;
  if (expression.kind === "ref") {
    return expression.nodeId && nodeIds.has(expression.nodeId)
      ? { ...expression, nodeId: nodeIds.get(expression.nodeId) }
      : { ...expression };
  }
  if (expression.kind === "op") {
    return {
      ...expression,
      args: expression.args.map((arg) => rewriteExpression(arg, nodeIds)!),
    };
  }
  return structuredClone(expression);
};

export const deepCopyIntentSubtree = (
  source: IntentNode,
  createId: IdFactory,
): { root: IntentNode; nodeIds: ReadonlyMap<string, string> } => {
  const nodeIds = new Map<string, string>();
  const collect = (node: IntentNode) => {
    nodeIds.set(node.id, createId(node.id));
    node.children?.forEach(collect);
  };
  collect(source);

  const copy = (node: IntentNode): IntentNode => ({
    ...structuredClone(node),
    id: nodeIds.get(node.id)!,
    inputs: node.inputs.map((port) => ({
      ...structuredClone(port),
      binding: rewriteExpression(port.binding, nodeIds),
    })),
    outputs: node.outputs.map((port) => ({
      ...structuredClone(port),
      mapping: rewriteExpression(port.mapping, nodeIds),
    })),
    children: node.children?.map(copy),
  });
  return { root: copy(source), nodeIds };
};

export type AuthoringResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; references?: string[] };

const validId = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const valueTypes = new Set<ValueType>([
  "number",
  "string",
  "boolean",
  "object",
  "array",
  "any",
]);
const channels = new Set<PortChannel>(["data", "event"]);

const mapExpression = (
  expression: Expression | undefined,
  mapper: (reference: Extract<Expression, { kind: "ref" }>) => Expression,
): Expression | undefined => {
  if (!expression) return undefined;
  if (expression.kind === "ref") return mapper(expression);
  if (expression.kind === "op") {
    return { ...expression, args: expression.args.map((arg) => mapExpression(arg, mapper)!) };
  }
  return structuredClone(expression);
};

const mapTree = (
  node: IntentNode,
  mapper: (node: IntentNode) => IntentNode,
): IntentNode => {
  const children = node.children?.map((child) => mapTree(child, mapper));
  return mapper({ ...node, children });
};

const findTreeNode = (node: IntentNode, id: string): IntentNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findTreeNode(child, id);
    if (match) return match;
  }
};

export const renameIntentNodeId = (
  root: IntentNode,
  nodeId: string,
  nextId: string,
): AuthoringResult<IntentNode> => {
  if (!validId.test(nextId)) return { ok: false, error: "节点 ID 为空或格式非法" };
  if (nextId !== nodeId && findTreeNode(root, nextId)) {
    return { ok: false, error: `节点 ID「${nextId}」已存在` };
  }
  return {
    ok: true,
    value: mapTree(root, (node) => ({
      ...node,
      id: node.id === nodeId ? nextId : node.id,
      inputs: node.inputs.map((port) => ({
        ...port,
        binding: mapExpression(port.binding, (reference) =>
          reference.nodeId === nodeId ? { ...reference, nodeId: nextId } : reference,
        ),
      })),
      outputs: node.outputs.map((port) => ({
        ...port,
        mapping: mapExpression(port.mapping, (reference) =>
          reference.nodeId === nodeId ? { ...reference, nodeId: nextId } : reference,
        ),
      })),
    })),
  };
};

const portReferences = (
  root: IntentNode,
  targetNodeId: string,
  targetPortId: string,
) => {
  const references: string[] = [];
  mapTree(root, (node) => {
    [...node.inputs, ...node.outputs].forEach((port) => {
      const visit = (expression?: Expression) => {
        if (!expression) return;
        if (
          expression.kind === "ref" &&
          expression.nodeId === targetNodeId &&
          expression.portId === targetPortId
        ) {
          references.push(`${node.id}.${port.id}`);
        } else if (expression.kind === "op") {
          expression.args.forEach(visit);
        }
      };
      visit(port.binding);
      visit(port.mapping);
    });
    return node;
  });
  return references;
};

export const updateIntentPortSchema = (
  root: IntentNode,
  nodeId: string,
  direction: "inputs" | "outputs",
  portId: string,
  next: Pick<IntentPort, "id" | "name" | "type" | "channel"> | null,
): AuthoringResult<IntentNode> => {
  const target = findTreeNode(root, nodeId);
  const current = target?.[direction].find((port) => port.id === portId);
  if (!target || !current) return { ok: false, error: "目标端口不存在" };
  const references = portReferences(root, nodeId, portId);
  if (!next) {
    if (references.length) {
      return {
        ok: false,
        error: `端口仍被 ${references.length} 处引用`,
        references,
      };
    }
  } else {
    if (!validId.test(next.id)) return { ok: false, error: "端口 ID 为空或格式非法" };
    if (!next.name.trim()) return { ok: false, error: "端口名称不能为空" };
    if (!valueTypes.has(next.type)) return { ok: false, error: "端口类型非法" };
    if (next.channel && !channels.has(next.channel)) {
      return { ok: false, error: "端口通道非法" };
    }
    if (
      next.id !== portId &&
      [...target.inputs, ...target.outputs].some((port) => port.id === next.id)
    ) {
      return { ok: false, error: `端口 ID「${next.id}」已存在` };
    }
  }

  return {
    ok: true,
    value: mapTree(root, (node) => {
      const rewrite = (expression?: Expression) =>
        mapExpression(expression, (reference) =>
          next &&
          reference.nodeId === nodeId &&
          reference.portId === portId
            ? { ...reference, portId: next.id }
            : reference,
        );
      const ports = node.id === nodeId
        ? node[direction]
            .filter((port) => next || port.id !== portId)
            .map((port) =>
              port.id === portId && next
                ? { ...port, ...next }
                : port,
            )
        : node[direction];
      return {
        ...node,
        [direction]: ports,
        inputs: (direction === "inputs" && node.id === nodeId ? ports : node.inputs).map(
          (port) => ({ ...port, binding: rewrite(port.binding) }),
        ),
        outputs: (direction === "outputs" && node.id === nodeId ? ports : node.outputs).map(
          (port) => ({ ...port, mapping: rewrite(port.mapping) }),
        ),
      };
    }),
  };
};
