import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { encodePip as encodePipWithPolicy } from "../app/runtime/pip.ts";
import { createRelationDocument, serializeRelationDocument } from "../app/relation/document.ts";
import {
  createdAtFor,
  projectRoot,
  readReleaseConfig,
  systemPackagePath,
} from "./pip-release.mjs";
import { collectSourceAssets, softwareProjectGraph } from "./pip-source-assets.mjs";
import { packagedPipIoPolicy, trustedBuildPipIo } from "./pip-io-policy.mjs";
import { systemSourceEntriesFor } from "./pip-system-sources.mjs";

const encodePip = (input) => encodePipWithPolicy(input, trustedBuildPipIo);

const release = (await readReleaseConfig()).loader;
const source = path.join(projectRoot, "loader-n");
const files = [
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
  ["config.json", "application/json; charset=utf-8"],
];
const runtimeAssets = await Promise.all(files.map(async ([assetPath, mime]) => ({
  path: assetPath,
  mime,
  bytes: new Uint8Array(await readFile(path.join(source, assetPath))),
})));
const sourceAssets = await collectSourceAssets(
  projectRoot,
  systemSourceEntriesFor(release.packageId),
);
const assets = [...runtimeAssets, ...sourceAssets];
const project = softwareProjectGraph({
  id: "loader_root",
  name: "PIP Loader",
  description: "Selects exactly one a2 editor and starts it.",
  compiler: "pip-loader-ui/1",
  assets: sourceAssets,
});
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
    artifactRole: "source-and-runtime",
    providedEditorKinds: [],
    supportedDocumentKinds: [],
    preferredEditorKinds: [],
    requiredEditorCapabilities: [],
    providedCapabilities: [],
    requiredCapabilities: ["pip.catalog", "pip.activate"],
    requiredAuthoringCapabilities: [],
    ioPolicy: packagedPipIoPolicy,
    authoringKind: "software-project/1",
    authoringCompiler: "pip-loader-ui/1",
    createdAt: createdAtFor(release),
    contentType: "application/vnd.intent-map.pip",
  },
  loaderSource: "export async function load() { return { rootNodeId: 'loader_root' }; }",
  rootTreeText: serializeRelationDocument(createRelationDocument(project.graph, [project.rootNodeId])),
  assets,
});
const output = systemPackagePath(release);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
process.stdout.write(`${output}\n${bytes.length} bytes\n`);
