import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("exports a fully static entry page", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");

  assert.match(html, /<title>Intent Map｜分形意图编辑器<\/title>/);
  assert.match(html, /<main class="app-shell">/);
  assert.match(html, /○ Static|Intent Map/);
  assert.match(html, /Agentic 软件开发框架/);
  assert.match(html, /核心物流动场景序列与约束/);
  assert.match(html, /场景匹配的 UI Demo 与流程共识/);
  assert.match(html, /业务流程匹配的数据库表结构/);
  assert.match(html, /基于表结构的业务逻辑与 UI API/);
  assert.match(html, /resize-handle resize-e/);
  assert.match(html, /resize-handle resize-s/);
  assert.match(html, /resize-handle resize-se/);
  assert.match(html, /resize-mode-toggle simple/);
  assert.match(html, /node-interface-port input-interface-port/);
  assert.match(html, /node-interface-port output-interface-port/);
  assert.match(html, /node-interface-section/);
  assert.match(html, /height:166px/);
  assert.match(html, /title="业务约束"/);
  assert.match(html, /title="场景序列与约束"/);
  assert.doesNotMatch(html, /resize-handle resize-nw/);
  assert.doesNotMatch(html, /next\/headers|x-forwarded-host|codex-preview/);
});

test("supports simple and full node resize modes", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /simpleResizeDirections = \["e", "s", "se"\]/);
  assert.match(page, /resizeDirections = \["nw", "n", "ne", "e", "se", "s", "sw", "w"\]/);
  assert.match(page, /resizeMode: getResizeMode\(child\) === "simple" \? "full" : "simple"/);
  assert.match(page, /onPointerDown=\{\(event\) => resizeNode\(node\.id, direction, event\)\}/);
  assert.match(css, /\.resize-handle\s*\{[^}]*opacity:\s*0 !important/s);
  assert.doesNotMatch(css, /\.graph-node:hover \.resize-handle/);
  assert.doesNotMatch(css, /\.graph-node\.selected \.resize-handle/);
});

test("anchors derived edges to named node interface ports", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /getNodePortAnchorX\(source, "output"\)/);
  assert.match(page, /getNodePortAnchorX\(target, "input"\)/);
  assert.match(page, /NODE_PORT_SECTION_TOP \+ portRows \* NODE_PORT_ROW_GAP \+ NODE_FOOTER_SPACE/);
  assert.match(page, /height: Math\.max\(stored\.height, getNodeMinimumHeight\(node\)\)/);
  assert.match(page, /Math\.min\(startBottom - minimumHeight, startTop \+ dy\)/);
  assert.match(page, /Math\.max\(startTop \+ minimumHeight, startBottom \+ dy\)/);
  assert.match(
    page,
    /<small>\{node\.description\}<\/small>[\s\S]*node-interface-section[\s\S]*node-interface-list input-interface-list[\s\S]*node-ports/,
  );
  assert.match(page, /style=\{\{ height: portRows \* NODE_PORT_ROW_GAP \}\}/);
  assert.match(page, /style=\{\{ top: portIndex \* NODE_PORT_ROW_GAP \}\}/);
  assert.match(css, /\.node-interface-section\s*\{[^}]*position:\s*relative[^}]*flex:\s*0 0 auto/s);
  assert.match(page, /target\.inputs\.findIndex/);
  assert.match(page, /source\?\.outputs\.findIndex/);
  assert.match(css, /\.input-interface-port\s*\{[^}]*left:\s*-41px/s);
  assert.match(css, /\.output-interface-port\s*\{[^}]*right:\s*-41px/s);
  assert.match(css, /\.node-port-name\s*\{[^}]*flex:\s*0 0 56px/s);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /white-space:\s*nowrap/);
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
