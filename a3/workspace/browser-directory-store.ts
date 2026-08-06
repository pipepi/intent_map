import {
  assertWorkspaceResourcePath,
  type WorkspaceResource,
} from "./resource-index.ts";
import type { WorkspaceResourceStore } from "./resource-store.ts";

const directoryAndName = async (
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
) => {
  const segments = assertWorkspaceResourcePath(path).split("/");
  const name = segments.pop() as string;
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return { directory, name };
};

export class BrowserDirectoryResourceStore implements WorkspaceResourceStore {
  readonly #root: FileSystemDirectoryHandle;

  constructor(resourcesDirectory: FileSystemDirectoryHandle) {
    this.#root = resourcesDirectory;
  }

  async read(path: string): Promise<Uint8Array> {
    const { directory, name } = await directoryAndName(this.#root, path, false);
    const handle = await directory.getFileHandle(name);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }

  async write(resource: WorkspaceResource): Promise<void> {
    const { directory, name } = await directoryAndName(this.#root, resource.path, true);
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(resource.bytes.slice());
      await writable.close();
    } catch (error) {
      await writable.abort(error);
      throw error;
    }
  }

  async remove(path: string): Promise<void> {
    const { directory, name } = await directoryAndName(this.#root, path, false);
    await directory.removeEntry(name);
  }
}

export type BrowserSplitWorkspace = {
  root: FileSystemDirectoryHandle;
  resources: BrowserDirectoryResourceStore;
  readIntentPip: () => Promise<Uint8Array>;
  writeIntentPip: (bytes: Uint8Array) => Promise<void>;
};

export const openBrowserSplitWorkspace = async (
  root: FileSystemDirectoryHandle,
): Promise<BrowserSplitWorkspace> => {
  const intentHandle = await root.getFileHandle("intent.pip");
  const resourcesDirectory = await root.getDirectoryHandle("resources");
  return {
    root,
    resources: new BrowserDirectoryResourceStore(resourcesDirectory),
    readIntentPip: async () => new Uint8Array(
      await (await intentHandle.getFile()).arrayBuffer(),
    ),
    writeIntentPip: async (bytes) => {
      const writable = await intentHandle.createWritable();
      try {
        await writable.write(bytes.slice());
        await writable.close();
      } catch (error) {
        await writable.abort(error);
        throw error;
      }
    },
  };
};
