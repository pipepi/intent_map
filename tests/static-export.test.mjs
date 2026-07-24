import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("exports a fully static entry page", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");

  assert.match(html, /<title>Intent Map｜分形意图编辑器<\/title>/);
  assert.match(html, /<main class="app-shell">/);
  assert.match(html, /○ Static|Intent Map/);
  assert.doesNotMatch(html, /next\/headers|x-forwarded-host|codex-preview/);
});

test("copies all deployment assets into the static output", async () => {
  await Promise.all([
    access(new URL("out/og.png", root)),
    access(new URL("out/favicon.svg", root)),
    access(new URL("out/_next/static/", root)),
  ]);
});

test("keeps server-only request APIs out of the application shell", async () => {
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const config = await readFile(new URL("next.config.ts", root), "utf8");

  assert.doesNotMatch(layout, /next\/headers|\bheaders\s*\(/);
  assert.match(config, /output:\s*"export"/);
  assert.match(config, /unoptimized:\s*true/);
});
