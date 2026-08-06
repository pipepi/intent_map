import type { PipPackage } from "../../app/runtime/pip.ts";
import { pipSha256 } from "../../app/runtime/pip.ts";
import {
  assertWorkspaceResourcePath,
  readWorkspaceResourceIndex,
  type WorkspaceResource,
  type WorkspaceResourceEntry,
  type WorkspaceResourceIndex,
} from "./resource-index.ts";

export interface WorkspaceResourceStore {
  read(path: string): Promise<Uint8Array>;
  write(resource: WorkspaceResource): Promise<void>;
  remove(path: string): Promise<void>;
}

export class WorkspaceResourceSession {
  readonly index: WorkspaceResourceIndex;
  readonly #store: WorkspaceResourceStore;
  readonly #entries: Map<string, WorkspaceResourceEntry>;

  constructor(index: WorkspaceResourceIndex, store: WorkspaceResourceStore) {
    this.index = index;
    this.#store = store;
    this.#entries = new Map(index.resources.map((entry) => [entry.path, entry]));
  }

  list(): readonly WorkspaceResourceEntry[] {
    return this.index.resources;
  }

  entry(path: string): WorkspaceResourceEntry | undefined {
    return this.#entries.get(assertWorkspaceResourcePath(path));
  }

  async read(path: string): Promise<WorkspaceResource> {
    const normalized = assertWorkspaceResourcePath(path);
    const entry = this.#entries.get(normalized);
    if (!entry) throw new Error(`Resource is not indexed by intent.pip: ${normalized}`);
    const bytes = await this.#store.read(normalized);
    if (bytes.byteLength.toString() !== entry.byteLength) {
      throw new Error(`${normalized}: resource byte length changed`);
    }
    if (await pipSha256(bytes) !== entry.sha256) {
      throw new Error(`${normalized}: resource SHA-256 changed`);
    }
    return { path: normalized, mediaType: entry.mediaType, bytes };
  }
}

export const openWorkspaceResourceSession = (
  pip: Pick<PipPackage, "assets">,
  store: WorkspaceResourceStore,
): WorkspaceResourceSession => {
  const index = readWorkspaceResourceIndex(pip);
  if (!index) throw new Error("intent.pip has no split workspace resource index");
  return new WorkspaceResourceSession(index, store);
};

export class MemoryWorkspaceResourceStore implements WorkspaceResourceStore {
  readonly #resources = new Map<string, WorkspaceResource>();
  readCount = 0;

  constructor(resources: WorkspaceResource[] = []) {
    for (const resource of resources) {
      const path = assertWorkspaceResourcePath(resource.path);
      this.#resources.set(path, { ...resource, path, bytes: resource.bytes.slice() });
    }
  }

  async read(path: string): Promise<Uint8Array> {
    this.readCount += 1;
    const resource = this.#resources.get(assertWorkspaceResourcePath(path));
    if (!resource) throw new Error(`Workspace resource does not exist: ${path}`);
    return resource.bytes.slice();
  }

  async write(resource: WorkspaceResource): Promise<void> {
    const path = assertWorkspaceResourcePath(resource.path);
    this.#resources.set(path, { ...resource, path, bytes: resource.bytes.slice() });
  }

  async remove(path: string): Promise<void> {
    this.#resources.delete(assertWorkspaceResourcePath(path));
  }
}
