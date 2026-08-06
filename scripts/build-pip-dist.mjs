import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { decodePip as decodePipWithPolicy } from "../app/runtime/pip.ts";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";
import {
  applicationDirectory,
  artifactFilename,
  projectRoot,
  readReleaseConfig,
  runtimeDirectory,
  systemPackagePath,
} from "./pip-release.mjs";

const decodePip = (source) => decodePipWithPolicy(source, trustedBuildPipIo);

const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", script)], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm(runtimeDirectory, { recursive: true, force: true });
run("build-system-core-pips.mjs");
run("build-pip-seed.mjs");
run("build-loader.mjs");
run("build-static.mjs");
run("build-pip.mjs");

const release = await readReleaseConfig();
const selected = [release.seed, release.loader, release.intentMap, release.softwareAuthoring];
await mkdir(applicationDirectory, { recursive: true });
for (const item of selected) {
  await copyFile(systemPackagePath(item), path.join(applicationDirectory, artifactFilename(item)));
}

const rootEntries = await readdir(runtimeDirectory, { withFileTypes: true });
const seedExtension = process.platform === "darwin" ? "app" : process.platform === "win32" ? "exe" : "";
const seedFile = artifactFilename(release.seed, seedExtension);
const seedEntry = rootEntries.find((entry) => entry.name === seedFile);
if (!seedEntry || (process.platform === "darwin" ? !seedEntry.isDirectory() : !seedEntry.isFile())) {
  throw new Error(`distribution is missing the configured Seed artifact: ${seedFile}`);
}
if (rootEntries.some((entry) => entry.isFile() && entry.name.endsWith(".pip"))) {
  throw new Error("distribution root may not contain PIP files");
}
if (process.platform === "darwin") {
  await access(path.join(runtimeDirectory, seedFile, "Contents", "MacOS", "pip-seed-tauri"));
}

const files = (await readdir(applicationDirectory)).filter((file) => file.endsWith(".pip")).sort();
if (files.length !== selected.length) throw new Error("runtime PIP repository is incomplete");
const packageIds = new Set();
const distribution = [{
  file: seedFile,
  layer: "a0-native",
  artifactName: release.seed.artifactName,
  version: release.seed.version,
  releaseDate: release.seed.releaseDate,
}];
for (const file of files) {
  const bytes = new Uint8Array(await readFile(path.join(applicationDirectory, file)));
  const pip = await decodePip(bytes);
  const expected = artifactFilename({
    layer: pip.manifest.layer,
    artifactName: pip.manifest.artifactName,
    version: pip.manifest.packageVersion,
    releaseDate: pip.manifest.releaseDate,
  });
  if (file !== expected) throw new Error(`${file}: filename does not match manifest`);
  if (packageIds.has(pip.manifest.packageId)) throw new Error(`${file}: duplicate packageId`);
  packageIds.add(pip.manifest.packageId);
  distribution.push({
    file: `pip/${file}`,
    layer: pip.manifest.layer,
    artifactName: pip.manifest.artifactName,
    packageId: pip.manifest.packageId,
    version: pip.manifest.packageVersion,
    releaseDate: pip.manifest.releaseDate,
  });
}
if (![...packageIds].includes(release.defaults.loaderPackageId)) throw new Error("default loader is missing");
if (![...packageIds].includes(release.defaults.editorPackageId)) throw new Error("default editor is missing");
const commandVersion = (command, args) => spawnSync(command, args, { encoding: "utf8" }).stdout.trim();
const seedBinaryPath = process.platform === "darwin"
  ? path.join(runtimeDirectory, seedFile, "Contents", "MacOS", "pip-seed-tauri")
  : path.join(runtimeDirectory, seedFile);
const seedSource = await readFile(systemPackagePath(release.seed));
const seedBinary = await readFile(seedBinaryPath);
const receipt = {
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  toolchain: {
    node: process.version,
    rustc: commandVersion("rustc", ["--version"]),
    cargo: commandVersion("cargo", ["--version"]),
  },
  artifacts: await Promise.all([
    {
      file: seedFile,
      sourceSha256: createHash("sha256").update(seedSource).digest("hex"),
      artifactSha256: createHash("sha256").update(seedBinary).digest("hex"),
    },
    ...selected.map(async (item) => {
      const source = await readFile(systemPackagePath(item));
      const hash = createHash("sha256").update(source).digest("hex");
      return { file: `pip/${artifactFilename(item)}`, sourceSha256: hash, artifactSha256: hash };
    }),
  ]),
};
await writeFile(path.join(runtimeDirectory, "build-receipt.json"), JSON.stringify(receipt, null, 2));
process.stdout.write(`${runtimeDirectory}\n${JSON.stringify(distribution, null, 2)}\n`);
