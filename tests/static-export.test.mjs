import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the browser adapter mounts the generic RelationHost", async () => {
  const [entry, shell, host] = await Promise.all([
    readFile(new URL("../pip-editor/web/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /createRoot\(root\)\.render/);
  assert.match(entry, /<RelationHost/);
  assert.match(shell, /<div id="root"><\/div>/);
  assert.match(host, /核心为空白宿主/);
  assert.doesNotMatch(host, /IntentNode|SceneNode|CanvasNode/);
});

test("the esbuild export is a self-contained editor shell without Next assets", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\/_next\//);
  assert.match(html, /\.\/assets\/main-[A-Z0-9]+\.js/);
  assert.match(html, /\.\/assets\/main-[A-Z0-9]+\.css/);
  assert.match(html, /\.\/favicon\.svg/);
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
    await access(new URL(`../out/${match[1]}`, import.meta.url));
  }
});

test("derived views never persist an edges collection", async () => {
  const [model, collection] = await Promise.all([
    readFile(new URL("../pip-editor/relation/reference-index.ts", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/packages/collection-package.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(model, /\bedges\s*:/);
  assert.doesNotMatch(collection, /\bedges\s*:/);
  assert.match(model, /incoming/);
});
