import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip as encodePipWithPolicy,
} from "../app/runtime/pip.ts";
import { packagedPipIoPolicy, trustedBuildPipIo } from "./pip-io-policy.mjs";

const encodePip = (input) => encodePipWithPolicy(input, trustedBuildPipIo);

const fixtures = path.resolve(import.meta.dirname, "../tests/fixtures");
const build = (manifest, title, additionalAssets = []) => encodePip({
  manifest,
  loaderSource: DEFAULT_PIP_LOADER_SOURCE,
  rootTreeText: JSON.stringify({ version: 2, rootIntent: { id: manifest.rootNodeId } }),
  assets: [{
    path: "index.html",
    mime: "text/html; charset=utf-8",
    bytes: new TextEncoder().encode(`<h1>${title}</h1>`),
  }, ...additionalAssets],
});

const common = {
  loaderAbi: "pip-loader/1",
  artifactRole: "runtime",
  providedEditorKinds: [],
  supportedDocumentKinds: [],
  preferredEditorKinds: [],
  requiredEditorCapabilities: [],
  providedCapabilities: [],
  requiredCapabilities: [],
  requiredAuthoringCapabilities: [],
  ioPolicy: packagedPipIoPolicy,
  createdAt: "2026-07-26T00:00:00.000Z",
  contentType: "application/vnd.intent-map.pip",
};
const entries = [
  ["minimal-valid.pip", await build({
    ...common,
    packageId: "intent-map.test",
    layer: "a5",
    artifactName: "intent_map_test",
    name: "Intent Map Test",
    packageVersion: "0.1.0",
    releaseDate: "20260726",
    rootNodeId: "application_root",
  }, "PIP")],
  ["a1_loader_1_0_0_20260726.pip", await build({
    ...common,
    packageId: "pip-loader.test",
    layer: "a1",
    artifactName: "loader",
    name: "PIP Loader Test",
    packageVersion: "1.0.0",
    releaseDate: "20260726",
    rootNodeId: "loader_root",
    artifactRole: "source-and-runtime",
    authoringKind: "software-project/1",
    authoringCompiler: "pip-loader-ui/1",
  }, "Loader", [{
    path: "config.json",
    mime: "application/json; charset=utf-8",
    bytes: new TextEncoder().encode(JSON.stringify({ defaultEditorPackageId: "intent-map.test" })),
  }])],
  ["a1_loader_next_1_0_0_20260726.pip", await build({
    ...common,
    packageId: "pip-loader-next.test",
    layer: "a1",
    artifactName: "loader_next",
    name: "PIP Loader Next Test",
    packageVersion: "1.0.0",
    releaseDate: "20260726",
    rootNodeId: "loader_next_root",
  }, "Loader Next")],
];

await mkdir(fixtures, { recursive: true });
for (const [name, bytes] of entries) await writeFile(path.join(fixtures, name), bytes);
process.stdout.write(entries.map(([name]) => path.join(fixtures, name)).join("\n") + "\n");
