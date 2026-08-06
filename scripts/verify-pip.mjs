import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodePip as decodePipWithPolicy } from "../app/runtime/pip.ts";
import { loadIntentDocument } from "../app/runtime/model.ts";
import { readReleaseConfig, systemPackagePath } from "./pip-release.mjs";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";

const cliInput = process.argv[2];
const decodePip = (source) => decodePipWithPolicy(
  source,
  cliInput ? pipIoOptionsFromArgs(process.argv.slice(2)) : trustedBuildPipIo,
);

const release = (await readReleaseConfig()).intentMap;
const input = process.argv[2] ?? systemPackagePath(release);
const pip = await decodePip(new Uint8Array(await readFile(path.resolve(input))));
const document = loadIntentDocument(JSON.parse(pip.rootTreeText));
process.stdout.write(
  `valid PIP\n${pip.manifest.name}\n${pip.manifest.rootNodeId}\nv${document.version} · ${document.workspaceState.panels.length} panels\n${pip.assets.length} assets\n`,
);
