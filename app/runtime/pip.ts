const PIP_MAGIC = new Uint8Array([0x50, 0x49, 0x50, 0x00, 0x53, 0x45, 0x45, 0x44]);
const PIP_VERSION = 1;
const SECTION_COUNT = 4;
const SECTION_ENTRY_SIZE = 48;
const PIP_HEADER_SIZE = 16 + SECTION_COUNT * SECTION_ENTRY_SIZE;
const MAX_SECTION_SIZE = 64 * 1024 * 1024;
const MAX_PACKAGE_SIZE = 128 * 1024 * 1024;

export const DEFAULT_PIP_LOADER_SOURCE = `
export async function load(api) {
  const rootTree = api.readRootTree();
  if (!rootTree || typeof rootTree !== "object") {
    throw new Error("PIP root tree must be an object");
  }
  if (!rootTree.rootIntent || typeof rootTree.rootIntent.id !== "string") {
    throw new Error("PIP root tree is missing rootIntent");
  }
  api.emitDiagnostic({ level: "info", message: "Root tree loaded" });
  return { rootTree, rootNodeId: rootTree.rootIntent.id };
}
`.trim();

export type PipLayer = "a0" | "a1" | "a2" | "a3" | "a4" | "a5";
export type PipArtifactRole = "authoring-source" | "runtime" | "source-and-runtime";
export type PipPackageOrigin = "system" | "user" | "workspace";

export type PipPackageRef = {
  origin: Exclude<PipPackageOrigin, "workspace">;
  packageId: string;
  version: string;
  releaseDate: string;
  sha256: string;
};

export type PipRuntimeProfile = {
  schemaVersion: 1;
  profileId: string;
  name: string;
  seed?: PipPackageRef;
  loader: PipPackageRef;
  editor: PipPackageRef;
  capabilities: Record<string, PipPackageRef>;
};

export type PipManifest = {
  packageId: string;
  layer: PipLayer;
  artifactName: string;
  name: string;
  packageVersion: string;
  releaseDate: string;
  rootNodeId: string;
  loaderAbi: "pip-loader/1";
  artifactRole: PipArtifactRole;
  editorAbi?: "pip-editor/1";
  providedEditorKinds: string[];
  supportedDocumentKinds: string[];
  preferredEditorKinds: string[];
  requiredEditorCapabilities: string[];
  providedCapabilities: string[];
  requiredCapabilities: string[];
  requiredAuthoringCapabilities: string[];
  authoringKind?: string;
  authoringCompiler?: string;
  createdAt: string;
  contentType: "application/vnd.intent-map.pip";
};

export type PipAsset = {
  path: string;
  mime: string;
  bytes: Uint8Array;
};

export type PipPackage = {
  manifest: PipManifest;
  loaderSource: string;
  rootTreeText: string;
  assets: PipAsset[];
};

type PipSection = {
  offset: number;
  length: number;
  hash: Uint8Array;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const artifactNamePattern = /^[a-z][a-z0-9_]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const capabilityPattern = /^[a-z][a-z0-9.-]*\/[1-9]\d*$/;

const validReleaseDate = (value: string) => {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const assertPipManifest = (manifest: PipManifest): PipManifest => {
  if (!manifest) throw new Error("Invalid PIP manifest");
  const stringArrays = [
    manifest.providedEditorKinds,
    manifest.supportedDocumentKinds,
    manifest.preferredEditorKinds,
    manifest.requiredEditorCapabilities,
    manifest.providedCapabilities,
    manifest.requiredCapabilities,
    manifest.requiredAuthoringCapabilities,
  ];
  if (
    !["a0", "a1", "a2", "a3", "a4", "a5"].includes(manifest.layer) ||
    !artifactNamePattern.test(manifest.artifactName) ||
    !versionPattern.test(manifest.packageVersion) ||
    !validReleaseDate(manifest.releaseDate) ||
    !manifest.packageId ||
    !manifest.name ||
    !manifest.rootNodeId ||
    manifest.loaderAbi !== "pip-loader/1" ||
    !["authoring-source", "runtime", "source-and-runtime"].includes(manifest.artifactRole) ||
    manifest.contentType !== "application/vnd.intent-map.pip" ||
    stringArrays.some((values) => !Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) ||
    [...manifest.providedCapabilities, ...manifest.requiredAuthoringCapabilities]
      .some((capability) => !capabilityPattern.test(capability)) ||
    (manifest.layer === "a2" && (
      manifest.editorAbi !== "pip-editor/1" || manifest.providedEditorKinds.length === 0
    )) ||
    (manifest.layer !== "a2" && manifest.editorAbi !== undefined) ||
    (manifest.layer === "a3" && manifest.providedCapabilities.length === 0)
  ) throw new Error("Invalid PIP manifest");
  return manifest;
};

export const pipFilename = (manifest: PipManifest) => {
  assertPipManifest(manifest);
  return `${manifest.layer}_${manifest.artifactName}_${manifest.packageVersion.replaceAll(".", "_")}_${manifest.releaseDate}.pip`;
};

const align8 = (value: number) => (value + 7) & ~7;

const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sha256 = async (bytes: Uint8Array) => {
  const copy = Uint8Array.from(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
};

export const pipSha256 = async (bytes: Uint8Array) => [...await sha256(bytes)]
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

const assertSafeLength = (length: number, label: string) => {
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_SECTION_SIZE) {
    throw new Error(`${label} exceeds the PIP v1 size limit`);
  }
};

const writeU64 = (view: DataView, offset: number, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid PIP offset");
  view.setBigUint64(offset, BigInt(value), true);
};

const readU64 = (view: DataView, offset: number) => {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("PIP offset is too large");
  return Number(value);
};

export const encodePipAssets = (assets: PipAsset[]) => {
  const sorted = [...assets].sort((left, right) => left.path.localeCompare(right.path));
  const records = sorted.map((asset) => {
    if (!asset.path || asset.path.startsWith("/") || asset.path.includes("..") || asset.path.includes("\\")) {
      throw new Error(`Unsafe PIP asset path: ${asset.path}`);
    }
    const path = textEncoder.encode(asset.path);
    const mime = textEncoder.encode(asset.mime);
    if (path.length > 0xffff || mime.length > 0xffff) throw new Error("PIP asset metadata is too large");
    return { asset, path, mime };
  });
  const total = 4 + records.reduce(
    (sum, record) => sum + 2 + 2 + 8 + record.path.length + record.mime.length + record.asset.bytes.length,
    0,
  );
  assertSafeLength(total, "Asset section");
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, records.length, true);
  let cursor = 4;
  for (const record of records) {
    view.setUint16(cursor, record.path.length, true);
    view.setUint16(cursor + 2, record.mime.length, true);
    writeU64(view, cursor + 4, record.asset.bytes.length);
    cursor += 12;
    output.set(record.path, cursor);
    cursor += record.path.length;
    output.set(record.mime, cursor);
    cursor += record.mime.length;
    output.set(record.asset.bytes, cursor);
    cursor += record.asset.bytes.length;
  }
  return output;
};

export const decodePipAssets = (bytes: Uint8Array): PipAsset[] => {
  if (!bytes.length) return [];
  if (bytes.length < 4) throw new Error("PIP asset section is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  if (count > 100_000) throw new Error("PIP asset count exceeds the limit");
  const assets: PipAsset[] = [];
  const seen = new Set<string>();
  let cursor = 4;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 12 > bytes.length) throw new Error("PIP asset record is truncated");
    const pathLength = view.getUint16(cursor, true);
    const mimeLength = view.getUint16(cursor + 2, true);
    const dataLength = readU64(view, cursor + 4);
    cursor += 12;
    const end = cursor + pathLength + mimeLength + dataLength;
    if (end > bytes.length) throw new Error("PIP asset payload is truncated");
    const path = textDecoder.decode(bytes.subarray(cursor, cursor + pathLength));
    cursor += pathLength;
    const mime = textDecoder.decode(bytes.subarray(cursor, cursor + mimeLength));
    cursor += mimeLength;
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\") || seen.has(path)) {
      throw new Error(`Unsafe or duplicate PIP asset path: ${path}`);
    }
    seen.add(path);
    assets.push({ path, mime, bytes: bytes.slice(cursor, cursor + dataLength) });
    cursor += dataLength;
  }
  if (cursor !== bytes.length) throw new Error("PIP asset section contains trailing data");
  return assets;
};

export const encodePip = async (input: PipPackage): Promise<Uint8Array> => {
  assertPipManifest(input.manifest);
  const sections = [
    textEncoder.encode(JSON.stringify(input.manifest)),
    textEncoder.encode(input.loaderSource),
    textEncoder.encode(input.rootTreeText),
    encodePipAssets(input.assets),
  ];
  sections.forEach((section, index) => assertSafeLength(section.length, `Section ${index}`));
  let cursor = PIP_HEADER_SIZE;
  const descriptors: Array<{ offset: number; bytes: Uint8Array; hash: Uint8Array }> = [];
  for (const section of sections) {
    cursor = align8(cursor);
    descriptors.push({ offset: cursor, bytes: section, hash: await sha256(section) });
    cursor += section.length;
  }
  if (cursor > MAX_PACKAGE_SIZE) throw new Error("PIP package exceeds the v1 size limit");
  const output = new Uint8Array(cursor);
  const view = new DataView(output.buffer);
  output.set(PIP_MAGIC, 0);
  view.setUint32(8, PIP_VERSION, true);
  view.setUint32(12, PIP_HEADER_SIZE, true);
  descriptors.forEach((descriptor, index) => {
    const entry = 16 + index * SECTION_ENTRY_SIZE;
    writeU64(view, entry, descriptor.offset);
    writeU64(view, entry + 8, descriptor.bytes.length);
    output.set(descriptor.hash, entry + 16);
    output.set(descriptor.bytes, descriptor.offset);
  });
  return output;
};

export const decodePip = async (source: ArrayBuffer | Uint8Array): Promise<PipPackage> => {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.length < PIP_HEADER_SIZE) throw new Error("PIP header is truncated");
  if (bytes.length > MAX_PACKAGE_SIZE) throw new Error("PIP package exceeds the v1 size limit");
  if (!equalBytes(bytes.subarray(0, PIP_MAGIC.length), PIP_MAGIC)) throw new Error("Invalid PIP magic");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, true) !== PIP_VERSION) throw new Error("Unsupported PIP version");
  if (view.getUint32(12, true) !== PIP_HEADER_SIZE) throw new Error("Invalid PIP header size");
  const sections: PipSection[] = [];
  for (let index = 0; index < SECTION_COUNT; index += 1) {
    const entry = 16 + index * SECTION_ENTRY_SIZE;
    const offset = readU64(view, entry);
    const length = readU64(view, entry + 8);
    assertSafeLength(length, `Section ${index}`);
    if (offset < PIP_HEADER_SIZE || offset % 8 !== 0 || offset + length > bytes.length) {
      throw new Error(`PIP section ${index} is out of bounds`);
    }
    sections.push({ offset, length, hash: bytes.slice(entry + 16, entry + 48) });
  }
  const ordered = [...sections].sort((left, right) => left.offset - right.offset);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].offset + ordered[index - 1].length > ordered[index].offset) {
      throw new Error("PIP sections overlap");
    }
  }
  const payloads: Uint8Array[] = [];
  for (const [index, section] of sections.entries()) {
    const payload = bytes.slice(section.offset, section.offset + section.length);
    if (!equalBytes(await sha256(payload), section.hash)) throw new Error(`PIP section ${index} hash mismatch`);
    payloads.push(payload);
  }
  const manifest = assertPipManifest(JSON.parse(textDecoder.decode(payloads[0])) as PipManifest);
  return {
    manifest,
    loaderSource: textDecoder.decode(payloads[1]),
    rootTreeText: textDecoder.decode(payloads[2]),
    assets: decodePipAssets(payloads[3]),
  };
};

export const runPipLoader = (
  loaderSource: string,
  manifest: PipManifest,
  rootTreeText: string,
  timeoutMs = 3000,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const workerSource = `
self.onmessage = async (event) => {
  let moduleUrl;
  try {
    moduleUrl = URL.createObjectURL(new Blob([event.data.loaderSource], { type: "text/javascript" }));
    const loader = await import(moduleUrl);
    if (typeof loader.load !== "function") throw new Error("PIP loader must export load()");
    const diagnostics = [];
    const rootTree = JSON.parse(event.data.rootTreeText);
    const result = await loader.load(Object.freeze({
      manifest: Object.freeze(event.data.manifest),
      readRootTree: () => structuredClone(rootTree),
      emitDiagnostic: (entry) => diagnostics.push(structuredClone(entry)),
    }));
    self.postMessage({ ok: true, result, diagnostics });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
  }
};`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const timer = window.setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error("PIP loader timed out"));
    }, timeoutMs);
    worker.onmessage = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      if (event.data?.ok) resolve(event.data.result?.rootTree);
      else reject(new Error(event.data?.error ?? "PIP loader failed"));
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error("PIP loader worker failed"));
    };
    worker.postMessage({ loaderSource, manifest, rootTreeText });
  });
