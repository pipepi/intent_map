import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveRustToolchain } from "./cargo-toolchain.mjs";

import { projectRoot, readReleaseConfig, systemPipFilePath } from "./pip-release.mjs";

const release = await readReleaseConfig();
const toolchain = resolveRustToolchain();
const result = spawnSync(toolchain.cargo, [
  "run", "--manifest-path", path.join(projectRoot, "pip-seed", "tauri", "Cargo.toml"), "--",
  // Development must execute the authoritative packages rebuilt from this
  // checkout, not potentially stale copies left in dist/pip-runtime.
  "--pip", systemPipFilePath(release.loader),
  "--editor", systemPipFilePath(release.pipIntent),
  ...process.argv.slice(2),
], { cwd: projectRoot, stdio: "inherit", env: toolchain.env });
process.exit(result.status ?? 1);
