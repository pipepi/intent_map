import { access, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { decodePip } from "../app/runtime/pip.ts";
import {
  applicationDirectory,
  artifactFilename,
  projectRoot,
  readReleaseConfig,
  runtimeDirectory,
} from "./pip-release.mjs";

const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", script)], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm(runtimeDirectory, { recursive: true, force: true });
run("build-pip-seed.mjs");
run("build-loader.mjs");
run("build-static.mjs");
run("build-pip.mjs");

const release = await readReleaseConfig();
const rootEntries = await readdir(runtimeDirectory, { withFileTypes: true });
const seedExtension = process.platform === "darwin"
  ? "app"
  : process.platform === "win32" ? "exe" : "";
const seedFile = artifactFilename(release.seed, seedExtension);
const seedEntry = rootEntries.find((entry) => entry.name === seedFile);
if (!seedEntry || (process.platform === "darwin" ? !seedEntry.isDirectory() : !seedEntry.isFile())) {
  throw new Error(`distribution is missing the configured Seed artifact: ${seedFile}`);
}
const seedArtifacts = rootEntries.filter((entry) => entry.name.startsWith("a0_"));
if (seedArtifacts.length !== 1) throw new Error("distribution root must contain exactly one a0 Seed");
if (process.platform === "darwin") {
  await access(path.join(runtimeDirectory, seedFile, "Contents", "MacOS", "pip-seed-tauri"));
}
const rootPips = rootEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".pip")).map((entry) => entry.name);
if (rootPips.length !== 1 || rootPips[0] !== artifactFilename(release.loader)) {
  throw new Error("distribution root must contain exactly the configured a1 Loader PIP");
}
const applicationFiles = (await readdir(applicationDirectory)).filter((file) => file.endsWith(".pip"));
const packageIds = new Set();
const manifest = [{
  file: seedFile,
  layer: release.seed.layer,
  artifactName: release.seed.artifactName,
  version: release.seed.version,
  releaseDate: release.seed.releaseDate,
}];
for (const file of [rootPips[0], ...applicationFiles.map((name) => `pip/${name}`)]) {
  const pip = await decodePip(new Uint8Array(await readFile(path.join(runtimeDirectory, file))));
  const expected = artifactFilename({
    layer: pip.manifest.layer,
    artifactName: pip.manifest.artifactName,
    version: pip.manifest.packageVersion,
    releaseDate: pip.manifest.releaseDate,
  });
  if (path.basename(file) !== expected) throw new Error(`${file}: filename does not match manifest`);
  if (file.startsWith("pip/") && pip.manifest.layer === "a1") throw new Error(`${file}: a1 is not an application`);
  if (packageIds.has(pip.manifest.packageId)) throw new Error(`${file}: duplicate packageId`);
  packageIds.add(pip.manifest.packageId);
  manifest.push({
    file,
    layer: pip.manifest.layer,
    artifactName: pip.manifest.artifactName,
    packageId: pip.manifest.packageId,
    version: pip.manifest.packageVersion,
    releaseDate: pip.manifest.releaseDate,
  });
}
process.stdout.write(`${runtimeDirectory}\n${JSON.stringify(manifest, null, 2)}\n`);
