import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPipManifest,
  decodePip as decodePipWithPolicy,
  encodePip as encodePipWithPolicy,
} from "../pip-editor/pip/index.ts";
import {
  ASK_PIP_IO_POLICY,
  UNLIMITED_PIP_IO_POLICY,
} from "../pip-editor/pip/io-policy.ts";
import {
  compatibleEditors,
  entryMatchesRef,
  resolveExactEditor,
} from "../pip-editor/pip/profile.ts";

const sha = "a".repeat(64);
const releaseDate = "20260807";
const ioOptions = { policy: UNLIMITED_PIP_IO_POLICY };
const encodePip = (input) => encodePipWithPolicy(input, ioOptions);
const decodePip = (input) => decodePipWithPolicy(input, ioOptions);

const manifest = (overrides = {}) => ({
  packageId: "baseline.intent",
  layer: "a1",
  artifactName: "baseline_intent",
  name: "Runtime baseline",
  packageVersion: "1.0.0",
  releaseDate,
  rootNodeId: "root",
  loaderAbi: "pip-loader/1",
  artifactRole: "authoring-source",
  providedEditorKinds: [],
  supportedDocumentKinds: [],
  preferredEditorKinds: ["tree-map/1"],
  requiredEditorCapabilities: [],
  providedCapabilities: [],
  requiredCapabilities: [],
  requiredAuthoringCapabilities: [],
  ioPolicy: ASK_PIP_IO_POLICY,
  createdAt: "2026-08-07T00:00:00.000Z",
  contentType: "application/vnd.intent-map.pip",
  ...overrides,
});

const reference = (overrides = {}) => ({
  origin: "system",
  packageId: "intent-map",
  version: "1.0.0",
  releaseDate,
  sha256: sha,
  ...overrides,
});

const catalogEntry = (overrides = {}) => ({
  file: "a2_intent_map_1_0_0_20260807.pip",
  origin: "system",
  readOnly: true,
  installed: true,
  trustedForExecution: true,
  valid: true,
  packageId: "intent-map",
  layer: "a2",
  packageVersion: "1.0.0",
  releaseDate,
  sha256: sha,
  providedEditorKinds: ["tree-map/1"],
  supportedDocumentKinds: ["intent-document/3"],
  providedCapabilities: [],
  ...overrides,
});

test("opening a PIP parses content without evaluating its loader", async () => {
  const loaderSource = "throw new Error('loader must not run while opening')";
  const rootTreeText = JSON.stringify({ version: 3, rootIntent: { id: "root" } });
  const bytes = await encodePip({
    manifest: manifest(),
    loaderSource,
    rootTreeText,
    assets: [{ path: "opaque.bin", mime: "application/octet-stream", bytes: new Uint8Array([1, 2, 3]) }],
  });

  const opened = await decodePip(bytes);
  assert.equal(opened.loaderSource, loaderSource);
  assert.equal(opened.rootTreeText, rootTreeText);
  assert.deepEqual(opened.assets[0].bytes, new Uint8Array([1, 2, 3]));
});

test("a2 and a3 manifests keep their distinct runtime contracts", () => {
  assert.throws(() => assertPipManifest(manifest({ layer: "a2" })), /Invalid PIP manifest/);
  assertPipManifest(manifest({
    layer: "a2",
    editorAbi: "pip-editor/1",
    providedEditorKinds: ["tree-map/1"],
  }));

  assert.throws(() => assertPipManifest(manifest({ layer: "a3" })), /Invalid PIP manifest/);
  assertPipManifest(manifest({
    layer: "a3",
    elementAbi: "relation-element/2", entry: "entry.mjs", elements: [{ id: "node", tag: "test-node", purpose: "node" }], permissions: [],
    sourcePaths: ["source/index.js"], sourceSha256: sha, entrySha256: sha, redistributable: true, providedCapabilities: ["relation-element/2"],
  }));
});

test("runtime references require exact origin version release date and hash", () => {
  const entry = catalogEntry();
  assert.equal(entryMatchesRef(entry, reference()), true);
  assert.equal(entryMatchesRef(entry, reference({ origin: "user" })), false);
  assert.equal(entryMatchesRef(entry, reference({ version: "1.0.1" })), false);
  assert.equal(entryMatchesRef(entry, reference({ releaseDate: "20260808" })), false);
  assert.equal(entryMatchesRef(entry, reference({ sha256: "b".repeat(64) })), false);
  assert.equal(resolveExactEditor([entry], reference()), entry);
});

test("editor compatibility filters document kinds and only uses preferences for ranking", () => {
  const tree = catalogEntry();
  const table = catalogEntry({
    file: "a2_table_1_0_0_20260807.pip",
    packageId: "table-editor",
    sha256: "b".repeat(64),
    providedEditorKinds: ["table/1"],
  });
  const incompatible = catalogEntry({
    file: "a2_other_1_0_0_20260807.pip",
    packageId: "other-editor",
    sha256: "c".repeat(64),
    supportedDocumentKinds: ["structured-records/1"],
  });

  assert.deepEqual(
    compatibleEditors([table, incompatible, tree], ["intent-document/3"], ["tree-map/1"])
      .map((entry) => entry.packageId),
    ["intent-map", "table-editor"],
  );
});
