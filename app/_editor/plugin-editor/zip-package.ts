import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const ZIP_LIMITS = { files: 64, singleBytes: 2_000_000, totalBytes: 8_000_000, ratio: 100 };

function safePath(path: string) {
  return path && !path.startsWith("/") && !path.includes("\\") && path.split("/").every((part) => part && part !== "." && part !== "..");
}

export function encodeZip(files: Record<string, Uint8Array | string>) {
  const names = Object.keys(files).sort();
  if (!names.length || names.length > ZIP_LIMITS.files || names.some((name) => !safePath(name))) throw new Error("ZIP file list is invalid");
  let total = 0;
  const normalized = Object.fromEntries(names.map((name) => {
    const bytes = typeof files[name] === "string" ? strToU8(files[name] as string) : files[name] as Uint8Array;
    total += bytes.length;
    if (bytes.length > ZIP_LIMITS.singleBytes || total > ZIP_LIMITS.totalBytes) throw new Error("ZIP expanded size exceeds limit");
    return [name, bytes];
  }));
  return zipSync(normalized, { level: 6 });
}

export function decodeZip(archive: Uint8Array) {
  if (!archive.length) throw new Error("ZIP archive is empty");
  const files = unzipSync(archive, {
    filter(file) {
      if (!safePath(file.name)) throw new Error(`Unsafe ZIP path: ${file.name}`);
      if (file.originalSize > ZIP_LIMITS.singleBytes || file.originalSize > Math.max(file.size, 1) * ZIP_LIMITS.ratio) throw new Error(`ZIP entry exceeds safety limit: ${file.name}`);
      return true;
    },
  });
  const names = Object.keys(files);
  if (names.length > ZIP_LIMITS.files) throw new Error("ZIP contains too many files");
  if (names.reduce((sum, name) => sum + files[name].length, 0) > ZIP_LIMITS.totalBytes) throw new Error("ZIP expanded size exceeds limit");
  return files;
}

export function jsonFile(files: Record<string, Uint8Array>, path: string): unknown {
  if (!files[path]) throw new Error(`ZIP is missing ${path}`);
  try { return JSON.parse(strFromU8(files[path])); } catch { throw new Error(`${path} is not valid JSON`); }
}
