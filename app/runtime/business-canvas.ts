type Expression =
  | { kind: "const"; value: unknown }
  | { kind: "ref"; nodeId?: string; portId: string; env?: boolean }
  | { kind: "op"; op: string; args: Expression[] };

type BusinessIntentNode = {
  id: string;
  inputs: Array<{
    id: string;
    channel?: "data" | "event";
    binding?: Expression;
  }>;
  outputs: Array<{
    id: string;
    channel?: "data" | "event";
    mapping?: Expression;
  }>;
  children?: BusinessIntentNode[];
  position: { x: number; y: number };
  size?: { width: number; height: number };
  displayMode?: "expanded" | "minimized";
};

export const BUSINESS_PORT_TOP = 112;
export const BUSINESS_PORT_ROW = 28;
export const BUSINESS_PORT_HEIGHT = 24;
export const BUSINESS_PORT_DOT_OFFSET = 9;
export const BUSINESS_NODE_BOTTOM_PADDING = 12;
export const BUSINESS_CONTAINER_PORT_TOP = 132;
export const BUSINESS_NODE_MIN_WIDTH = 220;
export const BUSINESS_NODE_MAX_WIDTH = 520;
export const BUSINESS_NODE_MAX_HEIGHT = 420;
export const BUSINESS_NODE_LEFT_MARGIN = 195;
export const BUSINESS_NODE_RIGHT_MARGIN = 100;
export const BUSINESS_NODE_TOP_MARGIN = 120;
export const BUSINESS_NODE_BOTTOM_MARGIN = 60;

export type BusinessVisualEdge = {
  id: string;
  sourceKind: "environment" | "node";
  sourceId?: string;
  sourcePortId: string;
  targetKind: "node" | "container-output";
  targetId?: string;
  targetPortId: string;
  channel: "data" | "event";
};

export type BusinessEdgeGeometry = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
};

const collectExpressionRefs = (
  expression?: Expression,
): Array<Extract<Expression, { kind: "ref" }>> => {
  if (!expression) return [];
  if (expression.kind === "ref") return [expression];
  if (expression.kind === "op") {
    return expression.args.flatMap(collectExpressionRefs);
  }
  return [];
};

const businessNodeDisplayMode = (node: BusinessIntentNode) =>
  node.displayMode ?? "minimized";

const storedNodeSize = (node: BusinessIntentNode) =>
  node.size ?? { width: 320, height: 220 };

export const businessNodeMinimumHeight = (node: BusinessIntentNode) => {
  const rows = Math.max(node.inputs.length, node.outputs.length);
  return Math.max(
    140,
    rows > 0
      ? BUSINESS_PORT_TOP +
          rows * BUSINESS_PORT_ROW +
          BUSINESS_NODE_BOTTOM_PADDING
      : 140,
  );
};

export const businessNodeSize = (node: BusinessIntentNode) => {
  const size = storedNodeSize(node);
  if (businessNodeDisplayMode(node) === "minimized") {
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

export const clampBusinessNodePosition = (
  start: { x: number; y: number },
  delta: { x: number; y: number },
  pointerScale: number,
  size: { width: number; height: number },
  bounds: { width: number; height: number },
) => ({
  x: Math.round(
    Math.max(
      BUSINESS_NODE_LEFT_MARGIN,
      Math.min(
        bounds.width - size.width - BUSINESS_NODE_RIGHT_MARGIN,
        start.x + delta.x / pointerScale,
      ),
    ),
  ),
  y: Math.round(
    Math.max(
      BUSINESS_NODE_TOP_MARGIN,
      Math.min(
        bounds.height - size.height - BUSINESS_NODE_BOTTOM_MARGIN,
        start.y + delta.y / pointerScale,
      ),
    ),
  ),
});

export const resizeBusinessNodeGeometry = (
  node: BusinessIntentNode,
  direction: string,
  delta: { x: number; y: number },
  pointerScale: number,
  bounds: { width: number; height: number },
) => {
  const startSize = businessNodeSize(node);
  const minimumHeight = businessNodeMinimumHeight(node);
  const startPosition = node.position;
  const dx = delta.x / pointerScale;
  const dy = delta.y / pointerScale;
  let x = startPosition.x;
  let y = startPosition.y;
  let width = startSize.width;
  let height = startSize.height;

  if (direction.includes("e")) {
    width = Math.max(
      BUSINESS_NODE_MIN_WIDTH,
      Math.min(
        BUSINESS_NODE_MAX_WIDTH,
        bounds.width - startPosition.x - BUSINESS_NODE_RIGHT_MARGIN,
        startSize.width + dx,
      ),
    );
  }
  if (direction.includes("s")) {
    height = Math.max(
      minimumHeight,
      Math.min(
        BUSINESS_NODE_MAX_HEIGHT,
        bounds.height - startPosition.y - BUSINESS_NODE_BOTTOM_MARGIN,
        startSize.height + dy,
      ),
    );
  }
  if (direction.includes("w")) {
    width = Math.max(
      BUSINESS_NODE_MIN_WIDTH,
      Math.min(
        BUSINESS_NODE_MAX_WIDTH,
        startPosition.x +
          startSize.width -
          BUSINESS_NODE_LEFT_MARGIN,
        startSize.width - dx,
      ),
    );
    x = startPosition.x + startSize.width - width;
  }
  if (direction.includes("n")) {
    height = Math.max(
      minimumHeight,
      Math.min(
        BUSINESS_NODE_MAX_HEIGHT,
        startPosition.y +
          startSize.height -
          BUSINESS_NODE_TOP_MARGIN,
        startSize.height - dy,
      ),
    );
    y = startPosition.y + startSize.height - height;
  }

  return {
    position: { x: Math.round(x), y: Math.round(y) },
    size: { width: Math.round(width), height: Math.round(height) },
  };
};

export const deriveBusinessVisualEdges = (
  scope: BusinessIntentNode,
): BusinessVisualEdge[] => {
  const inputEdges = (scope.children ?? []).flatMap((target) =>
    target.inputs.flatMap((input) =>
      collectExpressionRefs(input.binding).map((reference, index) => ({
        id: `input:${reference.env ? "env" : reference.nodeId}:${reference.portId}>${target.id}:${input.id}:${index}`,
        sourceKind: reference.env ? ("environment" as const) : ("node" as const),
        sourceId: reference.nodeId,
        sourcePortId: reference.portId,
        targetKind: "node" as const,
        targetId: target.id,
        targetPortId: input.id,
        channel: input.channel ?? "data",
      })),
    ),
  );
  const outputEdges = scope.outputs.flatMap((output) =>
    collectExpressionRefs(output.mapping).map((reference, index) => ({
      id: `output:${reference.env ? "env" : reference.nodeId}:${reference.portId}>${output.id}:${index}`,
      sourceKind: reference.env ? ("environment" as const) : ("node" as const),
      sourceId: reference.nodeId,
      sourcePortId: reference.portId,
      targetKind: "container-output" as const,
      targetPortId: output.id,
      channel: output.channel ?? "data",
    })),
  );
  return [...inputEdges, ...outputEdges];
};

export const businessEdgeGeometry = (
  scope: BusinessIntentNode,
  edge: BusinessVisualEdge,
  canvasSize: { width: number; height: number },
): BusinessEdgeGeometry | undefined => {
  const source =
    edge.sourceKind === "node" && edge.sourceId
      ? scope.children?.find((node) => node.id === edge.sourceId)
      : undefined;
  const target =
    edge.targetKind === "node" && edge.targetId
      ? scope.children?.find((node) => node.id === edge.targetId)
      : undefined;
  if (edge.sourceKind === "node" && !source) return undefined;
  if (edge.targetKind === "node" && !target) return undefined;

  const sourceSize = source ? businessNodeSize(source) : undefined;
  const targetSize = target ? businessNodeSize(target) : undefined;
  const sourceMinimized = source
    ? businessNodeDisplayMode(source) === "minimized"
    : false;
  const targetMinimized = target
    ? businessNodeDisplayMode(target) === "minimized"
    : false;
  const sourceIndex =
    edge.sourceKind === "environment"
      ? Math.max(
          0,
          scope.inputs.findIndex((port) => port.id === edge.sourcePortId),
        )
      : Math.max(
          0,
          source?.outputs.findIndex(
            (port) => port.id === edge.sourcePortId,
          ) ?? 0,
        );
  const targetIndex =
    edge.targetKind === "container-output"
      ? Math.max(
          0,
          scope.outputs.findIndex((port) => port.id === edge.targetPortId),
        )
      : Math.max(
          0,
          target?.inputs.findIndex(
            (port) => port.id === edge.targetPortId,
          ) ?? 0,
        );

  return {
    sx:
      edge.sourceKind === "environment"
        ? -BUSINESS_PORT_DOT_OFFSET
        : source!.position.x +
          sourceSize!.width +
          (sourceMinimized ? 0 : BUSINESS_PORT_DOT_OFFSET),
    sy:
      edge.sourceKind === "environment"
        ? BUSINESS_CONTAINER_PORT_TOP +
          BUSINESS_PORT_HEIGHT / 2 +
          sourceIndex * BUSINESS_PORT_ROW
        : sourceMinimized
          ? source!.position.y + sourceSize!.height / 2
          : source!.position.y +
            BUSINESS_PORT_TOP +
            BUSINESS_PORT_HEIGHT / 2 +
            sourceIndex * BUSINESS_PORT_ROW,
    tx:
      edge.targetKind === "container-output"
        ? canvasSize.width + BUSINESS_PORT_DOT_OFFSET
        : target!.position.x -
          (targetMinimized ? 0 : BUSINESS_PORT_DOT_OFFSET),
    ty:
      edge.targetKind === "container-output"
        ? BUSINESS_CONTAINER_PORT_TOP +
          BUSINESS_PORT_HEIGHT / 2 +
          targetIndex * BUSINESS_PORT_ROW
        : targetMinimized
          ? target!.position.y + targetSize!.height / 2
          : target!.position.y +
            BUSINESS_PORT_TOP +
            BUSINESS_PORT_HEIGHT / 2 +
            targetIndex * BUSINESS_PORT_ROW,
  };
};
