import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  artifactFilename,
  projectRoot,
  readReleaseConfig,
  runtimeDirectory,
} from "./pip-release.mjs";

const root = projectRoot;
const release = (await readReleaseConfig()).seedCli;
const cargo = spawnSync(
  "cargo",
  ["build", "--release", "--manifest-path", path.join(root, "pip-seed", "cli", "Cargo.toml")],
  { cwd: root, stdio: "inherit" },
);
if (cargo.status !== 0) process.exit(cargo.status ?? 1);

const extension = process.platform === "win32" ? ".exe" : "";
const source = path.join(
  root,
  "pip-seed",
  "cli",
  "target",
  "release",
  `pip-seed-cli${extension}`,
);
const destination = path.join(
  runtimeDirectory,
  "tools",
  artifactFilename(release, extension.slice(1)),
);
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
process.stdout.write(`${destination}\n`);
