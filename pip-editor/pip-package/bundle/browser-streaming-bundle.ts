import {
  PIP_HEADER_SIZE,
  PIP_MAGIC,
  PIP_SECTION_ENTRY_SIZE,
  PIP_VERSION,
  assertPipManifest,
  authorizePipIoMetric,
  pipFilename,
  pipSha256,
  type PipIoOptions,
  type PipPackage,
} from "../index.ts";
import { PIP_WORKSPACE_INDEX_PATH, workspaceResourceIndexAsset } from "../workspace/resource-index.ts";
import type {
  StreamingWorkspaceResourceStore,
  WorkspaceResourceSession,
} from "../workspace/resource-store.ts";
import { IncrementalSha256 } from "./incremental-sha256.ts";

const textEncoder = new TextEncoder();
const align8 = (value: bigint) => (value + BigInt(7)) & ~BigInt(7);
const safeNumber = (value: bigint, label: string) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds this browser's addressable range`);
  }
  return Number(value);
};
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const writeAt = async (
  output: FileSystemWritableFileStream,
  bytes: Uint8Array,
  position: number,
) => output.write({ type: "write", position, data: bytes.slice() });

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

export const streamBrowserWorkspaceBundle = async ({
  pip,
  session,
  store,
  destination,
  options,
}: {
  pip: PipPackage;
  session: WorkspaceResourceSession;
  store: StreamingWorkspaceResourceStore;
  destination: FileSystemFileHandle;
  options: PipIoOptions;
}): Promise<{ file: string; byteLength: string }> => {
  assertPipManifest(pip.manifest);
  if (pip.assets.length !== 1 || pip.assets[0].path !== PIP_WORKSPACE_INDEX_PATH) {
    throw new Error("Streaming Bundle input must be a split intent.pip");
  }
  const expectedFilename = pipFilename(pip.manifest);
  if (destination.name !== expectedFilename) {
    throw new Error(`Bundle filename must match intent.pip identity: ${expectedFilename}`);
  }

  const indexAsset = workspaceResourceIndexAsset(session.index);
  const assets = [
    {
      kind: "inline" as const,
      path: indexAsset.path,
      mediaType: indexAsset.mime,
      byteLength: BigInt(indexAsset.bytes.byteLength),
      bytes: indexAsset.bytes,
    },
    ...session.list().map((entry) => ({
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
  const sectionHashes = await Promise.all(sections.map((section) => pipSha256(section)));
  const descriptors = sections.map((section, index) => {
    cursor = align8(cursor);
    const descriptor = {
      offset: cursor,
      length: BigInt(section.byteLength),
      hash: Uint8Array.from(sectionHashes[index].match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16)),
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

  const output = await destination.createWritable({ keepExistingData: false });
  try {
    await writeAt(output, header, 0);
    for (const [index, section] of sections.entries()) {
      await writeAt(output, section, safeNumber(descriptors[index].offset, `Section ${index}`));
    }

    const assetHash = new IncrementalSha256();
    let assetCursor = safeNumber(assetDescriptor.offset, "Asset section");
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, assets.length, true);
    await writeAt(output, count, assetCursor);
    assetHash.update(count);
    assetCursor += count.byteLength;

    for (const [index, asset] of assets.entries()) {
      const prefix = prefixes[index];
      await writeAt(output, prefix, assetCursor);
      assetHash.update(prefix);
      assetCursor += prefix.byteLength;
      if (asset.kind === "inline") {
        await writeAt(output, asset.bytes, assetCursor);
        assetHash.update(asset.bytes);
        assetCursor += asset.bytes.byteLength;
        continue;
      }
      const opened = await store.openRead(asset.path);
      if (BigInt(opened.byteLength) !== asset.byteLength) {
        throw new Error(`${asset.path}: resource byte length changed`);
      }
      const resourceHash = new IncrementalSha256();
      let resourceLength = BigInt(0);
      for await (const chunk of opened.chunks) {
        await writeAt(output, chunk, assetCursor);
        assetHash.update(chunk);
        resourceHash.update(chunk);
        assetCursor += chunk.byteLength;
        resourceLength += BigInt(chunk.byteLength);
      }
      if (resourceLength !== asset.byteLength || hex(resourceHash.digest()) !== asset.sha256) {
        throw new Error(`${asset.path}: resource content changed while bundling`);
      }
    }
    if (assetCursor !== outputLength) throw new Error("Streaming Bundle length mismatch");
    const assetHashPosition = 16 + 3 * PIP_SECTION_ENTRY_SIZE + 16;
    await writeAt(output, assetHash.digest(), assetHashPosition);
    await output.truncate(outputLength);
    await output.close();
    return { file: destination.name, byteLength: cursor.toString() };
  } catch (error) {
    await output.abort(error);
    throw error;
  }
};
