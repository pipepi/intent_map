import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  APPLICATION_NODE_IDS,
  appScopeAddress,
  businessScopeAddress,
  createApplicationDocument,
  getBusinessRoot,
  getContainerSurface,
  loadIntentDocument,
  parentScopeStack,
  resolveFeatureContext,
  scopeCameraKey,
  serializeIntentDocument,
  updatePanel,
  updateSurface,
} from "../app/runtime/model.ts";
import {
  businessTreeDepth,
  createSampleBusinessRoot,
} from "../app/runtime/sample-business-tree.ts";

test("creates the v3 root, views, panels, and dual surface types", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());

  assert.equal(document.version, 3);
  assert.equal(document.rootIntent.id, "application_root");
  assert.equal(document.businessRootId, "business_root");
  assert.equal(businessTreeDepth(getBusinessRoot(document)), 4);
  assert.deepEqual(
    document.views.map((view) => view.kind),
    ["free-layout", "workbench"],
  );
  assert.deepEqual(
    document.workspaceState.panels.map((panel) => panel.viewId),
    ["view-workbench", "view-free-layout"],
  );

  const workbench = document.workspaceState.panels[0];
  assert.equal(workbench.layoutLocked, true);
  assert.equal(workbench.activeContainerSurfaceId, "workbench-container");
  assert.equal(
    workbench.surfaces.filter((surface) => surface.kind === "current-container")
      .length,
    1,
  );
  assert.deepEqual(
    workbench.surfaces
      .filter((surface) => surface.kind === "feature-panel")
      .map((surface) => surface.featureNodeId),
    ["intent_tree", "properties", "validation", "run_trace"],
  );
});

test("keeps the root functional graph and current-container reference", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  assert.deepEqual(
    document.rootIntent.children.map((node) => node.id),
    APPLICATION_NODE_IDS,
  );
  const currentContainer = document.rootIntent.children.find(
    (node) => node.id === "current_container",
  );
  assert.equal(currentContainer.children[0].id, ACTIVE_BUSINESS_SCOPE_REF_ID);
  assert.equal(
    currentContainer.outputs.every(
      (output) =>
        output.mapping?.kind === "ref" &&
        output.mapping.nodeId === ACTIVE_BUSINESS_SCOPE_REF_ID,
    ),
    true,
  );
});

test("round-trips v3 and rejects v1/v2 without mutating input", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const text = serializeIntentDocument({
    ...document,
    rootIntent: { ...document.rootIntent, edges: [{ id: "derived" }] },
  });
  const parsed = JSON.parse(text);
  const original = JSON.stringify(parsed);
  const loaded = loadIntentDocument(parsed);

  assert.equal(loaded.version, 3);
  assert.equal(JSON.stringify(parsed), original);
  assert.doesNotMatch(text, /"edges"/);
  assert.throws(() => loadIntentDocument({ version: 1 }), /v3 工作区文档/);
  assert.throws(() => loadIntentDocument({ version: 2 }), /v3 工作区文档/);
});

test("resolves panel selection, fixed source, and fixed subject independently", () => {
  let document = createApplicationDocument(createSampleBusinessRoot());
  document = updatePanel(document, "panel-workbench", (panel) => ({
    ...panel,
    surfaces: [
      ...panel.surfaces,
      {
        ...getContainerSurface(document, "panel-free-layout"),
        id: "workbench-container-2",
        title: "第二上下文",
      },
    ],
  }));
  document = updateSurface(
    document,
    "panel-workbench",
    "workbench-properties",
    (surface) => ({
      ...surface,
      contextSource: {
        mode: "fixed-container",
        surfaceId: "workbench-container-2",
      },
      subject: { mode: "fixed-node", nodeId: "scenario_actor_leaf" },
    }),
  );

  const context = resolveFeatureContext(
    document,
    "panel-workbench",
    "workbench-properties",
  );
  assert.equal(context.container.id, "workbench-container-2");
  assert.equal(context.subject.id, "scenario_actor_leaf");
});

test("rejects cross-panel and missing active container bindings", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const brokenSource = updateSurface(
    document,
    "panel-workbench",
    "workbench-properties",
    (surface) => ({
      ...surface,
      contextSource: {
        mode: "fixed-container",
        surfaceId: "free-layout-container",
      },
    }),
  );
  assert.throws(
    () => loadIntentDocument(brokenSource),
    /固定来源不属于当前 Panel/,
  );

  const brokenActive = updatePanel(
    document,
    "panel-workbench",
    (panel) => ({
      ...panel,
      activeContainerSurfaceId: "workbench-properties",
    }),
  );
  assert.throws(
    () => loadIntentDocument(brokenActive),
    /活动上下文必须引用同 Panel 当前容器/,
  );
});

test("namespaces application and business navigation frames", () => {
  const stack = [
    appScopeAddress("application_root"),
    appScopeAddress("current_container"),
    businessScopeAddress("business_root"),
    businessScopeAddress("scenario_flow"),
  ];
  assert.deepEqual(
    stack.map(scopeCameraKey),
    [
      "app:application_root",
      "app:current_container",
      "business:business_root",
      "business:scenario_flow",
    ],
  );
  assert.deepEqual(parentScopeStack(stack), stack.slice(0, -1));
});
