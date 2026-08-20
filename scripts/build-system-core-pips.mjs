import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip as encodePipWithPolicy,
} from "../app/runtime/pip.ts";
import { createRelationDocument, serializeRelationDocument } from "../app/relation/document.ts";
import { createdAtFor, projectRoot, readReleaseConfig, systemPackagePath } from "./pip-release.mjs";
import { collectSourceAssets, softwareProjectGraph } from "./pip-source-assets.mjs";
import { packagedPipIoPolicy, trustedBuildPipIo } from "./pip-io-policy.mjs";
import { systemSourceEntriesFor } from "./pip-system-sources.mjs";

const encodePip = (input) => encodePipWithPolicy(input, trustedBuildPipIo);

const writePackage = async (release, manifest, project, assets) => {
  const output = systemPackagePath(release);
  const bytes = await encodePip({
    manifest: {
      packageId: release.packageId,
      layer: release.layer,
      artifactName: release.artifactName,
      name: release.name,
      packageVersion: release.version,
      releaseDate: release.releaseDate,
      rootNodeId: project.rootNodeId,
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
    rootTreeText: serializeRelationDocument(createRelationDocument(project.graph, [project.rootNodeId])),
    assets,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  process.stdout.write(`${output}\n`);
};

const release = await readReleaseConfig();
const seedAssets = await collectSourceAssets(
  projectRoot,
  systemSourceEntriesFor(release.seed.packageId),
);
await writePackage(
  release.seed,
  {
    artifactRole: "authoring-source",
    providedCapabilities: [],
    requiredAuthoringCapabilities: [],
    authoringKind: "software-project/1",
    authoringCompiler: "pip-seed-native/1",
  },
  softwareProjectGraph({
    id: "pip_seed_root",
    name: "PIP Seed",
    description: "Native, replaceable trust-root source package.",
    compiler: "pip-seed-native/1",
    assets: seedAssets,
  }),
  seedAssets,
);
