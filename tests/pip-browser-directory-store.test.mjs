import assert from "node:assert/strict";
import test from "node:test";

import { openBrowserSplitWorkspace } from "../pip-editor/pip/workspace/browser-directory-store.ts";

class FileHandle {
  constructor(bytes = new Uint8Array()) {
    this.bytes = bytes;
  }

  async getFile() {
    const bytes = this.bytes;
    return {
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.slice().buffer,
      stream: () => new ReadableStream({
        start(controller) {
          const middle = Math.ceil(bytes.byteLength / 2);
          controller.enqueue(bytes.slice(0, middle));
          controller.enqueue(bytes.slice(middle));
          controller.close();
        },
      }),
    };
  }

  async createWritable() {
    return {
      write: async (bytes) => { this.bytes = new Uint8Array(bytes); },
      close: async () => {},
      abort: async () => {},
    };
  }
}

class DirectoryHandle {
  directories = new Map();
  files = new Map();

  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name) && options.create) this.directories.set(name, new DirectoryHandle());
    if (!this.directories.has(name)) throw new Error(`missing directory: ${name}`);
    return this.directories.get(name);
  }

  async getFileHandle(name, options = {}) {
    if (!this.files.has(name) && options.create) this.files.set(name, new FileHandle());
    if (!this.files.has(name)) throw new Error(`missing file: ${name}`);
    return this.files.get(name);
  }

  async removeEntry(name) {
    if (!this.files.delete(name)) throw new Error(`missing file: ${name}`);
  }
}

test("browser split workspace keeps intent.pip and resources as separate files", async () => {
  const root = new DirectoryHandle();
  root.files.set("intent.pip", new FileHandle(new Uint8Array([1, 2, 3])));
  root.directories.set("resources", new DirectoryHandle());

  const workspace = await openBrowserSplitWorkspace(root);
  assert.deepEqual(await workspace.readIntentPip(), new Uint8Array([1, 2, 3]));

  await workspace.resources.write({
    path: "ui/image.bin",
    mediaType: "application/octet-stream",
    bytes: new Uint8Array([7, 8]),
  });
  assert.deepEqual(await workspace.resources.read("ui/image.bin"), new Uint8Array([7, 8]));
  const opened = await workspace.resources.openRead("ui/image.bin");
  assert.equal(opened.byteLength, 2);
  const chunks = [];
  for await (const chunk of opened.chunks) chunks.push(...chunk);
  assert.deepEqual(chunks, [7, 8]);
  await workspace.resources.remove("ui/image.bin");
  await assert.rejects(() => workspace.resources.read("ui/image.bin"), /missing file/);

  await workspace.writeIntentPip(new Uint8Array([4, 5]));
  assert.deepEqual(await workspace.readIntentPip(), new Uint8Array([4, 5]));
});
