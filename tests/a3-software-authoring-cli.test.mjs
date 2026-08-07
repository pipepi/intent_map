import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { softwareAuthoringExtension, businessFlowScenario } from "../a3/extensions/software-authoring/custom-nodes.ts";
import { createWorkspaceResourceIndex, readWorkspaceResourceIndex, workspaceResourceIndexAsset } from "../a3/workspace/resource-index.ts";
import { decodePip, DEFAULT_PIP_LOADER_SOURCE, encodePip } from "../app/runtime/pip.ts";
import { ASK_PIP_IO_POLICY, UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { createApplicationDocument, serializeIntentDocument } from "../app/runtime/model.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const io = { policy: UNLIMITED_PIP_IO_POLICY };

test("software specification CLI projects one custom node into a split workspace", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pip-software-spec-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const workspace = path.join(temporary, "workspace");
  const resourcesDirectory = path.join(workspace, "resources");
  await mkdir(resourcesDirectory, { recursive: true });
  const businessRoot = createSampleBusinessRoot();
  const source = businessRoot.children[0];
  source.extension = softwareAuthoringExtension(businessFlowScenario({
    scenario: "Submit order",
    outcome: "Order accepted",
  }));
  const document = createApplicationDocument(businessRoot);
  const emptyIndex = await createWorkspaceResourceIndex([]);
  const intentPip = await encodePip({
    manifest: {
      packageId: "software-spec-cli-test",
      layer: "a4",
      artifactName: "software_spec_cli_test",
      name: "Software spec CLI test",
      packageVersion: "1.0.0",
      releaseDate: "20260807",
      rootNodeId: document.rootIntent.id,
      loaderAbi: "pip-loader/1",
      artifactRole: "authoring-source",
      providedEditorKinds: [],
      supportedDocumentKinds: [],
      preferredEditorKinds: ["tree-map/1"],
      requiredEditorCapabilities: ["intent-document/3"],
      providedCapabilities: [],
      requiredCapabilities: [],
      requiredAuthoringCapabilities: ["software-authoring/1"],
      ioPolicy: ASK_PIP_IO_POLICY,
      createdAt: "2026-08-07T00:00:00.000Z",
      contentType: "application/vnd.intent-map.pip",
    },
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText: serializeIntentDocument(document),
    assets: [workspaceResourceIndexAsset(emptyIndex)],
  }, io);
  await writeFile(path.join(workspace, "intent.pip"), intentPip);

  const result = spawnSync(process.execPath, [
    path.join(projectRoot, "scripts/project-software-specification.mjs"),
    workspace,
    source.id,
    "--allow-package-limits",
  ], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.projection.kind, "software-specification/1");
  assert.match(
    await readFile(path.join(resourcesDirectory, `docs/${source.id}.md`), "utf8"),
    /Submit order/,
  );
  const saved = await decodePip(new Uint8Array(await readFile(path.join(workspace, "intent.pip"))), io);
  const index = readWorkspaceResourceIndex(saved);
  assert.ok(index.resources.some(({ path }) => path === `docs/${source.id}.md`));
  assert.ok(index.resources.some(({ path }) => path === "a3/projections/index.json"));
});
