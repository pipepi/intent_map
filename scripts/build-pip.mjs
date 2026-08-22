import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip as encodePipWithPolicy,
} from "../app/runtime/pip.ts";
import {
  createdAtFor,
  readReleaseConfig,
  systemPackagePath,
} from "./pip-release.mjs";
import { createRelationDocument, loadRelationDocument, serializeRelationDocument } from "../app/relation/document.ts";
import { collectSourceAssets, softwareProjectGraph } from "./pip-source-assets.mjs";
import { packagedPipIoPolicy, trustedBuildPipIo } from "./pip-io-policy.mjs";
import { systemSourceEntriesFor } from "./pip-system-sources.mjs";

const encodePip = (input) => encodePipWithPolicy(input, trustedBuildPipIo);

const root = path.resolve(import.meta.dirname, "..");

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
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
      assets.push({
        path: child.split(path.sep).join("/"),
        mime: mimeFor(child),
        bytes: new Uint8Array(await readFile(filePath)),
      });
    }
  }
  return assets;
};

const treePath = option("--tree");
const assetsDirectory = path.resolve(root, option("--assets") ?? "out");
const release = (await readReleaseConfig()).intentMap;
const output = systemPackagePath(release);
const assetsInfo = await stat(assetsDirectory);
if (!assetsInfo.isDirectory()) {
  throw new Error(`PIP asset source is not a directory: ${assetsDirectory}`);
}
const collectedRuntimeAssets = await collectAssets(assetsDirectory);
const runtimeAssets = collectedRuntimeAssets;
const sourceAssets = await collectSourceAssets(
  root,
  systemSourceEntriesFor(release.packageId),
);
const assets = [...runtimeAssets, ...sourceAssets];
const tree = treePath
  ? loadRelationDocument(JSON.parse(await readFile(path.resolve(root, treePath), "utf8")))
  : (() => { const project = softwareProjectGraph({
      id: "intent_map_editor_root",
      name: "RelationNode Host",
      description: "Generic three-layer RelationNode plugin host source project.",
      compiler: "relation-host/1",
      assets: sourceAssets,
    }); return createRelationDocument(project.graph, [project.rootNodeId]); })();
const rootTreeText = serializeRelationDocument(tree);
const assetMap = new Map(assets.map((asset) => [asset.path, asset]));
const indexAsset = assetMap.get("index.html");
if (!indexAsset) {
  throw new Error("PIP static assets must include index.html");
}
const indexHtml = new TextDecoder().decode(indexAsset.bytes);
const stylesheetPaths = [...indexHtml.matchAll(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
)].map((match) => match[1].split(/[?#]/, 1)[0].replace(/^\/+/, ""));
if (!stylesheetPaths.length) {
  throw new Error("PIP index.html does not reference a stylesheet");
}
const stylesheetText = stylesheetPaths.map((stylesheetPath) => {
  const stylesheet = assetMap.get(stylesheetPath);
  if (!stylesheet) {
    throw new Error(`PIP stylesheet is missing from static assets: ${stylesheetPath}`);
  }
  return new TextDecoder().decode(stylesheet.bytes);
}).join("\n");
if (
  indexHtml.includes("workspace-v3") &&
  (!stylesheetText.includes(".workspace-v3") ||
    !stylesheetText.includes(".workspace-panel") ||
    !stylesheetText.includes(".workspace-surface"))
) {
  throw new Error(
    "PIP static export is inconsistent: v3 workspace HTML is paired with stale CSS",
  );
}
const bytes = await encodePip({
  manifest: {
    packageId: release.packageId,
    layer: release.layer,
    artifactName: release.artifactName,
    name: release.name,
    packageVersion: release.version,
    releaseDate: release.releaseDate,
    rootNodeId: tree.rootNodeIds[0],
    loaderAbi: "pip-loader/1",
    artifactRole: "source-and-runtime",
    editorAbi: "pip-editor/1",
    providedEditorKinds: ["relation-graph/1"],
    supportedDocumentKinds: ["relation-workspace/1"],
    preferredEditorKinds: [],
    requiredEditorCapabilities: [],
    providedCapabilities: [],
    requiredCapabilities: [],
    requiredAuthoringCapabilities: [],
    ioPolicy: packagedPipIoPolicy,
    authoringKind: "software-project/1",
    authoringCompiler: "relation-host/1",
    createdAt: createdAtFor(release),
    contentType: "application/vnd.intent-map.pip",
  },
  loaderSource: DEFAULT_PIP_LOADER_SOURCE,
  rootTreeText,
  assets,
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
process.stdout.write(`${output}\n${bytes.length} bytes\n${assets.length} assets\n`);
