import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the application root exposes the generic RelationHost", async () => {
  const [home, host] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_editor/relation-host.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<RelationHost/);
  assert.match(host, /核心为空白宿主/);
  assert.doesNotMatch(host, /IntentNode|SceneNode|CanvasNode/);
});

test("derived views never persist an edges collection", async () => {
  const [model, collection] = await Promise.all([
    readFile(new URL("../app/relation/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_editor/plugin-editor/collection-package.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(model, /\bedges\s*:/);
  assert.doesNotMatch(collection, /\bedges\s*:/);
  assert.match(model, /incoming/);
});
