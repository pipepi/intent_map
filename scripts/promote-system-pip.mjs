import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { decodePip as decodePipWithPolicy } from "../pip-editor/pip-package/index.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";
import {
  artifactFilename,
  readReleaseConfig,
  systemPipFilePath,
} from "./pip-release.mjs";
import { sha256 } from "./pip-self-hosting-source.mjs";

const [candidateArgument, packageId] = process.argv.slice(2);
if (!candidateArgument || !packageId || candidateArgument.startsWith("--") || packageId.startsWith("--")) {
  throw new Error(
    "Usage: npm run pip:promote-system -- <candidate-directory> <package-id> [PIP limit options]",
  );
}

const candidateRoot = path.resolve(candidateArgument);
const receipt = JSON.parse(await readFile(
  path.join(candidateRoot, "self-hosting-build-receipt.json"),
  "utf8",
));
if (
  receipt.schemaVersion !== 1 ||
  receipt.kind !== "pip-self-hosting-build/1" ||
  !Array.isArray(receipt.artifacts) ||
  receipt.artifacts.length !== 3 ||
  !/^[a-f0-9]{64}$/.test(receipt.sourceReceiptSha256 ?? "") ||
  !/^[a-f0-9]{64}$/.test(receipt.sourceTreeSha256 ?? "")
) {
  throw new Error("Invalid self-hosting build receipt");
}

const release = await readReleaseConfig();
const maintained = Object.values(release).filter((value) =>
  value?.packageId && ["a0", "a1", "a2"].includes(value.layer));
const maintainedById = new Map(maintained.map((item) => [item.packageId, item]));
const selectedRelease = maintainedById.get(packageId);
if (!selectedRelease) throw new Error("packageId is not maintained by this repository");

const io = pipIoOptionsFromArgs(process.argv.slice(2));
const seenFiles = new Set();
const candidates = new Map();
for (const artifact of receipt.artifacts) {
  const segments = typeof artifact.file === "string" ? artifact.file.split("/") : [];
  if (
    segments.length !== 6 ||
    segments[0] !== "pip-seed" ||
    segments[1] !== "repo" ||
    segments[2] !== "system" ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\")) ||
    seenFiles.has(artifact.file) ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "") ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes < 0
  ) {
    throw new Error("Invalid artifact entry in self-hosting build receipt");
  }
  seenFiles.add(artifact.file);
  const absolute = path.join(candidateRoot, ...segments);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Candidate is not a regular file: ${artifact.file}`);
  const bytes = new Uint8Array(await readFile(absolute));
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
    throw new Error(`Candidate does not match build receipt: ${artifact.file}`);
  }
  const pip = await decodePipWithPolicy(bytes, io);
  const expectedRelease = maintainedById.get(pip.manifest.packageId);
  if (!expectedRelease) throw new Error(`Candidate package is not maintained: ${pip.manifest.packageId}`);
  const expectedFile = artifactFilename(expectedRelease);
  const expectedRelative = [
    "pip-seed",
    "repo",
    "system",
    expectedRelease.layer,
    expectedRelease.packageId,
    expectedFile,
  ].join("/");
  if (
    artifact.file !== expectedRelative ||
    pip.manifest.layer !== expectedRelease.layer ||
    pip.manifest.artifactName !== expectedRelease.artifactName ||
    pip.manifest.packageVersion !== expectedRelease.version ||
    pip.manifest.releaseDate !== expectedRelease.releaseDate
  ) {
    throw new Error(`Candidate identity does not match release config: ${artifact.file}`);
  }
  if (candidates.has(pip.manifest.packageId)) {
    throw new Error(`Duplicate candidate packageId: ${pip.manifest.packageId}`);
  }
  candidates.set(pip.manifest.packageId, { bytes, pip });
}
if (candidates.size !== maintained.length) {
  throw new Error("Build receipt does not contain every maintained a0-a2 package");
}

const selected = candidates.get(packageId);
if (!selected) throw new Error(`Build receipt does not contain packageId: ${packageId}`);
const destination = systemPipFilePath(selectedRelease);
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, selected.bytes, { flag: "wx" });
process.stdout.write(`${destination}\n`);
