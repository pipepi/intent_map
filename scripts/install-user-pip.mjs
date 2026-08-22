import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decodePip as decodePipWithPolicy } from "../pip-editor/pip/index.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const decodePip = (source) => decodePipWithPolicy(
  source,
  pipIoOptionsFromArgs(process.argv.slice(2)),
);

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run pip:install-user -- <candidate.pip>");
const absolute = path.resolve(input);
const file = path.basename(absolute);
const bytes = new Uint8Array(await readFile(absolute));
const pip = await decodePip(bytes);
const expected = `${pip.manifest.layer}_${pip.manifest.artifactName}_${pip.manifest.packageVersion.replaceAll(".", "_")}_${pip.manifest.releaseDate}.pip`;
if (file !== expected) throw new Error("candidate filename does not match manifest");
const base = process.env.PIP_USER_DATA_DIR ?? (process.platform === "darwin"
  ? path.join(os.homedir(), "Library", "Application Support", "Intent Map")
  : process.platform === "win32"
    ? path.join(process.env.APPDATA ?? os.homedir(), "Intent Map")
    : path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Intent Map"));
const destination = path.join(base, "registry", pip.manifest.layer, file);
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, bytes, { flag: "wx" });
process.stdout.write(`${destination}\n`);
