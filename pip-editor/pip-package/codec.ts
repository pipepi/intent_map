/** Input/output: complete PIP bytes. Coordinates four validated, hashed binary sections. */
import { decodePipAssets, encodePipAssets } from "./assets.ts";
import { align8, assertSafeLength, equalBytes, PIP_HEADER_SIZE, PIP_MAGIC, PIP_SECTION_COUNT, PIP_SECTION_ENTRY_SIZE, PIP_VERSION, readU64, sha256, textDecoder, textEncoder, writeU64 } from "./format.ts";
import { authorizePipIoMetric } from "./io-authorization.ts";
import { assertPipManifest } from "./manifest.ts";
import type { PipIoOptions, PipManifest, PipPackage } from "./types.ts";

type PipSection = { offset: number; length: number; hash: Uint8Array };
export const encodePip = async (input: PipPackage, options?: PipIoOptions): Promise<Uint8Array> => {
  assertPipManifest(input.manifest);
  if (input.manifest.layer === "a5" && input.manifest.nodeMapAbi !== "pip-node-map/1") {
    throw new Error("Legacy Node Map must be migrated before export");
  }
  await authorizePipIoMetric("maxResourceCount", input.assets.length, "encode", options);
  for (const asset of input.assets) await authorizePipIoMetric("maxSingleResourceBytes", asset.bytes.length, "encode", options);
  const sections = [textEncoder.encode(JSON.stringify(input.manifest)), textEncoder.encode(input.loaderSource), textEncoder.encode(input.rootTreeText), encodePipAssets(input.assets)];
  sections.forEach((section, index) => assertSafeLength(section.length, `Section ${index}`));
  const expandedSize = sections.reduce((total, section) => total + section.length, 0); assertSafeLength(expandedSize, "Expanded PIP content");
  await authorizePipIoMetric("maxExpandedBytes", expandedSize, "encode", options); await authorizePipIoMetric("maxCompressionRatio", 1, "encode", options);
  let cursor = PIP_HEADER_SIZE; const descriptors: Array<{ offset: number; bytes: Uint8Array; hash: Uint8Array }> = [];
  for (const section of sections) { cursor = align8(cursor); descriptors.push({ offset: cursor, bytes: section, hash: await sha256(section) }); cursor += section.length; }
  assertSafeLength(cursor, "PIP package"); await authorizePipIoMetric("maxPipBytes", cursor, "encode", options);
  const output = new Uint8Array(cursor), view = new DataView(output.buffer); output.set(PIP_MAGIC, 0); view.setUint32(8, PIP_VERSION, true); view.setUint32(12, PIP_HEADER_SIZE, true);
  descriptors.forEach((descriptor, index) => { const entry = 16 + index * PIP_SECTION_ENTRY_SIZE; writeU64(view, entry, descriptor.offset); writeU64(view, entry + 8, descriptor.bytes.length); output.set(descriptor.hash, entry + 16); output.set(descriptor.bytes, descriptor.offset); });
  return output;
};

export const decodePip = async (source: ArrayBuffer | Uint8Array, options?: PipIoOptions): Promise<PipPackage> => {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source); await authorizePipIoMetric("maxPipBytes", bytes.length, "decode", options);
  if (bytes.length < PIP_HEADER_SIZE) throw new Error("PIP header is truncated");
  if (!equalBytes(bytes.subarray(0, PIP_MAGIC.length), PIP_MAGIC)) throw new Error("Invalid PIP magic");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, true) !== PIP_VERSION) throw new Error("Unsupported PIP version");
  if (view.getUint32(12, true) !== PIP_HEADER_SIZE) throw new Error("Invalid PIP header size");
  const sections: PipSection[] = [];
  for (let index = 0; index < PIP_SECTION_COUNT; index += 1) {
    const entry = 16 + index * PIP_SECTION_ENTRY_SIZE, offset = readU64(view, entry), length = readU64(view, entry + 8); assertSafeLength(length, `Section ${index}`);
    if (offset < PIP_HEADER_SIZE || offset % 8 !== 0 || offset + length > bytes.length) throw new Error(`PIP section ${index} is out of bounds`);
    sections.push({ offset, length, hash: bytes.slice(entry + 16, entry + 48) });
  }
  const ordered = [...sections].sort((left, right) => left.offset - right.offset);
  for (let index = 1; index < ordered.length; index += 1) if (ordered[index - 1].offset + ordered[index - 1].length > ordered[index].offset) throw new Error("PIP sections overlap");
  const expandedSize = sections.reduce((total, section) => total + section.length, 0); assertSafeLength(expandedSize, "Expanded PIP content");
  await authorizePipIoMetric("maxExpandedBytes", expandedSize, "decode", options); await authorizePipIoMetric("maxCompressionRatio", 1, "decode", options);
  const payloads: Uint8Array[] = [];
  for (const [index, section] of sections.entries()) { const payload = bytes.slice(section.offset, section.offset + section.length); if (!equalBytes(await sha256(payload), section.hash)) throw new Error(`PIP section ${index} hash mismatch`); payloads.push(payload); }
  const manifest = assertPipManifest(JSON.parse(textDecoder.decode(payloads[0])) as PipManifest);
  return { manifest, loaderSource: textDecoder.decode(payloads[1]), rootTreeText: textDecoder.decode(payloads[2]), assets: await decodePipAssets(payloads[3], options) };
};
