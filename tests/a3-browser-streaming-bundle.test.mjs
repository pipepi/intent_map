import assert from "node:assert/strict";
import test from "node:test";

import { streamBrowserWorkspaceBundle } from "../a3/bundle/browser-streaming-bundle.ts";
import { bundleSplitWorkspace } from "../a3/bundle/workspace-bundle.ts";
import { DEFAULT_PIP_LOADER_SOURCE, encodePip } from "../app/runtime/pip.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { createWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../a3/workspace/resource-index.ts";
import { openWorkspaceResourceSession } from "../a3/workspace/resource-store.ts";

class StreamingStore {
  constructor(resources) {
    this.resources = new Map(resources.map((resource) => [resource.path, resource]));
  }

  async read() {
    throw new Error("browser streaming bundler must not aggregate a resource");
  }

  async openRead(path) {
    const resource = this.resources.get(path);
    return {
      byteLength: resource.bytes.byteLength,
      chunks: (async function* () {
        for (let cursor = 0; cursor < resource.bytes.byteLength; cursor += 65537) {
          yield resource.bytes.slice(cursor, cursor + 65537);
        }
      })(),
    };
  }

  async write() {}
  async remove() {}
}

class OutputHandle {
  name = "a5_browser_stream_test_1_0_0_20260807.pip";
  bytes = new Uint8Array();

  async createWritable() {
    let staged = new Uint8Array();
    return {
      write: async ({ position, data }) => {
        const bytes = new Uint8Array(data);
        if (staged.byteLength < position + bytes.byteLength) {
          const grown = new Uint8Array(position + bytes.byteLength);
          grown.set(staged);
          staged = grown;
        }
        staged.set(bytes, position);
      },
      truncate: async (size) => { staged = staged.slice(0, size); },
      close: async () => { this.bytes = staged; },
      abort: async () => { staged = new Uint8Array(); },
    };
  }
}

test("browser Bundle streams resources to a file handle without aggregating them", async () => {
  const resources = [{
    path: "ui/large.bin",
    mediaType: "application/octet-stream",
    bytes: Uint8Array.from({ length: 2 * 1024 * 1024 + 31 }, (_, index) => index * 17),
  }];
  const index = await createWorkspaceResourceIndex(resources);
  const io = { policy: UNLIMITED_PIP_IO_POLICY };
  const pipBytes = await encodePip({
    manifest: {
      packageId: "browser-stream-test",
      layer: "a5",
      artifactName: "browser_stream_test",
      name: "Browser stream test",
      packageVersion: "1.0.0",
      releaseDate: "20260807",
      rootNodeId: "root",
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
    rootTreeText: JSON.stringify({ schemaVersion: 3, rootNodeId: "root" }),
    assets: [workspaceResourceIndexAsset(index)],
  }, io);
  const { decodePip } = await import("../app/runtime/pip.ts");
  const pip = await decodePip(pipBytes, io);
  const store = new StreamingStore(resources);
  const session = openWorkspaceResourceSession(pip, store);
  const expectedStore = {
    ...store,
    read: async (path) => store.resources.get(path).bytes.slice(),
  };
  const expectedSession = openWorkspaceResourceSession(pip, expectedStore);
  const expected = await bundleSplitWorkspace(pip, expectedSession, io);
  const output = new OutputHandle();

  const result = await streamBrowserWorkspaceBundle({
    pip,
    session,
    store,
    destination: output,
    options: io,
  });
  assert.equal(result.byteLength, output.bytes.byteLength.toString());
  assert.deepEqual(output.bytes, expected);
});
