import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const packageFiles = [
  "packages/system/a0/pip-seed/a0_pip_seed_1_0_0_20260806.pip",
  "packages/system/a1/pip-loader/a1_loader_1_0_0_20260806.pip",
  "packages/system/a2/intent-map/a2_intent_map_1_0_0_20260806.pip",
  "packages/system/a3/software-authoring/a3_software_authoring_1_0_0_20260806.pip",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const makeCandidates = async (candidateRoot) => {
  const artifacts = [];
  for (const file of packageFiles) {
    const bytes = await readFile(path.join(root, file));
    await mkdir(path.dirname(path.join(candidateRoot, file)), { recursive: true });
    await cp(path.join(root, file), path.join(candidateRoot, file));
    artifacts.push({ file, sha256: sha256(bytes), bytes: bytes.length });
  }
  await writeFile(path.join(candidateRoot, "self-hosting-build-receipt.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "pip-self-hosting-build/1",
    sourceReceiptSha256: "1".repeat(64),
    sourceTreeSha256: "2".repeat(64),
    toolchain: {},
    artifacts,
  }));
};

const run = (candidateRoot, registry, packageId = "pip-loader") => spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/promote-system-pip.mjs"),
    candidateRoot,
    packageId,
    "--allow-package-limits",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PIP_SYSTEM_PACKAGES_DIR: registry },
  },
);

test("system promotion requires and verifies the complete candidate build receipt", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-promote-system-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const candidateRoot = path.join(temporary, "candidates");
  const registry = path.join(temporary, "registry");
  await mkdir(candidateRoot);
  await makeCandidates(candidateRoot);
  const promoted = run(candidateRoot, registry);
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.deepEqual(
    await readFile(path.join(registry, "a1", "pip-loader", path.basename(packageFiles[1]))),
    await readFile(path.join(root, packageFiles[1])),
  );
  const overwrite = run(candidateRoot, registry);
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /EEXIST/);

  const tamperedRegistry = path.join(temporary, "tampered-registry");
  await writeFile(path.join(candidateRoot, packageFiles[3]), "tampered");
  const tampered = run(candidateRoot, tamperedRegistry);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /does not match build receipt/);
});
