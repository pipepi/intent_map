import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_CONTAINER_PORT_TOP,
  BUSINESS_PORT_DOT_OFFSET,
  BUSINESS_PORT_HEIGHT,
  BUSINESS_PORT_TOP,
  businessEdgeGeometry,
  businessNodeTreeDepth,
  businessNodeSize,
  clampBusinessNodePosition,
  deriveBusinessVisualEdges,
  nearestBusinessChild,
  pickBusinessNodeDragTarget,
  resizeBusinessNodeGeometry,
} from "../app/runtime/business-canvas.ts";

const source = {
  id: "source",
  name: "Source",
  description: "source",
  kind: "operator",
  inputs: [
    {
      id: "source_input",
      name: "Input",
      type: "string",
      binding: { kind: "ref", portId: "environment_input", env: true },
    },
  ],
  outputs: [{ id: "source_output", name: "Output", type: "string" }],
  position: { x: 180, y: 140 },
  size: { width: 220, height: 150 },
  displayMode: "expanded",
};

const target = {
  id: "target",
  name: "Target",
  description: "target",
  kind: "operator",
  inputs: [
    {
      id: "target_input",
      name: "Input",
      type: "string",
      binding: {
        kind: "ref",
        nodeId: "source",
        portId: "source_output",
      },
    },
  ],
  outputs: [{ id: "target_output", name: "Output", type: "string" }],
  position: { x: 620, y: 300 },
  size: { width: 260, height: 170 },
  displayMode: "expanded",
};

const scope = {
  id: "scope",
  name: "Scope",
  description: "scope",
  kind: "composite",
  inputs: [
    {
      id: "environment_input",
      name: "Environment",
      type: "string",
    },
  ],
  outputs: [
    {
      id: "container_output",
      name: "Result",
      type: "string",
      binding: {
        kind: "ref",
        nodeId: "target",
        portId: "target_output",
      },
    },
  ],
  children: [source, target],
  position: { x: 0, y: 0 },
  canvasSize: { width: 1200, height: 760 },
};

test("derives environment, sibling, and container-output edges from expressions", () => {
  const edges = deriveBusinessVisualEdges(scope);
  assert.equal(edges.length, 3);
  assert.deepEqual(
    edges.map((edge) => [edge.sourceKind, edge.targetKind]),
    [
      ["environment", "node"],
      ["node", "node"],
      ["node", "container-output"],
    ],
  );
});

test("anchors every derived edge to the exact visual port center", () => {
  const edges = deriveBusinessVisualEdges(scope);
  const environment = businessEdgeGeometry(
    scope,
    edges[0],
    scope.canvasSize,
  );
  const sibling = businessEdgeGeometry(scope, edges[1], scope.canvasSize);
  const output = businessEdgeGeometry(scope, edges[2], scope.canvasSize);

  assert.deepEqual(environment, {
    sx: -BUSINESS_PORT_DOT_OFFSET,
    sy: BUSINESS_CONTAINER_PORT_TOP + BUSINESS_PORT_HEIGHT / 2,
    tx: source.position.x - BUSINESS_PORT_DOT_OFFSET,
    ty: source.position.y + BUSINESS_PORT_TOP + BUSINESS_PORT_HEIGHT / 2,
  });
  assert.equal(
    sibling.sx,
    source.position.x +
      businessNodeSize(source).width +
      BUSINESS_PORT_DOT_OFFSET,
  );
  assert.equal(
    sibling.sy,
    source.position.y + BUSINESS_PORT_TOP + BUSINESS_PORT_HEIGHT / 2,
  );
  assert.equal(sibling.tx, target.position.x - BUSINESS_PORT_DOT_OFFSET);
  assert.equal(
    output.tx,
    scope.canvasSize.width + BUSINESS_PORT_DOT_OFFSET,
  );
  assert.equal(
    output.ty,
    BUSINESS_CONTAINER_PORT_TOP + BUSINESS_PORT_HEIGHT / 2,
  );
});

test("moves nodes in world coordinates and keeps them inside the container", () => {
  assert.deepEqual(
    clampBusinessNodePosition(
      { x: 180, y: 140 },
      { x: 101, y: 79 },
      2,
      { width: 220, height: 150 },
      { width: 1200, height: 760 },
    ),
    { x: 231, y: 180 },
  );
  assert.deepEqual(
    clampBusinessNodePosition(
      { x: 180, y: 140 },
      { x: -2000, y: -2000 },
      1,
      { width: 220, height: 150 },
      { width: 1200, height: 760 },
    ),
    { x: 195, y: 120 },
  );
});

test("resizes from north-west while preserving the opposite edges", () => {
  const geometry = resizeBusinessNodeGeometry(
    source,
    "nw",
    { x: -40, y: -30 },
    1,
    scope.canvasSize,
  );
  const originalSize = businessNodeSize(source);
  assert.equal(
    geometry.position.x + geometry.size.width,
    source.position.x + originalSize.width,
  );
  assert.equal(
    geometry.position.y + geometry.size.height,
    source.position.y + originalSize.height,
  );
});

test("chooses the nearest child to the semantic zoom anchor", () => {
  assert.equal(
    nearestBusinessChild(scope.children, { x: 700, y: 350 }).id,
    "target",
  );
  assert.equal(
    nearestBusinessChild(scope.children, { x: 210, y: 160 }).id,
    "source",
  );
  assert.equal(nearestBusinessChild([], { x: 0, y: 0 }), undefined);
});

const dragCandidate = (value, overrides = {}) => ({
  value,
  bounds: { left: 0, top: 0, right: 100, bottom: 100 },
  zIndex: 2,
  treeDepth: 1,
  domDepth: 1,
  paintOrder: 0,
  ...overrides,
});

test("chooses the nearest node before visual stacking", () => {
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("near", {
          bounds: { left: 100, top: 100, right: 200, bottom: 200 },
        }),
        dragCandidate("far-top", {
          bounds: { left: 400, top: 400, right: 500, bottom: 500 },
          zIndex: 99,
        }),
      ],
      { x: 210, y: 210 },
    ),
    "near",
  );
});

test("breaks overlapping drag-target ties by z-index and tree depth", () => {
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("deep", { treeDepth: 5, paintOrder: 4 }),
        dragCandidate("top", { zIndex: 8 }),
      ],
      { x: 50, y: 50 },
    ),
    "top",
  );
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("shallow", { treeDepth: 2, paintOrder: 10 }),
        dragCandidate("deep", { treeDepth: 5 }),
      ],
      { x: 50, y: 50 },
    ),
    "deep",
  );
});

test("uses DOM depth and paint order for otherwise equal drag targets", () => {
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("painted-later", { paintOrder: 9 }),
        dragCandidate("nested", { domDepth: 3 }),
      ],
      { x: 50, y: 50 },
    ),
    "nested",
  );
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("early"),
        dragCandidate("late", { paintOrder: 2 }),
      ],
      { x: 50, y: 50 },
    ),
    "late",
  );
  assert.equal(
    pickBusinessNodeDragTarget(
      [
        dragCandidate("centered", {
          bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        }),
        dragCandidate("painted-over", {
          bounds: { left: 40, top: 40, right: 240, bottom: 240 },
          paintOrder: 2,
        }),
      ],
      { x: 50, y: 50 },
    ),
    "painted-over",
  );
});

test("reports a node's depth in the business intent tree", () => {
  const nested = {
    ...source,
    id: "nested",
    children: [{ ...target, id: "leaf" }],
  };
  const tree = { ...scope, children: [nested] };
  assert.equal(businessNodeTreeDepth(tree, "scope"), 0);
  assert.equal(businessNodeTreeDepth(tree, "nested"), 1);
  assert.equal(businessNodeTreeDepth(tree, "leaf"), 2);
  assert.equal(businessNodeTreeDepth(tree, "missing"), undefined);
});
