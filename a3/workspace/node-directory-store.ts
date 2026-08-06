import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  assertWorkspaceResourcePath,
  type WorkspaceResource,
} from "./resource-index.ts";
import type { StreamingWorkspaceResourceStore } from "./resource-store.ts";

const assertDirectory = async (directory: string, label: string) => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular, non-symlink directory`);
  }
};

const assertRegularFile = async (file: string, label: string) => {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular, non-symlink file`);
  }
  return metadata;
};

const ensureDirectoryPath = async (root: string, segments: string[], create: boolean) => {
  let current = root;
  await assertDirectory(current, "resources directory");
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      await assertDirectory(current, "resource parent");
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
  return current;
};

const atomicWrite = async (destination: string, bytes: Uint8Array) => {
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await rename(temporary, destination);
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
};

const resourceTarget = async (
  root: string,
  resourcePath: string,
  createParents: boolean,
) => {
  const segments = assertWorkspaceResourcePath(resourcePath).split("/");
  const name = segments.pop() as string;
  const directory = await ensureDirectoryPath(root, segments, createParents);
  return path.join(directory, name);
};

export class NodeDirectoryResourceStore implements StreamingWorkspaceResourceStore {
  readonly #root: string;

  constructor(resourcesDirectory: string) {
    this.#root = path.resolve(resourcesDirectory);
  }

  async read(resourcePath: string): Promise<Uint8Array> {
    const target = await resourceTarget(this.#root, resourcePath, false);
    await assertRegularFile(target, "workspace resource");
    return new Uint8Array(await readFile(target));
  }

  async openRead(resourcePath: string): Promise<{
    byteLength: number;
    chunks: AsyncIterable<Uint8Array>;
  }> {
    const target = await resourceTarget(this.#root, resourcePath, false);
    const metadata = await assertRegularFile(target, "workspace resource");
    return {
      byteLength: metadata.size,
      chunks: createReadStream(target),
    };
  }

  async write(resource: WorkspaceResource): Promise<void> {
    const target = await resourceTarget(this.#root, resource.path, true);
    await atomicWrite(target, resource.bytes);
  }

  async remove(resourcePath: string): Promise<void> {
    const target = await resourceTarget(this.#root, resourcePath, false);
    await assertRegularFile(target, "workspace resource");
    await rm(target);
  }
}

export type NodeSplitWorkspace = {
  root: string;
  resources: NodeDirectoryResourceStore;
  readIntentPip: () => Promise<Uint8Array>;
  writeIntentPip: (bytes: Uint8Array) => Promise<void>;
};

export const openNodeSplitWorkspace = async (workspaceRoot: string): Promise<NodeSplitWorkspace> => {
  const root = path.resolve(workspaceRoot);
  await assertDirectory(root, "workspace root");
  const intentPath = path.join(root, "intent.pip");
  const resourcesPath = path.join(root, "resources");
  await assertRegularFile(intentPath, "intent.pip");
  await assertDirectory(resourcesPath, "resources directory");
  return {
    root,
    resources: new NodeDirectoryResourceStore(resourcesPath),
    readIntentPip: async () => new Uint8Array(await readFile(intentPath)),
    writeIntentPip: async (bytes) => atomicWrite(intentPath, bytes),
  };
};
