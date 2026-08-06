import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodePip } from "../app/runtime/pip.ts";
import { readReleaseConfig, systemPackagePath } from "../scripts/pip-release.mjs";

const release = await readReleaseConfig();
const load = async (item) => decodePip(new Uint8Array(await readFile(systemPackagePath(item))));

test("the Git-tracked system registry contains a0 through a3 source packages", async () => {
  const packages = await Promise.all([
    load(release.seed),
    load(release.loader),
    load(release.intentMap),
    load(release.softwareAuthoring),
  ]);
  assert.deepEqual(packages.map((pip) => pip.manifest.layer), ["a0", "a1", "a2", "a3"]);
  packages.forEach((pip) => {
    assert.ok(pip.assets.some((asset) => asset.path.startsWith("source/")), `${pip.manifest.packageId} has source assets`);
  });
});

test("the default a2 declares editor kinds and the default a3 declares capabilities", async () => {
  const editor = await load(release.intentMap);
  const authoring = await load(release.softwareAuthoring);
  assert.equal(editor.manifest.editorAbi, "pip-editor/1");
  assert.deepEqual(editor.manifest.providedEditorKinds, ["tree-map/1", "graph/1"]);
  assert.deepEqual(authoring.manifest.providedCapabilities, ["software-authoring/1"]);
  assert.ok(authoring.assets.some((asset) => asset.path === "capability.mjs"));
});
