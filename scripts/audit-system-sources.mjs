import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodePip } from "../pip-editor/pip-package/index.ts";
import { collectSourceAssets } from "./pip-source-assets.mjs";
import { trustedBuildPipIo } from "./pip-io-policy.mjs";
import {
  artifactFilename,
  projectRoot,
  readReleaseConfig,
  systemPipFilePath,
} from "./pip-release.mjs";
import { systemSourceEntriesFor } from "./pip-system-sources.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceTreeSha256 = (assets) => {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(sha256(asset.bytes));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const release = await readReleaseConfig();
const selected = [release.seed, release.loader, release.pipIntent];
const packages = [];
for (const item of selected) {
  const packagePath = systemPipFilePath(item);
  const packageBytes = new Uint8Array(await readFile(packagePath));
  const pip = await decodePip(packageBytes, trustedBuildPipIo);
  const expected = (await collectSourceAssets(
    projectRoot,
    systemSourceEntriesFor(item.packageId),
  )).sort((left, right) => left.path.localeCompare(right.path));
  const actual = pip.assets
    .filter(({ path: assetPath }) => assetPath.startsWith("source/"))
    .sort((left, right) => left.path.localeCompare(right.path));
  const expectedByPath = new Map(expected.map((asset) => [asset.path, asset]));
  const actualByPath = new Map(actual.map((asset) => [asset.path, asset]));
  const missingFromPip = expected
    .filter(({ path: assetPath }) => !actualByPath.has(assetPath))
    .map(({ path: assetPath }) => assetPath);
  const missingFromWorkspace = actual
    .filter(({ path: assetPath }) => !expectedByPath.has(assetPath))
    .map(({ path: assetPath }) => assetPath);
  const changed = expected
    .filter((asset) => {
      const packaged = actualByPath.get(asset.path);
      return packaged && sha256(packaged.bytes) !== sha256(asset.bytes);
    })
    .map(({ path: assetPath }) => assetPath);
  packages.push({
    packageId: item.packageId,
    layer: item.layer,
    file: path.relative(projectRoot, packagePath).split(path.sep).join("/"),
    artifactFile: artifactFilename(item),
    pipSha256: sha256(packageBytes),
    sourceTreeSha256: sourceTreeSha256(actual),
    sourceFileCount: actual.length,
    clean: missingFromPip.length === 0 && missingFromWorkspace.length === 0 && changed.length === 0,
    differences: { missingFromPip, missingFromWorkspace, changed },
  });
}
const report = {
  schemaVersion: 1,
  clean: packages.every(({ clean }) => clean),
  packages,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.clean) process.exitCode = 1;
