import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodePip as decodePipWithPolicy } from "../pip-editor/pip-package/index.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../pip-editor/pip-package/io-policy.ts";
import { loadPipDocument } from "../pip-editor/pip/document.ts";
import { readReleaseConfig, systemPipFilePath } from "../scripts/pip-release.mjs";

const release = await readReleaseConfig();
const load = async (item) => decodePipWithPolicy(new Uint8Array(await readFile(systemPipFilePath(item))), { policy: UNLIMITED_PIP_IO_POLICY });

test("system PIP repository contains only the blank a0-a2 core packages", async () => {
  assert.equal(release.softwareAuthoring, undefined);
  assert.deepEqual(release.defaults.capabilities, {});
  const packages = await Promise.all([load(release.seed), load(release.loader), load(release.pipIntent)]);
  assert.deepEqual(packages.map((pip) => pip.manifest.layer), ["a0", "a1", "a2"]);
  packages.forEach((pip) => assert.equal(loadPipDocument(JSON.parse(pip.rootTreeText)).id, "pip-workspace@3"));
});

test("a2 advertises only the generic pip workspace editor", async () => {
  const editor = await load(release.pipIntent);
  assert.equal(editor.manifest.editorAbi, "pip-editor/1");
  assert.deepEqual(editor.manifest.providedEditorKinds, ["pip-graph/1"]);
  assert.deepEqual(editor.manifest.supportedDocumentKinds, ["pip-workspace/1", "pip-workspace/2", "pip-workspace/3"]);
  assert.deepEqual(editor.manifest.requiredAuthoringCapabilities, []);
});
