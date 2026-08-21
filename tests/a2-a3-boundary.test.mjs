import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sourceUnder = async (relative) => Promise.all((await readdir(new URL(relative, root), { recursive: true }))
  .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file))
  .map(async (file) => ({ file, source: await readFile(new URL(file, new URL(relative, root)), "utf8") })));

test("RelationNode core and host do not import domain plugin suites or a3", async () => {
  for (const { file, source } of [...await sourceUnder("app/relation/"), ...await sourceUnder("app/_editor/plugin-editor/")]) {
    assert.doesNotMatch(source, /plugins\/(?:intent|scene)|\/a3\//, file);
    assert.doesNotMatch(source, /IntentNode|SceneNode|CanvasNode/, file);
  }
});

test("external suites contain domain behavior outside the blank host", async () => {
  const [intent, sceneSources] = await Promise.all([
    readFile(new URL("plugins/intent/suite.ts", root), "utf8"),
    sourceUnder("plugins/scene/"),
  ]);
  const scene = sceneSources.map(({ source }) => source).join("\n");
  assert.match(intent, /registerExecutor\("intent\.evaluate"/);
  assert.match(scene, /registerLanguageProvider/);
  assert.match(scene, /"subject"/);
});
