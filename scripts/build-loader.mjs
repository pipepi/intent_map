import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { encodePip } from "../app/runtime/pip.ts";
import {
  artifactFilename,
  createdAtFor,
  projectRoot,
  readReleaseConfig,
  runtimeDirectory,
} from "./pip-release.mjs";

const release = (await readReleaseConfig()).loader;
const source = path.join(projectRoot, "loader-n");
const files = [
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
  ["config.json", "application/json; charset=utf-8"],
];
const assets = await Promise.all(files.map(async ([assetPath, mime]) => ({
  path: assetPath,
  mime,
  bytes: new Uint8Array(await readFile(path.join(source, assetPath))),
})));
const bytes = await encodePip({
  manifest: {
    packageId: release.packageId,
    layer: release.layer,
    artifactName: release.artifactName,
    name: release.name,
    packageVersion: release.version,
    releaseDate: release.releaseDate,
    rootNodeId: "loader_root",
    loaderAbi: "pip-loader/1",
    requiredCapabilities: ["pip.catalog", "pip.activate"],
    createdAt: createdAtFor(release),
    contentType: "application/vnd.intent-map.pip",
  },
  loaderSource: "export async function load() { return { rootNodeId: 'loader_root' }; }",
  rootTreeText: JSON.stringify({ rootIntent: { id: "loader_root" } }),
  assets,
});
const output = path.join(runtimeDirectory, artifactFilename(release));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
process.stdout.write(`${output}\n${bytes.length} bytes\n`);
