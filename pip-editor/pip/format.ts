/** Shared binary-format primitives used by asset and package codecs. */
export const PIP_MAGIC = new Uint8Array([0x50, 0x49, 0x50, 0x00, 0x53, 0x45, 0x45, 0x44]);
export const PIP_VERSION = 1;
export const PIP_SECTION_COUNT = 4;
export const PIP_SECTION_ENTRY_SIZE = 48;
export const PIP_HEADER_SIZE = 16 + PIP_SECTION_COUNT * PIP_SECTION_ENTRY_SIZE;
export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder("utf-8", { fatal: true });
export const align8 = (value: number) => (value + 7) & ~7;
export const equalBytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((value, index) => value === right[index]);
export const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
export const assertSafeLength = (length: number, label: string) => {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error(`${label} exceeds this JavaScript runtime's addressable range`);
};
export const writeU64 = (view: DataView, offset: number, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid PIP offset");
  view.setBigUint64(offset, BigInt(value), true);
};
export const readU64 = (view: DataView, offset: number) => {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("PIP offset is too large");
  return Number(value);
};
