import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the browser adapter mounts the generic PipHost", async () => {
  const [entry, shell, host] = await Promise.all([
    readFile(new URL("../pip-editor/web/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/pip-host/pip-host.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /createRoot\(root\)\.render/);
  assert.match(entry, /<PipHost/);
  assert.match(shell, /<div id="root"><\/div>/);
  assert.match(host, /new WorkspaceSessionStore\(\[\], setWorkspaces\)/);
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
    readFile(new URL("../pip-editor/pip/reference-index.ts", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/pip-host/packages/node-map-package.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(model, /\bedges\s*:/);
  assert.doesNotMatch(collection, /\bedges\s*:/);
  assert.match(model, /incoming/);
});
