import assert from "node:assert/strict";
import test from "node:test";

import { streamUnbundleBrowserWorkspace } from "../pip-editor/pip-package/bundle/browser-streaming-unbundle.ts";
import { bundleSplitWorkspace } from "../pip-editor/pip-package/bundle/workspace-bundle.ts";
import { DEFAULT_PIP_LOADER_SOURCE, decodePip } from "../pip-editor/pip-package/index.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip-package/io-policy.ts";
import { createWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../pip-editor/pip-package/workspace/resource-index.ts";
import { MemoryWorkspaceResourceStore, openWorkspaceResourceSession } from "../pip-editor/pip-package/workspace/resource-store.ts";

class FileHandle {
  bytes = new Uint8Array();
  async createWritable() {
    let staged = new Uint8Array();
    return {
      write: async (bytes) => {
        const chunk = new Uint8Array(bytes);
        const combined = new Uint8Array(staged.byteLength + chunk.byteLength);
        combined.set(staged);
        combined.set(chunk, staged.byteLength);
        staged = combined;
      },
      close: async () => { this.bytes = staged; },
      abort: async () => { staged = new Uint8Array(); },
    };
  }
}

class DirectoryHandle {
  constructor(name) { this.name = name; }
  directories = new Map();
  files = new Map();
  async *keys() { yield* this.directories.keys(); yield* this.files.keys(); }
  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name) && options.create) this.directories.set(name, new DirectoryHandle(name));
    if (!this.directories.has(name)) throw new Error(`missing directory: ${name}`);
    return this.directories.get(name);
  }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name) && options.create) this.files.set(name, new FileHandle());
    if (!this.files.has(name)) throw new Error(`missing file: ${name}`);
    return this.files.get(name);
  }
  async removeEntry(name) { this.files.delete(name); this.directories.delete(name); }
}

test("browser unbundle streams a Bundle into an empty split workspace", async () => {
  const resources = [{
    path: "frontend/large.bin",
    mediaType: "application/octet-stream",
    bytes: Uint8Array.from({ length: 2 * 1024 * 1024 + 19 }, (_, index) => index * 13),
  }];
  const index = await createWorkspaceResourceIndex(resources);
  const pip = {
    manifest: {
      packageId: "browser-unbundle-test",
      layer: "a1",
      artifactName: "browser_unbundle_test",
      name: "Browser unbundle test",
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
  };
  const io = { policy: UNLIMITED_PIP_IO_POLICY };
  const store = new MemoryWorkspaceResourceStore(resources);
  const bundleBytes = await bundleSplitWorkspace(pip, openWorkspaceResourceSession(pip, store), io);
  const bundle = {
    name: "a1_browser_unbundle_test_1_0_0_20260807.pip",
    size: bundleBytes.byteLength,
    slice: (start, end) => new Blob([bundleBytes.slice(start, end)]),
  };
  const destination = new DirectoryHandle("workspace");
  const result = await streamUnbundleBrowserWorkspace({ bundle, destination, options: io });
  assert.equal(result.resourceCount, 1);
  const resourcesDirectory = destination.directories.get("resources");
  assert.deepEqual(
    resourcesDirectory.directories.get("frontend").files.get("large.bin").bytes,
    resources[0].bytes,
  );
  const intent = await decodePip(destination.files.get("intent.pip").bytes, io);
  assert.deepEqual(intent.assets.map((asset) => asset.path), ["a3/workspace/resources.json"]);
});
