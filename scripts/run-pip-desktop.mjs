import path from "node:path";
import { spawnSync } from "node:child_process";

import { artifactFilename, projectRoot, readReleaseConfig, runtimeDirectory } from "./pip-release.mjs";

const release = (await readReleaseConfig()).loader;
const result = spawnSync("cargo", [
  "run", "--manifest-path", path.join(projectRoot, "pip-seed-tauri", "Cargo.toml"), "--",
  "--pip", path.join(runtimeDirectory, artifactFilename(release)),
  ...process.argv.slice(2),
], { cwd: projectRoot, stdio: "inherit" });
process.exit(result.status ?? 1);
