import { rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");

// A clean cache is required for distributable builds. Next can otherwise reuse
// an older CSS module while regenerating index.html, producing a valid-looking
// but internally inconsistent static export.
await rm(path.join(root, ".next"), { recursive: true, force: true });

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
    cwd: root,
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Next build terminated by ${signal}`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) {
  throw new Error(`Next build failed with exit code ${exitCode}`);
}
