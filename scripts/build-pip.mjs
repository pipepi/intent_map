import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip,
} from "../app/runtime/pip.ts";
import {
  createApplicationDocument,
  serializeIntentDocument,
} from "../app/runtime/model.ts";

const root = path.resolve(import.meta.dirname, "..");

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const mimeFor = (file) => {
  const extension = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }[extension] ?? "application/octet-stream";
};

const collectAssets = async (directory, relative = "") => {
  const absolute = path.join(directory, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const assets = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`PIP assets may not contain symlinks: ${child}`);
    if (entry.isDirectory()) {
      assets.push(...await collectAssets(directory, child));
    } else if (entry.isFile()) {
      const filePath = path.join(directory, child);
      const info = await stat(filePath);
      if (info.size > 64 * 1024 * 1024) throw new Error(`PIP asset exceeds size limit: ${child}`);
      assets.push({
        path: child.split(path.sep).join("/"),
        mime: mimeFor(child),
        bytes: new Uint8Array(await readFile(filePath)),
      });
    }
  }
  return assets;
};

const defaultBusinessRoot = {
  id: "business_root",
  name: "Intent Map Seed",
  description: "由最小 Rust 种皮加载的唯一根业务意图。",
  kind: "composite",
  inputs: [],
  outputs: [],
  children: [],
  position: { x: 0, y: 0 },
  canvasSize: { width: 1400, height: 850 },
  resizeMode: "simple",
};

const treePath = option("--tree");
const assetsDirectory = path.resolve(root, option("--assets", "out"));
const output = path.resolve(root, option("--output", "dist/pip/intent-map.pip"));
const tree = treePath
  ? JSON.parse(await readFile(path.resolve(root, treePath), "utf8"))
  : createApplicationDocument(defaultBusinessRoot);
const rootTreeText = serializeIntentDocument(tree);
const assetsInfo = await stat(assetsDirectory);
if (!assetsInfo.isDirectory()) {
  throw new Error(`PIP asset source is not a directory: ${assetsDirectory}`);
}
const assets = await collectAssets(assetsDirectory);
const createdAt = new Date(Number(process.env.SOURCE_DATE_EPOCH ?? "0") * 1000).toISOString();
const bytes = await encodePip({
  manifest: {
    packageId: "intent-map.seed",
    name: "Intent Map",
    packageVersion: "0.1.0",
    rootNodeId: tree.rootIntent.id,
    loaderAbi: "pip-loader/1",
    requiredCapabilities: [],
    createdAt,
    contentType: "application/vnd.intent-map.pip",
  },
  loaderSource: DEFAULT_PIP_LOADER_SOURCE,
  rootTreeText,
  assets,
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
process.stdout.write(`${output}\n${bytes.length} bytes\n${assets.length} assets\n`);
