import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationDocument,
} from "../app/runtime/model.ts";
import { derivePanelPipelineEdges } from "../app/runtime/panel-pipelines.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

test("resolves duplicate projected nodes to the nearest legal source", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const panel = structuredClone(document.workspaceState.panels[0]);
  const validation = panel.surfaces.find(
    (surface) => surface.featureNodeId === "validation",
  );
  validation.frame = { x: 0.05, y: 0.1, width: 0.2, height: 0.2 };
  panel.surfaces.push({
    ...structuredClone(validation),
    id: "validation-near",
    frame: { x: 0.55, y: 0.1, width: 0.2, height: 0.2 },
  });
  panel.surfaces.push({
    ...structuredClone(validation),
    id: "canvas-status-target",
    featureNodeId: "canvas_status",
    frame: { x: 0.78, y: 0.1, width: 0.18, height: 0.2 },
  });

  const edges = derivePanelPipelineEdges(document.rootIntent, panel);
  const edge = edges.find(
    (candidate) =>
      candidate.sourceNodeId === "validation" &&
      candidate.targetNodeId === "canvas_status",
  );

  assert.equal(edge.sourceSurfaceId, "validation-near");
  assert.equal(edge.targetSurfaceId, "canvas-status-target");
});

test("uses deterministic panel boundary stubs for unopened endpoints", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const panel = document.workspaceState.panels[0];
  const edges = derivePanelPipelineEdges(document.rootIntent, panel);

  const missingSource = edges.find(
    (edge) =>
      edge.sourceNodeId === "document_loader" &&
      edge.targetNodeId === "properties",
  );
  const missingTarget = edges.find(
    (edge) =>
      edge.sourceNodeId === "validation" &&
      edge.targetNodeId === "canvas_status",
  );

  assert.deepEqual(missingSource.source.boundary, "left");
  assert.deepEqual(missingTarget.target.boundary, "right");
  assert.deepEqual(
    derivePanelPipelineEdges(document.rootIntent, panel),
    edges,
  );
});
