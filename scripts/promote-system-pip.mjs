import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { decodePip } from "../app/runtime/pip.ts";
import { readReleaseConfig, systemPackagesDirectory } from "./pip-release.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run pip:promote-system -- <candidate.pip>");
const absolute = path.resolve(input);
const file = path.basename(absolute);
const bytes = new Uint8Array(await readFile(absolute));
const pip = await decodePip(bytes);
if (!["a0", "a1", "a2", "a3"].includes(pip.manifest.layer)) {
  throw new Error("only a0-a3 can be promoted to the system registry");
}
const release = await readReleaseConfig();
const maintained = new Set(Object.values(release).filter((value) => value?.layer).map((value) => value.packageId).filter(Boolean));
if (!maintained.has(pip.manifest.packageId)) throw new Error("packageId is not maintained by this repository");
const expected = `${pip.manifest.layer}_${pip.manifest.artifactName}_${pip.manifest.packageVersion.replaceAll(".", "_")}_${pip.manifest.releaseDate}.pip`;
if (file !== expected) throw new Error("candidate filename does not match manifest");
const destination = path.join(systemPackagesDirectory, pip.manifest.layer, pip.manifest.packageId, file);
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, bytes, { flag: "wx" });
process.stdout.write(`${destination}\n`);
