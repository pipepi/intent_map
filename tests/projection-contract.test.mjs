import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTION_LOD_THRESHOLD,
  defaultNodeProjectionLayout,
  projectIntentTree,
  projectionUsesSummary,
  scopeProjectionKey,
  surfaceProjectionNodeId,
} from "../app/runtime/projection.ts";
import {
  createApplicationDocument,
  getBusinessRoot,
} from "../app/runtime/model.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

test("uses v3 life-tree nodes as immutable projection defaults", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const businessRoot = getBusinessRoot(document);
  const node = businessRoot.children[0];
  const before = structuredClone(node);
  const layout = defaultNodeProjectionLayout(node);

  assert.deepEqual(layout.frame, {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
  });
  assert.equal(layout.displayMode, node.displayMode ?? "expanded");
  assert.equal(layout.resizeMode, node.resizeMode ?? "simple");
  assert.deepEqual(node, before, "deriving projection state must not mutate the inner tree");
});

test("projects outer-tree geometry without changing the inner tree", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const before = structuredClone(document.rootIntent);
  const projected = projectIntentTree(
    document.rootIntent,
    document.businessRootId,
    {
      "business:business_root": {
        camera: { scale: 0.8, x: 0, y: 0 },
        nodeLayouts: {
          scenario_flow: {
            frame: { x: 700, y: 420, width: 480, height: 300 },
            displayMode: "minimized",
            resizeMode: "full",
          },
        },
      },
    },
  );
  const businessRoot = getBusinessRoot({
    ...document,
    rootIntent: projected,
  });
  const projectedFlow = businessRoot.children.find(
    (node) => node.id === "scenario_flow",
  );

  assert.deepEqual(projectedFlow.position, { x: 700, y: 420 });
  assert.deepEqual(projectedFlow.size, { width: 480, height: 300 });
  assert.equal(projectedFlow.displayMode, "minimized");
  assert.deepEqual(document.rootIntent, before);
});

test("namespaces app and business scope projections", () => {
  assert.equal(
    scopeProjectionKey({ domain: "app", nodeId: "application_root" }),
    "app:application_root",
  );
  assert.equal(
    scopeProjectionKey({ domain: "business", nodeId: "business_root" }),
    "business:business_root",
  );
});

test("maps both surface kinds back to their unique inner-tree node", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const workbench = document.workspaceState.panels[0];
  const feature = workbench.surfaces.find(
    (surface) => surface.kind === "feature-panel",
  );
  const container = workbench.surfaces.find(
    (surface) => surface.kind === "current-container",
  );

  assert.equal(surfaceProjectionNodeId(feature), feature.featureNodeId);
  assert.equal(surfaceProjectionNodeId(container), "current_container");
});

test("keeps the v2-reference LOD threshold at 0.55", () => {
  assert.equal(PROJECTION_LOD_THRESHOLD, 0.55);
  assert.equal(projectionUsesSummary(0.54), true);
  assert.equal(projectionUsesSummary(0.55), false);
  assert.equal(projectionUsesSummary(0.3, { active: true }), false);
  assert.equal(projectionUsesSummary(0.3, { alwaysLive: true }), false);
});
