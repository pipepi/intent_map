import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const pipPath = path.resolve(root, "dist/pip/intent-map.pip");
const outputPath = path.resolve(root, "dist/pip/intent-map.pip.exe");

const cargo = spawnSync(
  "cargo",
  ["build", "--release", "--manifest-path", path.join(root, "pip-seed", "Cargo.toml")],
  { cwd: root, stdio: "inherit" },
);
if (cargo.status !== 0) process.exit(cargo.status ?? 1);

const seedPath = path.join(
  root,
  "pip-seed",
  "target",
  "release",
  process.platform === "win32" ? "pip-seed.exe" : "pip-seed",
);
const [seed, pip] = await Promise.all([readFile(seedPath), readFile(pipPath)]);
const footer = Buffer.alloc(64);
Buffer.from("PIPEXE\0\0", "binary").copy(footer);
footer.writeUInt32LE(1, 8);
footer.writeUInt32LE(64, 12);
footer.writeBigUInt64LE(BigInt(seed.length), 16);
footer.writeBigUInt64LE(BigInt(pip.length), 24);
createHash("sha256").update(pip).digest().copy(footer, 32);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.concat([seed, pip, footer]));
process.stdout.write(`${outputPath}\n${seed.length + pip.length + footer.length} bytes\n`);
