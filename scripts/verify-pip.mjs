import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodePip as decodePipWithPolicy } from "../pip-editor/pip/index.ts";
import { loadRelationDocument, relationDocumentValues } from "../pip-editor/relation/document.ts";
import { readReleaseConfig, systemPipFilePath } from "./pip-release.mjs";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";

const cliInput = process.argv[2];
const decodePip = (source) => decodePipWithPolicy(
  source,
  cliInput ? pipIoOptionsFromArgs(process.argv.slice(2)) : trustedBuildPipIo,
);

const release = (await readReleaseConfig()).intentMap;
const input = process.argv[2] ?? systemPipFilePath(release);
const pip = await decodePip(new Uint8Array(await readFile(path.resolve(input))));
const document = loadRelationDocument(JSON.parse(pip.rootTreeText));
const { graph } = relationDocumentValues(document);
process.stdout.write(
  `valid PIP\n${pip.manifest.name}\n${pip.manifest.rootNodeId}\n${document.id} · ${Object.keys(graph.nodes).length} nodes\n${pip.assets.length} assets\n`,
);
