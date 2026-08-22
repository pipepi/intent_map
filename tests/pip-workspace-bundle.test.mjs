import assert from "node:assert/strict";
import test from "node:test";

import { serializeRelationDocument } from "../pip-editor/relation/document.ts";
import { sampleRelationDocument } from "./relation-document-fixture.mjs";
import { DEFAULT_PIP_LOADER_SOURCE, decodePip, encodePip } from "../pip-editor/pip/index.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip/io-policy.ts";
import { bundleSplitWorkspace, unpackWorkspaceBundle } from "../pip-editor/pip/bundle/workspace-bundle.ts";
import { MemoryWorkspaceResourceStore, openWorkspaceResourceSession } from "../pip-editor/pip/workspace/resource-store.ts";
import { createWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../pip-editor/pip/workspace/resource-index.ts";

const io = { policy: UNLIMITED_PIP_IO_POLICY };
const resources = [
  { path: "frontend/page.tsx", mediaType: "text/typescript", bytes: new TextEncoder().encode("export default 1") },
  { path: "ui/hero.bin", mediaType: "application/octet-stream", bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]) },
];

const packageFor = (index) => {
  const document = sampleRelationDocument();
  return {
    manifest: {
      packageId: "bundle-test",
      layer: "a1",
      artifactName: "bundle_test",
      name: "Bundle Test",
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
    assets: [workspaceResourceIndexAsset(index)],
  };
};

test("workspace Bundle round-trips back to the authoritative split form", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  const pip = packageFor(index);
  const session = openWorkspaceResourceSession(pip, new MemoryWorkspaceResourceStore(resources));
  const bundle = await bundleSplitWorkspace(pip, session, io);
  const bundled = await decodePip(bundle, io);
  assert.deepEqual(bundled.assets.map((asset) => asset.path), [
    "a3/workspace/resources.json",
    "frontend/page.tsx",
    "ui/hero.bin",
  ]);

  const unpacked = await unpackWorkspaceBundle(bundle, io);
  assert.deepEqual(unpacked.resources, resources);
  const intent = await decodePip(unpacked.intentPip, io);
  assert.deepEqual(intent.assets.map((asset) => asset.path), ["a3/workspace/resources.json"]);
  assert.equal(intent.rootTreeText, pip.rootTreeText);
});

test("workspace Bundle rejects an asset that does not match its authoritative index", async () => {
  const index = await createWorkspaceResourceIndex(resources);
  const pip = packageFor(index);
  const malformed = await encodePip({
    ...pip,
    assets: [
      workspaceResourceIndexAsset(index),
      { path: resources[0].path, mime: resources[0].mediaType, bytes: new Uint8Array([1]) },
      { path: resources[1].path, mime: resources[1].mediaType, bytes: resources[1].bytes },
    ],
  }, io);
  await assert.rejects(
    () => unpackWorkspaceBundle(malformed, io),
    /do not match/,
  );
});
