import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodePip as decodePipWithPolicy } from "../app/runtime/pip.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { loadRelationDocument } from "../app/relation/document.ts";
import { readReleaseConfig, systemPackagePath } from "../scripts/pip-release.mjs";

const release = await readReleaseConfig();
const load = async (item) => decodePipWithPolicy(new Uint8Array(await readFile(systemPackagePath(item))), { policy: UNLIMITED_PIP_IO_POLICY });

test("system registry contains only the blank a0-a2 core packages", async () => {
  assert.equal(release.softwareAuthoring, undefined);
  assert.deepEqual(release.defaults.capabilities, {});
  const packages = await Promise.all([load(release.seed), load(release.loader), load(release.intentMap)]);
  assert.deepEqual(packages.map((pip) => pip.manifest.layer), ["a0", "a1", "a2"]);
  packages.forEach((pip) => assert.equal(loadRelationDocument(JSON.parse(pip.rootTreeText)).format, "relation-workspace"));
});

test("a2 advertises only the generic relation workspace editor", async () => {
  const editor = await load(release.intentMap);
  assert.equal(editor.manifest.editorAbi, "pip-editor/1");
  assert.deepEqual(editor.manifest.providedEditorKinds, ["relation-graph/1"]);
  assert.deepEqual(editor.manifest.supportedDocumentKinds, ["relation-workspace/1"]);
  assert.deepEqual(editor.manifest.requiredAuthoringCapabilities, []);
});
