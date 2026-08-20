import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blank host installs only explicit ZIP files and never auto-loads domain packages", async () => {
  const host = await readFile(new URL("../app/_editor/relation-host.tsx", import.meta.url), "utf8");
  assert.match(host, /decodeZip\(archive\)/);
  assert.match(host, /intent-element-plugin/);
  assert.match(host, /intent-node-type-plugin/);
  assert.match(host, /intent-node-collection/);
  assert.doesNotMatch(host, /buildIntentPluginSuite|buildScenePluginSuite|installSamples/);
});
