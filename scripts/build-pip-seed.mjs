import { copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  artifactFilename,
  projectRoot,
  readReleaseConfig,
  runtimeDirectory,
} from "./pip-release.mjs";

const release = (await readReleaseConfig()).seed;
await mkdir(runtimeDirectory, { recursive: true });

if (process.platform === "darwin") {
  const tauriConfig = JSON.parse(await readFile(
    path.join(projectRoot, "pip-seed-tauri", "tauri.conf.json"),
    "utf8",
  ));
  const tauri = path.join(projectRoot, "node_modules", ".bin", "tauri");
  const bundle = spawnSync(tauri, [
    "build",
    "--bundles",
    "app",
    "--config",
    JSON.stringify({ version: release.version }),
  ], {
    cwd: path.join(projectRoot, "pip-seed-tauri"),
    stdio: "inherit",
  });
  if (bundle.status !== 0) process.exit(bundle.status ?? 1);
  const source = path.join(
    projectRoot,
    "pip-seed-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    `${tauriConfig.productName}.app`,
  );
  const destination = path.join(runtimeDirectory, artifactFilename(release, "app"));
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  process.stdout.write(`${destination}\n`);
  process.exit(0);
}

const cargo = spawnSync("cargo", [
  "build", "--release", "--manifest-path", path.join(projectRoot, "pip-seed-tauri", "Cargo.toml"),
], { cwd: projectRoot, stdio: "inherit" });
if (cargo.status !== 0) process.exit(cargo.status ?? 1);
const executableExtension = process.platform === "win32" ? "exe" : "";
const source = path.join(
  projectRoot,
  "pip-seed-tauri",
  "target",
  "release",
  process.platform === "win32" ? "pip-seed-tauri.exe" : "pip-seed-tauri",
);
const destination = path.join(runtimeDirectory, artifactFilename(release, executableExtension));
await copyFile(source, destination);
process.stdout.write(`${destination}\n`);
