import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const sourceTreeSha256 = (assets) => {
  const hash = createHash("sha256");
  for (const asset of [...assets].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(sha256(asset.bytes));
    hash.update("\0");
  }
  return hash.digest("hex");
};

export const relativeSourcePath = (assetPath) => {
  if (!assetPath.startsWith("source/")) return null;
  const relative = assetPath.slice("source/".length);
  const segments = relative.split("/");
  if (
    !relative ||
    relative.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe source asset path: ${assetPath}`);
  }
  return relative;
};

export const mergeSourceAsset = (merged, asset, packageId) => {
  const relative = relativeSourcePath(asset.path);
  if (relative === null) return false;
  const existing = merged.get(relative);
  if (existing) {
    if (sha256(existing.bytes) !== sha256(asset.bytes)) {
      throw new Error(
        `Conflicting source asset ${relative}: ${existing.packageId} and ${packageId}`,
      );
    }
    existing.packageIds.push(packageId);
    return true;
  }
  merged.set(relative, {
    path: relative,
    bytes: asset.bytes,
    packageId,
    packageIds: [packageId],
  });
  return true;
};

export const collectReconstructedSources = async (root) => {
  const assets = [];
  const visit = async (relative) => {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!relative && entry.name === ".pip") continue;
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Reconstructed source contains a symlink: ${child}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        assets.push({
          path: `source/${child.split(path.sep).join("/")}`,
          bytes: new Uint8Array(await readFile(path.join(root, child))),
        });
      }
    }
  };
  await visit("");
  return assets;
};
