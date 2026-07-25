import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  APPLICATION_NODE_IDS,
  appScopeAddress,
  businessScopeAddress,
  createApplicationDocument,
  exportCompatibleV1,
  getBusinessRoot,
  loadIntentDocument,
  nodeDisplayMode,
  parentScopeStack,
  scopeCameraKey,
  serializeIntentDocument,
} from "../app/runtime/model.ts";

const businessRoot = {
  id: "business_root",
  name: "业务根",
  description: "稳定业务树",
  kind: "composite",
  inputs: [{ id: "input", name: "输入", type: "string" }],
  outputs: [{ id: "output", name: "输出", type: "string" }],
  children: [
    {
      id: "child",
      name: "子意图",
      description: "保留稳定 ID",
      kind: "operator",
      operator: "identity",
      inputs: [],
      outputs: [],
      position: { x: 100, y: 100 },
    },
  ],
  position: { x: 0, y: 0 },
};

test("migrates v1 without changing the business tree", () => {
  const v1 = {
    version: 1,
    rootIntent: businessRoot,
    publishedModules: [],
  };
  const original = JSON.stringify(v1);
  const v2 = loadIntentDocument(v1);

  assert.equal(JSON.stringify(v1), original);
  assert.equal(v2.version, 2);
  assert.equal(v2.businessRootId, "business_root");
  assert.deepEqual(getBusinessRoot(v2), businessRoot);
  assert.equal(v2.rootIntent.id, "application_root");
  assert.deepEqual(
    v2.rootIntent.children.map((node) => node.id),
    APPLICATION_NODE_IDS,
  );
  assert.equal(APPLICATION_NODE_IDS.length, 15);
  assert.equal(v2.rootIntent.resizeMode, "simple");
  assert.equal(v2.rootIntent.displayMode, "expanded");
  assert.equal(
    v2.rootIntent.children.every((node) => node.resizeMode === "simple"),
    true,
  );
  assert.equal(
    v2.rootIntent.children.find((node) => node.id === "current_container")
      .displayMode,
    "expanded",
  );
  const currentContainer = v2.rootIntent.children.find(
    (node) => node.id === "current_container",
  );
  assert.equal(currentContainer.children.length, 1);
  assert.equal(currentContainer.children[0].id, ACTIVE_BUSINESS_SCOPE_REF_ID);
  assert.deepEqual(currentContainer.canvasSize, { width: 900, height: 560 });
  assert.deepEqual(currentContainer.children[0].position, { x: 150, y: 150 });
  assert.deepEqual(currentContainer.children[0].size, {
    width: 600,
    height: 330,
  });
  assert.equal(
    currentContainer.children[0].implementation.key,
    "business-scope-reference",
  );
  assert.equal(
    currentContainer.outputs.every(
      (output) =>
        output.mapping?.kind === "ref" &&
        output.mapping.nodeId === ACTIVE_BUSINESS_SCOPE_REF_ID,
    ),
    true,
  );
  assert.equal(
    v2.viewState.cameras[scopeCameraKey({
      domain: "app",
      nodeId: "application_root",
    })].scale,
    1,
  );
  assert.equal(
    v2.rootIntent.children
      .filter((node) => node.id !== "current_container")
      .every((node) => node.displayMode === "minimized"),
    true,
  );
  assert.equal(nodeDisplayMode(getBusinessRoot(v2)), "minimized");
  assert.equal(nodeDisplayMode(getBusinessRoot(v2).children[0]), "minimized");
});

test("exports a v1 document that the stable runtime can reopen", () => {
  const v2 = createApplicationDocument(businessRoot, []);
  const v1 = exportCompatibleV1(v2);

  assert.equal(v1.version, 1);
  assert.deepEqual(v1.rootIntent, businessRoot);
  assert.deepEqual(loadIntentDocument(v1).businessRootId, businessRoot.id);
});

test("round-trips v2 and never persists derived edges", () => {
  const v2 = createApplicationDocument(
    { ...businessRoot, edges: [{ id: "derived" }] },
    [],
  );
  const json = serializeIntentDocument(v2);
  const loaded = loadIntentDocument(JSON.parse(json));

  assert.equal(loaded.version, 2);
  assert.equal(loaded.businessRootId, businessRoot.id);
  assert.doesNotMatch(json, /"edges"/);
});

test("keeps the scope toolbar live and backfills older v2 documents", () => {
  const v2 = createApplicationDocument(businessRoot, []);
  const toolbar = v2.rootIntent.children.find(
    (node) => node.id === "scope_toolbar",
  );

  assert.equal(toolbar.implementation.config.lod, "always-live");
  delete toolbar.implementation.config.lod;
  const currentContainer = v2.rootIntent.children.find(
    (node) => node.id === "current_container",
  );
  currentContainer.children = undefined;
  currentContainer.outputs = currentContainer.outputs.map((output) => ({
    ...output,
    mapping: undefined,
  }));
  v2.viewState.cameras = {
    application_root: { scale: 0.55, x: 20, y: 30 },
    business_root: { scale: 1.25, x: 40, y: 50 },
  };

  const loaded = loadIntentDocument(v2);
  const loadedToolbar = loaded.rootIntent.children.find(
    (node) => node.id === "scope_toolbar",
  );
  assert.equal(loadedToolbar.implementation.config.lod, "always-live");
  const loadedContainer = loaded.rootIntent.children.find(
    (node) => node.id === "current_container",
  );
  assert.equal(loadedContainer.children.length, 1);
  assert.equal(
    loadedContainer.children[0].id,
    ACTIVE_BUSINESS_SCOPE_REF_ID,
  );
  assert.equal(
    loadedContainer.outputs.every(
      (output) =>
        output.mapping?.kind === "ref" &&
        output.mapping.nodeId === ACTIVE_BUSINESS_SCOPE_REF_ID,
    ),
    true,
  );
  assert.deepEqual(loaded.viewState.cameras["app:application_root"], {
    scale: 0.55,
    x: 20,
    y: 30,
  });
  assert.deepEqual(loaded.viewState.cameras["business:business_root"], {
    scale: 1.25,
    x: 40,
    y: 50,
  });

  const loadedAgain = loadIntentDocument(loaded);
  assert.equal(
    loadedAgain.rootIntent.children
      .find((node) => node.id === "current_container")
      .children.filter((node) => node.id === ACTIVE_BUSINESS_SCOPE_REF_ID)
      .length,
    1,
  );
});

test("rejects an unknown version and a missing business root", () => {
  assert.throws(() => loadIntentDocument({ version: 99 }), /不支持的文档版本/);
  const v2 = createApplicationDocument(businessRoot, []);
  assert.throws(
    () => loadIntentDocument({ ...v2, businessRootId: "missing" }),
    /业务根节点不存在/,
  );
});

test("namespaces application and business navigation frames", () => {
  const stack = [
    appScopeAddress("application_root"),
    appScopeAddress("current_container"),
    businessScopeAddress("business_root"),
    businessScopeAddress("child"),
  ];

  assert.deepEqual(
    stack.map(scopeCameraKey),
    [
      "app:application_root",
      "app:current_container",
      "business:business_root",
      "business:child",
    ],
  );
  assert.deepEqual(parentScopeStack(stack), stack.slice(0, -1));
  assert.deepEqual(
    parentScopeStack([appScopeAddress("application_root")]),
    [appScopeAddress("application_root")],
  );
});
