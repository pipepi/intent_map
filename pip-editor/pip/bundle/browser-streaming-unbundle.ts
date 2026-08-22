import {
  PIP_HEADER_SIZE,
  PIP_MAGIC,
  PIP_SECTION_COUNT,
  PIP_SECTION_ENTRY_SIZE,
  PIP_VERSION,
  assertPipManifest,
  authorizePipIoMetric,
  encodePip,
  pipFilename,
  pipSha256,
  type PipIoOptions,
  type PipManifest,
} from "../index.ts";
import {
  PIP_WORKSPACE_INDEX_MIME,
  PIP_WORKSPACE_INDEX_PATH,
  assertWorkspaceResourceIndex,
  assertWorkspaceResourcePath,
  workspaceResourceEntriesEqual,
  workspaceResourceIndexAsset,
  type WorkspaceResourceEntry,
  type WorkspaceResourceIndex,
} from "../workspace/resource-index.ts";
import { IncrementalSha256 } from "./incremental-sha256.ts";

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
type SectionDescriptor = { offset: number; length: number; hash: Uint8Array };

const readExact = async (file: File, length: number, position: number) => {
  const bytes = new Uint8Array(await file.slice(position, position + length).arrayBuffer());
  if (bytes.byteLength !== length) throw new Error("Bundle is truncated");
  return bytes;
};

const parseHeader = (header: Uint8Array, fileLength: number): SectionDescriptor[] => {
  if (!equalBytes(header.subarray(0, PIP_MAGIC.byteLength), PIP_MAGIC)) {
    throw new Error("Invalid PIP magic");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(8, true) !== PIP_VERSION || view.getUint32(12, true) !== PIP_HEADER_SIZE) {
    throw new Error("Unsupported PIP header");
  }
  const sections: SectionDescriptor[] = [];
  for (let index = 0; index < PIP_SECTION_COUNT; index += 1) {
    const entry = 16 + index * PIP_SECTION_ENTRY_SIZE;
    const offset = view.getBigUint64(entry, true);
    const length = view.getBigUint64(entry + 8, true);
    if (offset > BigInt(Number.MAX_SAFE_INTEGER) || length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`PIP section ${index} exceeds this browser's addressable range`);
    }
    const start = Number(offset);
    const size = Number(length);
    if (start < PIP_HEADER_SIZE || start % 8 !== 0 || start + size > fileLength) {
      throw new Error(`PIP section ${index} is out of bounds`);
    }
    sections.push({ offset: start, length: size, hash: header.slice(entry + 16, entry + 48) });
  }
  const ordered = [...sections].sort((left, right) => left.offset - right.offset);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].offset + ordered[index - 1].length > ordered[index].offset) {
      throw new Error("PIP sections overlap");
    }
  }
  return sections;
};

const readVerifiedSection = async (file: File, section: SectionDescriptor, label: string) => {
  const bytes = await readExact(file, section.length, section.offset);
  if (await pipSha256(bytes) !== hex(section.hash)) throw new Error(`${label} hash mismatch`);
  return bytes;
};

const assertEmptyDirectory = async (directory: FileSystemDirectoryHandle) => {
  const keys = (directory as FileSystemDirectoryHandle & {
    keys(): AsyncIterable<string>;
  }).keys();
  for await (const name of keys) {
    throw new Error(`Workspace destination must be empty; found ${name}`);
  }
};

const resourceDestination = async (
  resourcesRoot: FileSystemDirectoryHandle,
  resourcePath: string,
) => {
  const segments = assertWorkspaceResourcePath(resourcePath).split("/");
  const name = segments.pop() as string;
  let directory = resourcesRoot;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  return directory.getFileHandle(name, { create: true });
};

export const streamUnbundleBrowserWorkspace = async ({
  bundle,
  destination,
  options,
}: {
  bundle: File;
  destination: FileSystemDirectoryHandle;
  options: PipIoOptions;
}): Promise<{ directory: string; resourceCount: number; intentPipBytes: number }> => {
  await assertEmptyDirectory(destination);
  await authorizePipIoMetric("maxPipBytes", bundle.size, "decode", options);
  let createdResources = false;
  let createdIntent = false;
  try {
    const header = await readExact(bundle, PIP_HEADER_SIZE, 0);
    const sections = parseHeader(header, bundle.size);
    const expandedSize = sections.reduce((total, section) => total + BigInt(section.length), BigInt(0));
    await authorizePipIoMetric("maxExpandedBytes", expandedSize, "decode", options);
    await authorizePipIoMetric("maxCompressionRatio", 1, "decode", options);

    const [manifestBytes, loaderBytes, rootBytes] = await Promise.all(
      sections.slice(0, 3).map((section, index) =>
        readVerifiedSection(bundle, section, `PIP section ${index}`)),
    );
    const manifest = assertPipManifest(
      JSON.parse(textDecoder.decode(manifestBytes)) as PipManifest,
    );
    if (bundle.name !== pipFilename(manifest)) {
      throw new Error(`Bundle filename does not match manifest: ${pipFilename(manifest)}`);
    }
    const loaderSource = textDecoder.decode(loaderBytes);
    const rootTreeText = textDecoder.decode(rootBytes);
    const resourcesRoot = await destination.getDirectoryHandle("resources", { create: true });
    createdResources = true;

    const assetSection = sections[3];
    const assetHash = new IncrementalSha256();
    let cursor = assetSection.offset;
    const assetEnd = assetSection.offset + assetSection.length;
    const countBytes = await readExact(bundle, 4, cursor);
    assetHash.update(countBytes);
    cursor += 4;
    const assetCount = new DataView(countBytes.buffer).getUint32(0, true);
    await authorizePipIoMetric("maxResourceCount", assetCount, "decode", options);
    const seen = new Set<string>();
    const actualResources: WorkspaceResourceEntry[] = [];
    let index: WorkspaceResourceIndex | null = null;

    for (let assetIndex = 0; assetIndex < assetCount; assetIndex += 1) {
      if (cursor + 12 > assetEnd) throw new Error("PIP asset record is truncated");
      const record = await readExact(bundle, 12, cursor);
      assetHash.update(record);
      cursor += 12;
      const recordView = new DataView(record.buffer);
      const pathLength = recordView.getUint16(0, true);
      const mimeLength = recordView.getUint16(2, true);
      const dataLengthBig = recordView.getBigUint64(4, true);
      if (dataLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Bundle resource exceeds this browser's addressable range");
      }
      const dataLength = Number(dataLengthBig);
      await authorizePipIoMetric("maxSingleResourceBytes", dataLengthBig, "decode", options);
      if (cursor + pathLength + mimeLength > assetEnd) {
        throw new Error("PIP asset metadata is truncated");
      }
      const metadataBytes = await readExact(bundle, pathLength + mimeLength, cursor);
      assetHash.update(metadataBytes);
      cursor += metadataBytes.byteLength;
      const resourcePath = textDecoder.decode(metadataBytes.subarray(0, pathLength));
      const mediaType = textDecoder.decode(metadataBytes.subarray(pathLength));
      if (!resourcePath || resourcePath.startsWith("/") || resourcePath.includes("..") || resourcePath.includes("\\") || seen.has(resourcePath)) {
        throw new Error(`Unsafe or duplicate PIP asset path: ${resourcePath}`);
      }
      seen.add(resourcePath);
      if (cursor + dataLength > assetEnd) throw new Error("PIP asset payload is truncated");

      if (resourcePath === PIP_WORKSPACE_INDEX_PATH) {
        if (mediaType !== PIP_WORKSPACE_INDEX_MIME || index) {
          throw new Error("Invalid workspace resource index asset");
        }
        const bytes = await readExact(bundle, dataLength, cursor);
        assetHash.update(bytes);
        cursor += dataLength;
        index = assertWorkspaceResourceIndex(JSON.parse(textDecoder.decode(bytes)) as unknown);
        continue;
      }

      const target = await resourceDestination(resourcesRoot, resourcePath);
      const output = await target.createWritable({ keepExistingData: false });
      const resourceHash = new IncrementalSha256();
      let remaining = dataLength;
      try {
        while (remaining > 0) {
          const size = Math.min(remaining, 64 * 1024);
          const chunk = await readExact(bundle, size, cursor);
          assetHash.update(chunk);
          resourceHash.update(chunk);
          await output.write(chunk.slice());
          cursor += size;
          remaining -= size;
        }
        await output.close();
      } catch (error) {
        await output.abort(error);
        throw error;
      }
      actualResources.push({
        path: assertWorkspaceResourcePath(resourcePath),
        mediaType,
        byteLength: dataLengthBig.toString(),
        sha256: hex(resourceHash.digest()),
      });
    }
    if (cursor !== assetEnd) throw new Error("PIP asset section contains trailing data");
    if (!equalBytes(assetHash.digest(), assetSection.hash)) throw new Error("PIP section 3 hash mismatch");
    if (!index) throw new Error("Bundle has no split workspace resource index");
    actualResources.sort((left, right) => left.path.localeCompare(right.path));
    if (!workspaceResourceEntriesEqual(actualResources, index.resources)) {
      throw new Error("Workspace resources do not match intent.pip resource index");
    }

    const intentPip = await encodePip({
      manifest,
      loaderSource,
      rootTreeText,
      assets: [workspaceResourceIndexAsset(index)],
    }, options);
    const intentHandle = await destination.getFileHandle("intent.pip", { create: true });
    createdIntent = true;
    const intentOutput = await intentHandle.createWritable({ keepExistingData: false });
    try {
      await intentOutput.write(intentPip.slice());
      await intentOutput.close();
    } catch (error) {
      await intentOutput.abort(error);
      throw error;
    }
    return {
      directory: destination.name,
      resourceCount: actualResources.length,
      intentPipBytes: intentPip.byteLength,
    };
  } catch (error) {
    if (createdIntent) await destination.removeEntry("intent.pip").catch(() => {});
    if (createdResources) await destination.removeEntry("resources", { recursive: true }).catch(() => {});
    throw error;
  }
};
