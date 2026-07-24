import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_CONTAINER_PORT_TOP,
  BUSINESS_PORT_DOT_OFFSET,
  BUSINESS_PORT_HEIGHT,
  BUSINESS_PORT_TOP,
  businessEdgeGeometry,
  businessNodeSize,
  clampBusinessNodePosition,
  deriveBusinessVisualEdges,
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
      mapping: {
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
