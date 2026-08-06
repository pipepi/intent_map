import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";

import {
  PIP_HEADER_SIZE,
  PIP_MAGIC,
  PIP_SECTION_ENTRY_SIZE,
  PIP_VERSION,
  assertPipManifest,
  authorizePipIoMetric,
  type PipIoOptions,
  type PipPackage,
} from "../../app/runtime/pip.ts";
import { PIP_WORKSPACE_INDEX_PATH, workspaceResourceIndexAsset } from "../workspace/resource-index.ts";
import type { NodeDirectoryResourceStore } from "../workspace/node-directory-store.ts";
import type { WorkspaceResourceSession } from "../workspace/resource-store.ts";

const textEncoder = new TextEncoder();
const align8 = (value: bigint) => (value + BigInt(7)) & ~BigInt(7);
const safeNumber = (value: bigint, label: string) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds this Node runtime's addressable range`);
  }
  return Number(value);
};
const digest = (bytes: Uint8Array) => new Uint8Array(createHash("sha256").update(bytes).digest());

const writeAll = async (file: FileHandle, bytes: Uint8Array, position: number) => {
  let written = 0;
  while (written < bytes.byteLength) {
    const result = await file.write(bytes, written, bytes.byteLength - written, position + written);
    if (!result.bytesWritten) throw new Error("Bundle output stopped accepting bytes");
    written += result.bytesWritten;
  }
};

const assertMissing = async (destination: string) => {
  try {
    await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Bundle destination already exists: ${destination}`);
};

const recordPrefix = (resourcePath: string, mediaType: string, byteLength: bigint) => {
  const pathBytes = textEncoder.encode(resourcePath);
  const mimeBytes = textEncoder.encode(mediaType);
  if (pathBytes.byteLength > 0xffff || mimeBytes.byteLength > 0xffff) {
    throw new Error(`${resourcePath}: resource metadata is too large`);
  }
  const prefix = new Uint8Array(12 + pathBytes.byteLength + mimeBytes.byteLength);
  const view = new DataView(prefix.buffer);
  view.setUint16(0, pathBytes.byteLength, true);
  view.setUint16(2, mimeBytes.byteLength, true);
  view.setBigUint64(4, byteLength, true);
  prefix.set(pathBytes, 12);
  prefix.set(mimeBytes, 12 + pathBytes.byteLength);
  return prefix;
};

export const streamNodeWorkspaceBundle = async ({
  pip,
  session,
  store,
  destination: destinationInput,
  options,
}: {
  pip: PipPackage;
  session: WorkspaceResourceSession;
  store: NodeDirectoryResourceStore;
  destination: string;
  options: PipIoOptions;
}): Promise<{ path: string; byteLength: string }> => {
  assertPipManifest(pip.manifest);
  if (pip.assets.length !== 1 || pip.assets[0].path !== PIP_WORKSPACE_INDEX_PATH) {
    throw new Error("Streaming Bundle input must be a split intent.pip");
  }
  const destination = path.resolve(destinationInput);
  await assertMissing(destination);
  await mkdir(path.dirname(destination), { recursive: true });

  const indexAsset = workspaceResourceIndexAsset(session.index);
  const entries = session.list();
  const assets = [
    {
      kind: "inline" as const,
      path: indexAsset.path,
      mediaType: indexAsset.mime,
      byteLength: BigInt(indexAsset.bytes.byteLength),
      bytes: indexAsset.bytes,
    },
    ...entries.map((entry) => ({
      kind: "external" as const,
      path: entry.path,
      mediaType: entry.mediaType,
      byteLength: BigInt(entry.byteLength),
      sha256: entry.sha256,
    })),
  ].sort((left, right) => left.path.localeCompare(right.path));

  await authorizePipIoMetric("maxResourceCount", assets.length, "encode", options);
  for (const asset of assets) {
    await authorizePipIoMetric("maxSingleResourceBytes", asset.byteLength, "encode", options);
  }

  const prefixes = assets.map((asset) => recordPrefix(asset.path, asset.mediaType, asset.byteLength));
  const assetLength = BigInt(4) + assets.reduce(
    (total, asset, index) => total + BigInt(prefixes[index].byteLength) + asset.byteLength,
    BigInt(0),
  );
  const sections = [
    textEncoder.encode(JSON.stringify(pip.manifest)),
    textEncoder.encode(pip.loaderSource),
    textEncoder.encode(pip.rootTreeText),
  ];
  const expandedLength = sections.reduce(
    (total, section) => total + BigInt(section.byteLength),
    assetLength,
  );
  await authorizePipIoMetric("maxExpandedBytes", expandedLength, "encode", options);
  await authorizePipIoMetric("maxCompressionRatio", 1, "encode", options);

  let cursor = BigInt(PIP_HEADER_SIZE);
  const descriptors = sections.map((section) => {
    cursor = align8(cursor);
    const descriptor = {
      offset: cursor,
      length: BigInt(section.byteLength),
      hash: digest(section),
    };
    cursor += descriptor.length;
    return descriptor;
  });
  cursor = align8(cursor);
  const assetDescriptor = { offset: cursor, length: assetLength, hash: new Uint8Array(32) };
  descriptors.push(assetDescriptor);
  cursor += assetLength;
  await authorizePipIoMetric("maxPipBytes", cursor, "encode", options);
  const outputLength = safeNumber(cursor, "Bundle");

  const header = new Uint8Array(PIP_HEADER_SIZE);
  const headerView = new DataView(header.buffer);
  header.set(PIP_MAGIC, 0);
  headerView.setUint32(8, PIP_VERSION, true);
  headerView.setUint32(12, PIP_HEADER_SIZE, true);
  descriptors.forEach((descriptor, index) => {
    const entry = 16 + index * PIP_SECTION_ENTRY_SIZE;
    headerView.setBigUint64(entry, descriptor.offset, true);
    headerView.setBigUint64(entry + 8, descriptor.length, true);
    header.set(descriptor.hash, entry + 16);
  });

  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx");
  try {
    await writeAll(file, header, 0);
    for (const [index, section] of sections.entries()) {
      await writeAll(file, section, safeNumber(descriptors[index].offset, `Section ${index}`));
    }

    const assetHash = createHash("sha256");
    let assetCursor = safeNumber(assetDescriptor.offset, "Asset section");
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, assets.length, true);
    await writeAll(file, count, assetCursor);
    assetHash.update(count);
    assetCursor += count.byteLength;

    for (const [index, asset] of assets.entries()) {
      const prefix = prefixes[index];
      await writeAll(file, prefix, assetCursor);
      assetHash.update(prefix);
      assetCursor += prefix.byteLength;
      if (asset.kind === "inline") {
        await writeAll(file, asset.bytes, assetCursor);
        assetHash.update(asset.bytes);
        assetCursor += asset.bytes.byteLength;
        continue;
      }
      const opened = await store.openRead(asset.path);
      if (BigInt(opened.byteLength) !== asset.byteLength) {
        throw new Error(`${asset.path}: resource byte length changed`);
      }
      const resourceHash = createHash("sha256");
      let resourceLength = BigInt(0);
      for await (const rawChunk of opened.chunks) {
        const chunk = rawChunk instanceof Uint8Array ? rawChunk : new Uint8Array(rawChunk);
        await writeAll(file, chunk, assetCursor);
        assetHash.update(chunk);
        resourceHash.update(chunk);
        assetCursor += chunk.byteLength;
        resourceLength += BigInt(chunk.byteLength);
      }
      if (resourceLength !== asset.byteLength || resourceHash.digest("hex") !== asset.sha256) {
        throw new Error(`${asset.path}: resource content changed while bundling`);
      }
    }
    if (assetCursor !== outputLength) throw new Error("Streaming Bundle length mismatch");

    const finalAssetHash = new Uint8Array(assetHash.digest());
    const assetHashPosition = 16 + 3 * PIP_SECTION_ENTRY_SIZE + 16;
    await writeAll(file, finalAssetHash, assetHashPosition);
    await file.sync();
    await file.close();
    await assertMissing(destination);
    await rename(temporary, destination);
    return { path: destination, byteLength: cursor.toString() };
  } catch (error) {
    await file.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
};
