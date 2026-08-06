import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip as encodePipWithPolicy,
} from "../app/runtime/pip.ts";
import { createApplicationDocument, serializeIntentDocument } from "../app/runtime/model.ts";
import { createdAtFor, projectRoot, readReleaseConfig, systemPackagePath } from "./pip-release.mjs";
import { collectSourceAssets, softwareProjectRoot } from "./pip-source-assets.mjs";
import { packagedPipIoPolicy, trustedBuildPipIo } from "./pip-io-policy.mjs";

const encodePip = (input) => encodePipWithPolicy(input, trustedBuildPipIo);

const writePackage = async (release, manifest, root, assets) => {
  const output = systemPackagePath(release);
  const bytes = await encodePip({
    manifest: {
      packageId: release.packageId,
      layer: release.layer,
      artifactName: release.artifactName,
      name: release.name,
      packageVersion: release.version,
      releaseDate: release.releaseDate,
      rootNodeId: root.id,
      loaderAbi: "pip-loader/1",
      providedEditorKinds: [],
      supportedDocumentKinds: [],
      preferredEditorKinds: [],
      requiredEditorCapabilities: [],
      requiredCapabilities: [],
      ioPolicy: packagedPipIoPolicy,
      createdAt: createdAtFor(release),
      contentType: "application/vnd.intent-map.pip",
      ...manifest,
    },
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeIntentDocument(createApplicationDocument(root)),
    assets,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  process.stdout.write(`${output}\n`);
};

const release = await readReleaseConfig();
const seedAssets = await collectSourceAssets(projectRoot, [
  "pip-core/Cargo.toml",
  "pip-core/src",
  "pip-seed/Cargo.toml",
  "pip-seed/Cargo.lock",
  "pip-seed/src",
  "pip-seed-tauri/Cargo.toml",
  "pip-seed-tauri/Cargo.lock",
  "pip-seed-tauri/build.rs",
  "pip-seed-tauri/src",
  "pip-seed-tauri/tauri.conf.json",
]);
await writePackage(
  release.seed,
  {
    artifactRole: "authoring-source",
    providedCapabilities: [],
    requiredAuthoringCapabilities: ["software-authoring/1"],
    authoringKind: "software-project/1",
    authoringCompiler: "pip-seed-native/1",
  },
  softwareProjectRoot({
    id: "pip_seed_root",
    name: "PIP Seed",
    description: "Native, replaceable trust-root source package.",
    compiler: "pip-seed-native/1",
    assets: seedAssets,
  }),
  seedAssets,
);

const capabilityBytes = new Uint8Array(await readFile(
  new URL("../a3/extensions/software-authoring/capability.mjs", import.meta.url),
));
const a3SourceAssets = await collectSourceAssets(projectRoot, ["a3"]);
await writePackage(
  release.softwareAuthoring,
  {
    artifactRole: "source-and-runtime",
    providedCapabilities: ["software-authoring/1"],
    requiredAuthoringCapabilities: ["software-authoring/1"],
    authoringKind: "software-project/1",
    authoringCompiler: "software-authoring/1",
  },
  softwareProjectRoot({
    id: "software_authoring_root",
    name: "Software Authoring",
    description: "Business-independent source, build, test and release capability.",
    compiler: "software-authoring/1",
    assets: a3SourceAssets,
  }),
  [
    { path: "capability.mjs", mime: "text/javascript; charset=utf-8", bytes: capabilityBytes },
    ...a3SourceAssets,
  ],
);
