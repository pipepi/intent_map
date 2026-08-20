import assert from "node:assert/strict";
import test from "node:test";

import { serializeRelationDocument } from "../app/relation/document.ts";
import { sampleRelationDocument } from "./relation-document-fixture.mjs";
import {
  DEFAULT_PIP_LOADER_SOURCE,
  decodePip,
  encodePip,
} from "../app/runtime/pip.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { MemoryWorkspaceResourceStore } from "../a3/workspace/resource-store.ts";
import {
  openSplitWorkspace,
  saveSplitWorkspaceIntent,
  splitPipWorkspace,
} from "../a3/workspace/split-workspace.ts";

const io = { policy: UNLIMITED_PIP_IO_POLICY };

const packageWithResources = () => {
  const document = sampleRelationDocument();
  return {
    manifest: {
      packageId: "workspace-test",
      layer: "a5",
      artifactName: "workspace_test",
      name: "Workspace Test",
      packageVersion: "1.0.0",
      releaseDate: "20260807",
      rootNodeId: document.rootNodeIds[0],
      loaderAbi: "pip-loader/1",
      artifactRole: "authoring-source",
      providedEditorKinds: [],
      supportedDocumentKinds: [],
      preferredEditorKinds: ["relation-graph/1"],
      requiredEditorCapabilities: ["relation-workspace/1"],
      providedCapabilities: [],
      requiredCapabilities: [],
      requiredAuthoringCapabilities: [],
      ioPolicy: ASK_PIP_IO_POLICY,
      createdAt: "2026-08-07T00:00:00.000Z",
      contentType: "application/vnd.intent-map.pip",
    },
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeRelationDocument(document),
    assets: [
      { path: "ui/large.bin", mime: "application/octet-stream", bytes: new Uint8Array(4096).fill(7) },
      { path: "backend/main.rs", mime: "text/plain", bytes: new TextEncoder().encode("fn main() {}") },
    ],
  };
};

test("splits bundle assets out of intent.pip and reopens them lazily", async () => {
  const source = packageWithResources();
  const bundle = await encodePip(source, io);
  const split = await splitPipWorkspace(source, io);
  assert.equal(split.resources.length, 2);
  assert.ok(split.intentPip.byteLength < bundle.byteLength);

  const decodedIntent = await decodePip(split.intentPip, io);
  assert.deepEqual(decodedIntent.assets.map((asset) => asset.path), ["a3/workspace/resources.json"]);
  assert.equal(decodedIntent.rootTreeText, source.rootTreeText);

  const store = new MemoryWorkspaceResourceStore(split.resources);
  const opened = await openSplitWorkspace(split.intentPip, store, io);
  assert.equal(store.readCount, 0);
  assert.deepEqual((await opened.resources.read("ui/large.bin")).bytes, source.assets[0].bytes);
  assert.equal(store.readCount, 1);

  await opened.resources.write({
    path: "db/schema.sql",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode("create table example(id int);"),
  });
  const saved = await saveSplitWorkspaceIntent(opened.pip, opened.resources.index, io);
  const reopened = await openSplitWorkspace(saved, store, io);
  assert.ok(reopened.resources.entry("db/schema.sql"));
  assert.equal(reopened.pip.assets.length, 1);
});
