import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  decodePip as decodePipWithPolicy,
  encodePip as encodePipWithPolicy,
  pipFilename,
} from "../app/runtime/pip.ts";
import {
  ASK_PIP_IO_POLICY,
  UNLIMITED_PIP_IO_POLICY,
  pipLimit,
} from "../app/runtime/pip-io-policy.ts";
import { loadRelationDocument, serializeRelationDocument } from "../app/relation/document.ts";
import { sampleRelationDocument } from "./relation-document-fixture.mjs";

const manifest = {
  packageId: "intent-map.test",
  layer: "a5",
  artifactName: "intent_map_test",
  name: "Intent Map Test",
  packageVersion: "0.1.0",
  releaseDate: "20260726",
  rootNodeId: "sample.root",
  loaderAbi: "pip-loader/1",
  artifactRole: "runtime",
  providedEditorKinds: [],
  supportedDocumentKinds: [],
  preferredEditorKinds: ["tree-map/1"],
  requiredEditorCapabilities: [],
  providedCapabilities: [],
  requiredCapabilities: [],
  requiredAuthoringCapabilities: [],
  ioPolicy: ASK_PIP_IO_POLICY,
  createdAt: "2026-07-26T00:00:00.000Z",
  contentType: "application/vnd.intent-map.pip",
};

const rootTreeText = serializeRelationDocument(sampleRelationDocument());

const ioOptions = { policy: UNLIMITED_PIP_IO_POLICY };
const encodePip = (input) => encodePipWithPolicy(input, ioOptions);
const decodePip = (input) => decodePipWithPolicy(input, ioOptions);

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
    { ...manifest, ioPolicy: undefined },
  ]) {
    await assert.rejects(() => encodePip({
      manifest: invalid,
      loaderSource: DEFAULT_PIP_LOADER_SOURCE,
      rootTreeText,
      assets: [],
    }), /Invalid PIP manifest/);
  }
});

test("PIP manifest carries its exportable I/O policy", () => {
  assert.deepEqual(manifest.ioPolicy, ASK_PIP_IO_POLICY);
});

test("PIP export filenames preserve manifest identity across every layer", () => {
  for (const layer of ["a0", "a1", "a2", "a3", "a4", "a5"]) {
    const layeredManifest = {
      ...manifest,
      layer,
      artifactName: "crypto_cex_intent",
      ...(layer === "a2" ? {
        editorAbi: "pip-editor/1",
        providedEditorKinds: ["tree-map/1"],
      } : {}),
      ...(layer === "a3" ? {
        providedCapabilities: ["software-authoring/1"],
      } : {}),
    };
    assert.equal(
      pipFilename(layeredManifest),
      `${layer}_crypto_cex_intent_0_1_0_20260726.pip`,
    );
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

  await assert.rejects(
    () => decodePipWithPolicy(bytes, {
      policy: { ...UNLIMITED_PIP_IO_POLICY, maxPipBytes: pipLimit(bytes.length - 1) },
    }),
    /maxPipBytes exceeded/,
  );
});

test("PIP codecs require confirmation when no caller policy is supplied", async () => {
  const input = {
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText,
    assets: [],
  };
  await assert.rejects(() => encodePipWithPolicy(input), /confirmation required/);
  const bytes = await encodePip(input);
  await assert.rejects(() => decodePipWithPolicy(bytes), /confirmation required/);
  assert.deepEqual(
    await decodePipWithPolicy(bytes, { confirm: () => true }),
    input,
  );
});

test("PIP preserves a RelationDocument workspace", async () => {
  const document = sampleRelationDocument(4);
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeRelationDocument(document),
    assets: [],
  });
  const decoded = await decodePip(bytes);
  const loaded = loadRelationDocument(JSON.parse(decoded.rootTreeText));
  assert.equal(loaded.schemaVersion, 1);
  assert.ok(loaded.graph.nodes["sample.depth-4"]);
  assert.deepEqual(loaded.workspace.views, ["relation-graph"]);
});

test("PIP round-trips an eight-level relation composition without a depth cap", async () => {
  const document = sampleRelationDocument(8);
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeRelationDocument(document),
    assets: [],
  });
  const loaded = loadRelationDocument(
    JSON.parse((await decodePip(bytes)).rootTreeText),
  );
  assert.ok(loaded.graph.nodes["sample.depth-8"]);
});
