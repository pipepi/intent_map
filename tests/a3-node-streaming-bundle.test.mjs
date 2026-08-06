import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApplicationDocument, serializeIntentDocument } from "../app/runtime/model.ts";
import { DEFAULT_PIP_LOADER_SOURCE, decodePip } from "../app/runtime/pip.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { bundleSplitWorkspace } from "../a3/bundle/workspace-bundle.ts";
import { streamNodeWorkspaceBundle } from "../a3/bundle/node-streaming-bundle.ts";
import { NodeDirectoryResourceStore } from "../a3/workspace/node-directory-store.ts";
import { createWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../a3/workspace/resource-index.ts";
import { openWorkspaceResourceSession } from "../a3/workspace/resource-store.ts";

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
  const root = {
    id: "stream_bundle_root",
    name: "Stream Bundle Root",
    description: "Streaming Bundle test",
    kind: "composite",
    inputs: [],
    outputs: [],
    children: [],
    position: { x: 0, y: 0 },
  };
  const pip = {
    manifest: {
      packageId: "stream-bundle-test",
      layer: "a5",
      artifactName: "stream_bundle_test",
      name: "Stream Bundle Test",
      packageVersion: "1.0.0",
      releaseDate: "20260807",
      rootNodeId: root.id,
      loaderAbi: "pip-loader/1",
      artifactRole: "authoring-source",
      providedEditorKinds: [],
      supportedDocumentKinds: [],
      preferredEditorKinds: ["tree-map/1"],
      requiredEditorCapabilities: ["intent-document/3"],
      providedCapabilities: [],
      requiredCapabilities: [],
      requiredAuthoringCapabilities: [],
      ioPolicy: ASK_PIP_IO_POLICY,
      createdAt: "2026-08-07T00:00:00.000Z",
      contentType: "application/vnd.intent-map.pip",
    },
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeIntentDocument(createApplicationDocument(root)),
    assets: [workspaceResourceIndexAsset(index)],
  };
  const session = openWorkspaceResourceSession(pip, store);
  const expected = await bundleSplitWorkspace(pip, session, io);
  store.read = async () => { throw new Error("streaming bundler must not call read()"); };

  const destination = path.join(temporary, "bundle.pip");
  const result = await streamNodeWorkspaceBundle({ pip, session, store, destination, options: io });
  const actual = new Uint8Array(await readFile(destination));
  assert.equal(result.byteLength, actual.byteLength.toString());
  assert.deepEqual(actual, expected);
  const decoded = await decodePip(actual, io);
  assert.equal(decoded.assets.length, 3);
});
