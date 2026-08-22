/** Input/output: the deterministic asset section inside a PIP package. */
import { assertSafeLength, readU64, textDecoder, textEncoder, writeU64 } from "./format.ts";
import { authorizePipIoMetric } from "./io-authorization.ts";
import type { PipAsset, PipIoOptions } from "./types.ts";

export const encodePipAssets = (assets: PipAsset[]) => {
  const sorted = [...assets].sort((left, right) => left.path.localeCompare(right.path));
  const records = sorted.map((asset) => {
    if (!asset.path || asset.path.startsWith("/") || asset.path.includes("..") || asset.path.includes("\\")) throw new Error(`Unsafe PIP asset path: ${asset.path}`);
    const path = textEncoder.encode(asset.path), mime = textEncoder.encode(asset.mime);
    if (path.length > 0xffff || mime.length > 0xffff) throw new Error("PIP asset metadata is too large");
    return { asset, path, mime };
  });
  const total = 4 + records.reduce((sum, record) => sum + 12 + record.path.length + record.mime.length + record.asset.bytes.length, 0);
  assertSafeLength(total, "Asset section");
  const output = new Uint8Array(total), view = new DataView(output.buffer); view.setUint32(0, records.length, true);
  let cursor = 4;
  for (const record of records) {
    view.setUint16(cursor, record.path.length, true); view.setUint16(cursor + 2, record.mime.length, true); writeU64(view, cursor + 4, record.asset.bytes.length); cursor += 12;
    output.set(record.path, cursor); cursor += record.path.length; output.set(record.mime, cursor); cursor += record.mime.length;
    output.set(record.asset.bytes, cursor); cursor += record.asset.bytes.length;
  }
  return output;
};

export const decodePipAssets = async (bytes: Uint8Array, options?: PipIoOptions): Promise<PipAsset[]> => {
  if (!bytes.length) return [];
  if (bytes.length < 4) throw new Error("PIP asset section is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(0, true);
  await authorizePipIoMetric("maxResourceCount", count, "decode", options);
  const assets: PipAsset[] = [], seen = new Set<string>(); let cursor = 4;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 12 > bytes.length) throw new Error("PIP asset record is truncated");
    const pathLength = view.getUint16(cursor, true), mimeLength = view.getUint16(cursor + 2, true), dataLength = readU64(view, cursor + 4);
    await authorizePipIoMetric("maxSingleResourceBytes", dataLength, "decode", options); cursor += 12;
    const end = cursor + pathLength + mimeLength + dataLength; if (end > bytes.length) throw new Error("PIP asset payload is truncated");
    const path = textDecoder.decode(bytes.subarray(cursor, cursor + pathLength)); cursor += pathLength;
    const mime = textDecoder.decode(bytes.subarray(cursor, cursor + mimeLength)); cursor += mimeLength;
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\") || seen.has(path)) throw new Error(`Unsafe or duplicate PIP asset path: ${path}`);
    seen.add(path); assets.push({ path, mime, bytes: bytes.slice(cursor, cursor + dataLength) }); cursor += dataLength;
  }
  if (cursor !== bytes.length) throw new Error("PIP asset section contains trailing data");
  return assets;
};
