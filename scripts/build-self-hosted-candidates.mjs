import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  collectReconstructedSources,
  sha256,
  sourceTreeSha256,
} from "./pip-self-hosting-source.mjs";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (
  !sourceArgument ||
  !outputArgument ||
  sourceArgument.startsWith("--") ||
  outputArgument.startsWith("--")
) {
  throw new Error(
    "Usage: npm run pip:self:build -- <reconstructed-source-directory> <new-candidate-directory>",
  );
}

const runnerRoot = path.resolve(import.meta.dirname, "..");
const source = path.resolve(sourceArgument);
const output = path.resolve(outputArgument);
const assertMissing = async (target, label) => {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists: ${target}`);
};

const receiptDirectory = path.join(source, ".pip");
let sourceReceiptBytes;
try {
  sourceReceiptBytes = await readFile(
    path.join(receiptDirectory, "self-hosting-candidate-source-receipt.json"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  sourceReceiptBytes = await readFile(path.join(receiptDirectory, "self-hosting-source-receipt.json"));
}
const sourceReceipt = JSON.parse(sourceReceiptBytes);
if (![
  "pip-self-hosting-source/1",
  "pip-self-hosting-candidate-source/1",
].includes(sourceReceipt.kind)) {
  throw new Error("Unsupported self-hosting source receipt");
}
const sourceAssets = await collectReconstructedSources(source);
const expectedSourceTreeSha256 = sourceReceipt.kind === "pip-self-hosting-source/1"
  ? sourceReceipt.reconstructedSourceTreeSha256
  : sourceReceipt.sourceTreeSha256;
if (
  sourceAssets.length !== sourceReceipt.sourceFileCount ||
  sourceTreeSha256(sourceAssets) !== expectedSourceTreeSha256
) {
  throw new Error("Reconstructed source no longer matches its receipt");
}

await assertMissing(output, "Candidate destination");
const parent = path.dirname(output);
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(path.join(parent, `.${path.basename(output)}.tmp-`));
const buildRoot = path.join(runnerRoot, ".pip-self-hosting-build-root");
const packagesRoot = path.join(temporary, "packages", "system");

const run = (script) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(buildRoot, "scripts", script)], {
    cwd: buildRoot,
    env: {
      ...process.env,
      PIP_SYSTEM_PACKAGES_DIR: packagesRoot,
      PIP_TOOLCHAIN_ROOT: runnerRoot,
    },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`${script} terminated by ${signal}`));
    else if (code !== 0) reject(new Error(`${script} failed with exit code ${code ?? 1}`));
    else resolve();
  });
});

try {
  await assertMissing(buildRoot, "Self-hosting build root");
  await mkdir(buildRoot);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".pip") continue;
    await cp(path.join(source, entry.name), path.join(buildRoot, entry.name), {
      recursive: entry.isDirectory(),
    });
  }
  await symlink(path.join(runnerRoot, "node_modules"), path.join(buildRoot, "node_modules"), "junction");
  await run("build-system-core-pips.mjs");
  await run("build-loader.mjs");
  await run("build-static.mjs");
  await run("build-pip.mjs");

  const artifacts = [];
  const visitArtifacts = async (relative = "") => {
    for (const entry of (await readdir(path.join(packagesRoot, relative), { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Candidate output contains a symlink: ${child}`);
      if (entry.isDirectory()) await visitArtifacts(child);
      else if (entry.isFile()) {
        const bytes = await readFile(path.join(packagesRoot, child));
        artifacts.push({
          file: `packages/system/${child.split(path.sep).join("/")}`,
          sha256: sha256(bytes),
          bytes: bytes.length,
        });
      }
    }
  };
  await visitArtifacts();
  if (artifacts.length !== 4 || artifacts.some(({ file }) => !file.endsWith(".pip"))) {
    throw new Error("Self-hosted build must produce exactly four system PIP candidates");
  }
  const lockBytes = await readFile(path.join(source, "package-lock.json"));
  const receipt = {
    schemaVersion: 1,
    kind: "pip-self-hosting-build/1",
    sourceReceiptSha256: createHash("sha256").update(sourceReceiptBytes).digest("hex"),
    sourceTreeSha256: expectedSourceTreeSha256,
    toolchain: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packageLockSha256: sha256(lockBytes),
    },
    artifacts,
  };
  await rm(buildRoot, { recursive: true, force: true });
  await writeFile(
    path.join(temporary, "self-hosting-build-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx" },
  );
  await assertMissing(output, "Candidate destination");
  await rename(temporary, output);
  process.stdout.write(`${output}\n${artifacts.length} candidate PIP files\n`);
} catch (error) {
  await rm(buildRoot, { recursive: true, force: true });
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
