import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveRustToolchain } from "./cargo-toolchain.mjs";

import { artifactFilename, projectRoot, readReleaseConfig, runtimeDirectory } from "./pip-release.mjs";

const release = (await readReleaseConfig()).loader;
const toolchain = resolveRustToolchain();
const result = spawnSync(toolchain.cargo, [
  "run", "--manifest-path", path.join(projectRoot, "pip-seed", "cli", "Cargo.toml"), "--",
  "--pip", path.join(runtimeDirectory, "pip", artifactFilename(release)),
  ...process.argv.slice(2),
], { cwd: projectRoot, stdio: "inherit", env: toolchain.env });
process.exit(result.status ?? 1);
