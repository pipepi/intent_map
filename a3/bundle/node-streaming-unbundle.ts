import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";

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
  type PipIoOptions,
  type PipManifest,
} from "../../app/runtime/pip.ts";
import {
  PIP_WORKSPACE_INDEX_MIME,
  PIP_WORKSPACE_INDEX_PATH,
  assertWorkspaceResourceIndex,
  assertWorkspaceResourcePath,
  workspaceResourceIndexAsset,
  workspaceResourceEntriesEqual,
  type WorkspaceResourceEntry,
  type WorkspaceResourceIndex,
} from "../workspace/resource-index.ts";

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const STREAM_CHUNK_BYTES = 64 * 1024;
type SectionDescriptor = { offset: number; length: number; hash: Uint8Array };

const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const assertMissing = async (destination: string) => {
  try {
    await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Workspace destination already exists: ${destination}`);
};

const readExact = async (file: FileHandle, length: number, position: number) => {
  const bytes = new Uint8Array(length);
  let read = 0;
  while (read < length) {
    const result = await file.read(bytes, read, length - read, position + read);
    if (!result.bytesRead) throw new Error("Bundle is truncated");
    read += result.bytesRead;
  }
  return bytes;
};

const writeAll = async (file: FileHandle, bytes: Uint8Array, position: number) => {
  let written = 0;
  while (written < bytes.byteLength) {
    const result = await file.write(bytes, written, bytes.byteLength - written, position + written);
    if (!result.bytesWritten) throw new Error("Workspace resource stopped accepting bytes");
    written += result.bytesWritten;
  }
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
      throw new Error(`PIP section ${index} exceeds this Node runtime's addressable range`);
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

const readVerifiedSection = async (
  file: FileHandle,
  section: SectionDescriptor,
  label: string,
) => {
  const bytes = await readExact(file, section.length, section.offset);
  if (!equalBytes(new Uint8Array(createHash("sha256").update(bytes).digest()), section.hash)) {
    throw new Error(`${label} hash mismatch`);
  }
  return bytes;
};

const resourceDestination = async (resourcesRoot: string, resourcePath: string) => {
  const segments = assertWorkspaceResourcePath(resourcePath).split("/");
  const name = segments.pop() as string;
  let directory = resourcesRoot;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    await mkdir(directory, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
  return path.join(directory, name);
};

export const streamUnbundleNodeWorkspace = async ({
  bundle: bundleInput,
  destination: destinationInput,
  options,
}: {
  bundle: string;
  destination: string;
  options: PipIoOptions;
}): Promise<{ path: string; resourceCount: number; intentPipBytes: number }> => {
  const bundle = path.resolve(bundleInput);
  const destination = path.resolve(destinationInput);
  await assertMissing(destination);
  const metadata = await lstat(bundle);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Bundle must be a regular, non-symlink file");
  }
  await authorizePipIoMetric("maxPipBytes", metadata.size, "decode", options);
  const file = await open(bundle, "r");
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, `.${path.basename(destination)}.tmp-`));
  try {
    const header = await readExact(file, PIP_HEADER_SIZE, 0);
    const sections = parseHeader(header, metadata.size);
    const expandedSize = sections.reduce((total, section) => total + BigInt(section.length), BigInt(0));
    await authorizePipIoMetric("maxExpandedBytes", expandedSize, "decode", options);
    await authorizePipIoMetric("maxCompressionRatio", 1, "decode", options);

    const [manifestBytes, loaderBytes, rootBytes] = await Promise.all(
      sections.slice(0, 3).map((section, index) =>
        readVerifiedSection(file, section, `PIP section ${index}`)),
    );
    const manifest = assertPipManifest(
      JSON.parse(textDecoder.decode(manifestBytes)) as PipManifest,
    );
    if (path.basename(bundle) !== pipFilename(manifest)) {
      throw new Error(`Bundle filename does not match manifest: ${pipFilename(manifest)}`);
    }
    const loaderSource = textDecoder.decode(loaderBytes);
    const rootTreeText = textDecoder.decode(rootBytes);
    const resourcesRoot = path.join(temporary, "resources");
    await mkdir(resourcesRoot);

    const assetSection = sections[3];
    const assetHash = createHash("sha256");
    let cursor = assetSection.offset;
    const assetEnd = assetSection.offset + assetSection.length;
    const countBytes = await readExact(file, 4, cursor);
    assetHash.update(countBytes);
    cursor += 4;
    const assetCount = new DataView(countBytes.buffer).getUint32(0, true);
    await authorizePipIoMetric("maxResourceCount", assetCount, "decode", options);
    const seen = new Set<string>();
    const actualResources: WorkspaceResourceEntry[] = [];
    let index: WorkspaceResourceIndex | null = null;

    for (let assetIndex = 0; assetIndex < assetCount; assetIndex += 1) {
      if (cursor + 12 > assetEnd) throw new Error("PIP asset record is truncated");
      const record = await readExact(file, 12, cursor);
      assetHash.update(record);
      cursor += 12;
      const recordView = new DataView(record.buffer);
      const pathLength = recordView.getUint16(0, true);
      const mimeLength = recordView.getUint16(2, true);
      const dataLengthBig = recordView.getBigUint64(4, true);
      if (dataLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Bundle resource exceeds this Node runtime's addressable range");
      }
      const dataLength = Number(dataLengthBig);
      await authorizePipIoMetric("maxSingleResourceBytes", dataLengthBig, "decode", options);
      if (cursor + pathLength + mimeLength > assetEnd) {
        throw new Error("PIP asset metadata is truncated");
      }
      const metadataBytes = await readExact(file, pathLength + mimeLength, cursor);
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
        const bytes = await readExact(file, dataLength, cursor);
        assetHash.update(bytes);
        cursor += dataLength;
        index = assertWorkspaceResourceIndex(JSON.parse(textDecoder.decode(bytes)) as unknown);
        continue;
      }

      assertWorkspaceResourcePath(resourcePath);
      const target = await resourceDestination(resourcesRoot, resourcePath);
      const output = await open(target, "wx");
      const resourceHash = createHash("sha256");
      let remaining = dataLength;
      let outputPosition = 0;
      try {
        while (remaining > 0) {
          const size = Math.min(remaining, STREAM_CHUNK_BYTES);
          const chunk = await readExact(file, size, cursor);
          assetHash.update(chunk);
          resourceHash.update(chunk);
          await writeAll(output, chunk, outputPosition);
          cursor += size;
          outputPosition += size;
          remaining -= size;
        }
        await output.sync();
        await output.close();
      } catch (error) {
        await output.close().catch(() => {});
        throw error;
      }
      actualResources.push({
        path: resourcePath,
        mediaType,
        byteLength: dataLengthBig.toString(),
        sha256: resourceHash.digest("hex"),
      });
    }
    if (cursor !== assetEnd) throw new Error("PIP asset section contains trailing data");
    if (!equalBytes(new Uint8Array(assetHash.digest()), assetSection.hash)) {
      throw new Error("PIP section 3 hash mismatch");
    }
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
    await writeFile(path.join(temporary, "intent.pip"), intentPip, { flag: "wx" });
    await file.close();
    await assertMissing(destination);
    await rename(temporary, destination);
    return {
      path: destination,
      resourceCount: actualResources.length,
      intentPipBytes: intentPip.byteLength,
    };
  } catch (error) {
    await file.close().catch(() => {});
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
};
