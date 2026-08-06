import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set(["node_modules", "target", ".next", "out", "dist", ".git"]);

const mimeFor = (file) => ({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".rs": "text/rust; charset=utf-8",
  ".toml": "text/toml; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/typescript; charset=utf-8",
  ".svg": "image/svg+xml",
}[path.extname(file).toLowerCase()] ?? "application/octet-stream");

export const collectSourceAssets = async (root, entries, prefix = "source") => {
  const assets = [];
  const visit = async (relative) => {
    const absolute = path.join(root, relative);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      if (excludedDirectories.has(path.basename(relative))) return;
      for (const entry of (await readdir(absolute, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isSymbolicLink()) throw new Error(`Source project contains a symlink: ${relative}/${entry.name}`);
        await visit(path.join(relative, entry.name));
      }
      return;
    }
    if (!info.isFile()) return;
    assets.push({
      path: `${prefix}/${relative.split(path.sep).join("/")}`,
      mime: mimeFor(relative),
      bytes: new Uint8Array(await readFile(absolute)),
    });
  };
  for (const entry of entries) await visit(entry);
  return assets;
};

const sourceFileNode = (asset, index) => ({
  id: `source_${index}_${asset.path.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
  name: asset.path.replace(/^source\//, ""),
  description: `${asset.mime} · ${asset.bytes.length} bytes`,
  kind: "operator",
  operator: "identity",
  inputs: [],
  outputs: [],
  position: { x: 80 + (index % 5) * 260, y: 120 + Math.floor(index / 5) * 190 },
  size: { width: 220, height: 140 },
  implementation: {
    key: "source-file",
    config: { assetPath: asset.path, mime: asset.mime },
  },
});

export const softwareProjectRoot = ({ id, name, description, compiler, assets }) => ({
  id,
  name,
  description,
  kind: "composite",
  inputs: [],
  outputs: [],
  children: assets.filter((asset) => asset.path.startsWith("source/")).map(sourceFileNode),
  position: { x: 0, y: 0 },
  canvasSize: { width: 1500, height: Math.max(900, 300 + Math.ceil(assets.length / 5) * 190) },
  implementation: {
    key: "software-project",
    config: { compiler, sourceAssetPrefix: "source/" },
  },
});
