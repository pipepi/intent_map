import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { decodePip } from "../pip-editor/pip/index.ts";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";
import {
  artifactFilename,
  readReleaseConfig,
  systemPipFilePath,
} from "./pip-release.mjs";
import {
  mergeSourceAsset,
  sha256,
  sourceTreeSha256,
} from "./pip-self-hosting-source.mjs";

const outputArgument = process.argv[2];
if (!outputArgument || outputArgument.startsWith("--")) {
  throw new Error("Usage: npm run pip:self:extract -- <new-source-directory>");
}

const output = path.resolve(outputArgument);
const assertOutputMissing = async () => {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Source destination already exists: ${output}`);
};

await assertOutputMissing();
const parent = path.dirname(output);
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(path.join(parent, `.${path.basename(output)}.tmp-`));

try {
  const release = await readReleaseConfig();
  const selected = [release.seed, release.loader, release.intentMap];
  const merged = new Map();
  const packages = [];

  for (const item of selected) {
    const packagePath = systemPipFilePath(item);
    const packageBytes = new Uint8Array(await readFile(packagePath));
    const pip = await decodePip(packageBytes, trustedBuildPipIo);
    const expectedFile = artifactFilename(item);
    if (
      path.basename(packagePath) !== expectedFile ||
      pip.manifest.packageId !== item.packageId ||
      pip.manifest.layer !== item.layer ||
      pip.manifest.artifactName !== item.artifactName ||
      pip.manifest.packageVersion !== item.version ||
      pip.manifest.releaseDate !== item.releaseDate
    ) {
      throw new Error(`System package identity mismatch: ${expectedFile}`);
    }
    const sourceAssets = pip.assets.filter(({ path: assetPath }) => assetPath.startsWith("source/"));
    if (sourceAssets.length === 0) throw new Error(`System package has no source assets: ${expectedFile}`);
    for (const asset of sourceAssets) mergeSourceAsset(merged, asset, item.packageId);
    packages.push({
      packageId: item.packageId,
      layer: item.layer,
      artifactFile: expectedFile,
      pipSha256: sha256(packageBytes),
      sourceTreeSha256: sourceTreeSha256(sourceAssets),
      sourceFileCount: sourceAssets.length,
    });
  }

  const sources = [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
  for (const source of sources) {
    const destination = path.join(temporary, ...source.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source.bytes, { flag: "wx" });
  }

  const receipt = {
    schemaVersion: 1,
    kind: "pip-self-hosting-source/1",
    packages,
    reconstructedSourceTreeSha256: sourceTreeSha256(
      sources.map((source) => ({ path: `source/${source.path}`, bytes: source.bytes })),
    ),
    sourceFileCount: sources.length,
  };
  await mkdir(path.join(temporary, ".pip"));
  await writeFile(
    path.join(temporary, ".pip", "self-hosting-source-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx" },
  );
  await assertOutputMissing();
  await rename(temporary, output);
  process.stdout.write(`${output}\n${receipt.sourceFileCount} source files\n`);
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
