import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sourceUnder = async (relative) => Promise.all((await readdir(new URL(relative, root), { recursive: true }))
  .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file))
  .map(async (file) => ({ file, source: await readFile(new URL(file, new URL(relative, root)), "utf8") })));

test("PipNode core and host do not import domain plugin suites or a3", async () => {
  const pipSources = await sourceUnder("pip-editor/pip/");
  const hostSources = await sourceUnder("pip-editor/pip-host/");
  for (const { file, source } of [...pipSources, ...hostSources]) {
    assert.doesNotMatch(source, /plugins\/(?:intent|scene)|\/a3\//, file);
    assert.doesNotMatch(source, /IntentNode|SceneNode|CanvasNode/, file);
  }
  for (const { file, source } of pipSources) {
    assert.doesNotMatch(source, /pip-host|pip-editor-plugins|\/app\//, file);
  }
});

test("external suites contain domain behavior outside the blank host", async () => {
  const [intent, sceneSources] = await Promise.all([
    readFile(new URL("pip-editor-io/intent/suite.ts", root), "utf8"),
    sourceUnder("pip-editor-io/scene/"),
  ]);
  const scene = sceneSources.map(({ source }) => source).join("\n");
  assert.match(intent, /registerExecutor\("intent\.evaluate"/);
  assert.match(scene, /registerLanguageProvider/);
  assert.match(scene, /"subject"/);
});
