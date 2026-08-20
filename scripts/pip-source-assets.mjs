import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set(["node_modules", "target", ".next", "out", "dist", ".git"]);
const excludedFiles = new Set([".DS_Store"]);

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
    if (excludedFiles.has(path.basename(relative))) return;
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

const identity = { nodeId: "relation.core.identity", relationId: "identity" };
const relation = (id, value) => ({ id, predicate: identity, object: { kind: "const", value }, relations: [] });
const ref = (id, nodeId) => ({ id, predicate: identity, object: { kind: "ref", target: { nodeId, relationId: "identity" } }, relations: [] });
const node = (id, relations) => ({ id, relations: [relation("identity", id), ...relations] });

export const softwareProjectGraph = ({ id, name, description, compiler, assets }) => {
  const core = ["identity", "predicate", "type"].map((kind) => node(`relation.core.${kind}`, []));
  const sources = assets.filter((asset) => asset.path.startsWith("source/")).map((asset, index) => node(
    `source_${index}_${asset.path.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
    [relation("name", asset.path.replace(/^source\//, "")), relation("description", `${asset.mime} · ${asset.bytes.length} bytes`), relation("asset", { path: asset.path, mime: asset.mime })],
  ));
  const root = node(id, [relation("name", name), relation("description", description), relation("compiler", compiler), ...sources.map((source) => ref(`contains:${source.id}`, source.id))]);
  return { rootNodeId: id, graph: { revision: 0, nodes: Object.fromEntries([...core, root, ...sources].map((item) => [item.id, item])) } };
};
