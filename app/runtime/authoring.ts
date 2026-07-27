import type { Expression, IntentNode } from "./model";

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
