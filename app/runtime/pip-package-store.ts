import {
  decodePip,
  pipSha256,
  type PipIoOptions,
  type PipPackageOrigin,
} from "./pip";
import type { PipCatalogEntry } from "./pip-profile";

export interface PipPackageStore {
  list(): Promise<PipCatalogEntry[]>;
  read(file: string): Promise<Uint8Array>;
  save(file: string, bytes: Uint8Array): Promise<void>;
  remove(file: string): Promise<void>;
}

type StoredPackage = { file: string; bytes: ArrayBuffer };

const requestResult = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});

export class IndexedDbPipPackageStore implements PipPackageStore {
  #database: Promise<IDBDatabase>;
  #ioOptions: PipIoOptions;

  constructor(ioOptions: PipIoOptions, databaseName = "intent-map-user-registry") {
    this.#ioOptions = ioOptions;
    this.#database = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("packages", { keyPath: "file" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Cannot open PIP registry"));
    });
  }

  async #store(mode: IDBTransactionMode) {
    return (await this.#database).transaction("packages", mode).objectStore("packages");
  }

  async list(): Promise<PipCatalogEntry[]> {
    const records = await requestResult<StoredPackage[]>((await this.#store("readonly")).getAll());
    return Promise.all(records.map(async ({ file, bytes }) => {
      try {
        const source = new Uint8Array(bytes);
        const pip = await decodePip(source, this.#ioOptions);
        return {
          file,
          origin: "user" as PipPackageOrigin,
          readOnly: false,
          installed: true,
          trustedForExecution: false,
          valid: true,
          packageId: pip.manifest.packageId,
          layer: pip.manifest.layer,
          packageVersion: pip.manifest.packageVersion,
          releaseDate: pip.manifest.releaseDate,
          sha256: await pipSha256(source),
          providedEditorKinds: pip.manifest.providedEditorKinds,
          supportedDocumentKinds: pip.manifest.supportedDocumentKinds,
          providedCapabilities: pip.manifest.providedCapabilities,
        };
      } catch (error) {
        return {
          file,
          origin: "user" as PipPackageOrigin,
          readOnly: false,
          installed: true,
          trustedForExecution: false,
          valid: false,
          providedEditorKinds: [],
          supportedDocumentKinds: [],
          providedCapabilities: [],
          error: error instanceof Error ? error.message : "Invalid PIP",
        };
      }
    }));
  }

  async read(file: string) {
    const record = await requestResult<StoredPackage | undefined>((await this.#store("readonly")).get(file));
    if (!record) throw new Error(`PIP package not found: ${file}`);
    return new Uint8Array(record.bytes);
  }

  async save(file: string, bytes: Uint8Array) {
    if ((await requestResult((await this.#store("readonly")).getKey(file))) !== undefined) {
      throw new Error(`PIP version already exists: ${file}`);
    }
    const pip = await decodePip(bytes, this.#ioOptions);
    const expected = `${pip.manifest.layer}_${pip.manifest.artifactName}_${pip.manifest.packageVersion.replaceAll(".", "_")}_${pip.manifest.releaseDate}.pip`;
    if (file !== expected) throw new Error("PIP filename does not match manifest");
    await requestResult((await this.#store("readwrite")).add({ file, bytes: Uint8Array.from(bytes).buffer }));
  }

  async remove(file: string) {
    await requestResult((await this.#store("readwrite")).delete(file));
  }
}
