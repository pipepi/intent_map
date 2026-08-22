import { spawnSync } from "node:child_process";
import { resolveRustToolchain } from "./cargo-toolchain.mjs";

try {
  const toolchain = resolveRustToolchain();
  const result = spawnSync(toolchain.cargo, process.argv.slice(2), { stdio: "inherit", env: toolchain.env });
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(127);
}
