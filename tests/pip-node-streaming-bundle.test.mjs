import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { relationDocumentValues, serializeRelationDocument } from "../pip-editor/relation/document.ts";
import { sampleRelationDocument } from "./relation-document-fixture.mjs";
import { DEFAULT_PIP_LOADER_SOURCE, decodePip } from "../pip-editor/pip/index.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip/io-policy.ts";
import { bundleSplitWorkspace } from "../pip-editor/pip/bundle/workspace-bundle.ts";
import { streamNodeWorkspaceBundle } from "../pip-editor/pip/bundle/node-streaming-bundle.ts";
import { streamUnbundleNodeWorkspace } from "../pip-editor/pip/bundle/node-streaming-unbundle.ts";
import { NodeDirectoryResourceStore } from "../pip-editor/pip/workspace/node-directory-store.ts";
import { createWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../pip-editor/pip/workspace/resource-index.ts";
import { openWorkspaceResourceSession } from "../pip-editor/pip/workspace/resource-store.ts";

const io = { policy: UNLIMITED_PIP_IO_POLICY };

test("node streaming Bundle is byte-identical without aggregating resources through read()", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-stream-bundle-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const resourcesDirectory = path.join(temporary, "resources");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(resourcesDirectory);
  const resources = [
    {
      path: "backend/main.rs",
      mediaType: "text/plain; charset=utf-8",
      bytes: new TextEncoder().encode("fn main() {}\n"),
    },
    {
      path: "ui/large.bin",
      mediaType: "application/octet-stream",
      bytes: new Uint8Array(2 * 1024 * 1024).fill(42),
    },
  ];
  const store = new NodeDirectoryResourceStore(resourcesDirectory);
  for (const resource of resources) await store.write(resource);
  const index = await createWorkspaceResourceIndex(resources);
  const document = sampleRelationDocument();
  const pip = {
    manifest: {
      packageId: "stream-bundle-test",
      layer: "a1",
      artifactName: "stream_bundle_test",
      name: "Stream Bundle Test",
      packageVersion: "1.0.0",
      releaseDate: "20260807",
      rootNodeId: relationDocumentValues(document).rootNodeIds[0],
      loaderAbi: "pip-loader/1",
      artifactRole: "authoring-source",
      providedEditorKinds: [],
      supportedDocumentKinds: [],
      preferredEditorKinds: ["relation-graph/1"],
      requiredEditorCapabilities: ["relation-workspace/2"],
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
  const session = openWorkspaceResourceSession(pip, store);
  const expected = await bundleSplitWorkspace(pip, session, io);
  store.read = async () => { throw new Error("streaming bundler must not call read()"); };

  const destination = path.join(temporary, "a1_stream_bundle_test_1_0_0_20260807.pip");
  const result = await streamNodeWorkspaceBundle({ pip, session, store, destination, options: io });
  const actual = new Uint8Array(await readFile(destination));
  assert.equal(result.byteLength, actual.byteLength.toString());
  assert.deepEqual(actual, expected);
  const decoded = await decodePip(actual, io);
  assert.equal(decoded.assets.length, 3);

  const restored = path.join(temporary, "restored");
  const unpacked = await streamUnbundleNodeWorkspace({
    bundle: destination,
    destination: restored,
    options: io,
  });
  assert.equal(unpacked.resourceCount, 2);
  assert.deepEqual(
    new Uint8Array(await readFile(path.join(restored, "resources/ui/large.bin"))),
    resources[1].bytes,
  );
  const restoredIntent = await decodePip(
    new Uint8Array(await readFile(path.join(restored, "intent.pip"))),
    io,
  );
  assert.deepEqual(restoredIntent.assets.map((asset) => asset.path), [
    "a3/workspace/resources.json",
  ]);
});
