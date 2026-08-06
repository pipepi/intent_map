import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  decodePip,
  encodePip,
} from "../app/runtime/pip.ts";
import {
  createApplicationDocument,
  loadIntentDocument,
  serializeIntentDocument,
} from "../app/runtime/model.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const manifest = {
  packageId: "intent-map.test",
  layer: "a5",
  artifactName: "intent_map_test",
  name: "Intent Map Test",
  packageVersion: "0.1.0",
  releaseDate: "20260726",
  rootNodeId: "application_root",
  loaderAbi: "pip-loader/1",
  artifactRole: "runtime",
  providedEditorKinds: [],
  supportedDocumentKinds: [],
  preferredEditorKinds: ["tree-map/1"],
  requiredEditorCapabilities: [],
  providedCapabilities: [],
  requiredCapabilities: [],
  requiredAuthoringCapabilities: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  contentType: "application/vnd.intent-map.pip",
};

const rootTreeText = JSON.stringify({
  version: 2,
  rootIntent: { id: "application_root" },
});

test("PIP v1 encodes deterministically and round-trips", async () => {
  const input = {
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText,
    assets: [
      { path: "index.html", mime: "text/html; charset=utf-8", bytes: new TextEncoder().encode("<h1>PIP</h1>") },
    ],
  };
  const first = await encodePip(input);
  const second = await encodePip(input);
  assert.deepEqual(first, second);
  assert.deepEqual(await decodePip(first), input);
});

test("PIP manifest requires layer, artifact name, semantic version, and release date", async () => {
  for (const invalid of [
    { ...manifest, layer: "a2" },
    { ...manifest, artifactName: "Intent-Map" },
    { ...manifest, packageVersion: "1.0" },
    { ...manifest, releaseDate: "20260230" },
  ]) {
    await assert.rejects(() => encodePip({
      manifest: invalid,
      loaderSource: DEFAULT_PIP_LOADER_SOURCE,
      rootTreeText,
      assets: [],
    }), /Invalid PIP manifest/);
  }
});

test("PIP v1 rejects corruption, truncation, and overlapping sections", async () => {
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText,
    assets: [],
  });

  const corrupted = bytes.slice();
  corrupted[corrupted.length - 1] ^= 0xff;
  await assert.rejects(() => decodePip(corrupted), /hash mismatch/);

  await assert.rejects(() => decodePip(bytes.slice(0, 40)), /truncated/);

  const overlapping = bytes.slice();
  const view = new DataView(overlapping.buffer);
  view.setBigUint64(16 + 48, view.getBigUint64(16, true), true);
  await assert.rejects(() => decodePip(overlapping), /overlap/);

  const oversized = bytes.slice();
  new DataView(oversized.buffer).setBigUint64(24, BigInt(64 * 1024 * 1024 + 1), true);
  await assert.rejects(() => decodePip(oversized), /size limit/);
});

test("PIP preserves the v3 multi-panel workspace and four-level tree", async () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeIntentDocument(document),
    assets: [],
  });
  const decoded = await decodePip(bytes);
  const loaded = loadIntentDocument(JSON.parse(decoded.rootTreeText));

  assert.equal(loaded.version, 3);
  assert.deepEqual(
    loaded.workspaceState.panels.map((panel) => panel.viewId),
    ["view-workbench", "view-free-layout"],
  );
  assert.equal(
    loaded.workspaceState.panels[0].surfaces.filter(
      (surface) => surface.kind === "feature-panel",
    ).length,
    2,
  );
  assert.equal(
    loaded.rootIntent.children
      .find((node) => node.id === "document_loader")
      .children[0].children[0].children[0].children[0].id,
    "scenario_actor_leaf",
  );
});

test("PIP round-trips an eight-level business tree without a depth cap", async () => {
  const businessRoot = createSampleBusinessRoot();
  let leaf = businessRoot.children[0].children[0].children[0];
  for (let depth = 5; depth <= 8; depth += 1) {
    const child = {
      id: `depth_${depth}`,
      name: `第 ${depth} 层`,
      description: "无限递归回归节点",
      kind: "operator",
      operator: "identity",
      inputs: [{ id: `in_${depth}`, name: "输入", type: "any", channel: "data" }],
      outputs: [{ id: `out_${depth}`, name: "输出", type: "any", channel: "data" }],
      children: [],
      position: { x: 80 * depth, y: 60 * depth },
      size: { width: 220, height: 150 },
    };
    leaf.children = [child];
    leaf = child;
  }
  const document = createApplicationDocument(businessRoot);
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeIntentDocument(document),
    assets: [],
  });
  const loaded = loadIntentDocument(
    JSON.parse((await decodePip(bytes)).rootTreeText),
  );
  const loadedBusinessRoot =
    loaded.rootIntent.children[0].children[0];
  let cursor = loadedBusinessRoot.children[0].children[0].children[0];
  for (let depth = 5; depth <= 8; depth += 1) cursor = cursor.children[0];
  assert.equal(cursor.id, "depth_8");
});
