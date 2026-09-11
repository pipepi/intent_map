import { graphNodes } from "../pip-editor/pip/pip-model.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodePip as decodePipWithPolicy } from "../pip-editor/pip-package/index.ts";
import { loadPipDocument, pipDocumentValues } from "../pip-editor/pip/document.ts";
import { readReleaseConfig, systemPipFilePath } from "./pip-release.mjs";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";

const cliInput = process.argv[2];
const decodePip = (source) => decodePipWithPolicy(
  source,
  cliInput ? pipIoOptionsFromArgs(process.argv.slice(2)) : trustedBuildPipIo,
);

const release = (await readReleaseConfig()).pipIntent;
const input = process.argv[2] ?? systemPipFilePath(release);
const pip = await decodePip(new Uint8Array(await readFile(path.resolve(input))));
const document = loadPipDocument(JSON.parse(pip.rootTreeText));
const { graph } = pipDocumentValues(document);
process.stdout.write(
  `valid PIP\n${pip.manifest.name}\n${pip.manifest.rootNodeId}\n${document.id} · ${Object.keys(graphNodes(graph)).length} nodes\n${pip.assets.length} assets\n`);
