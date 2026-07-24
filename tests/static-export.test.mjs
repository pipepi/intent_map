import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("exports the everything-node application as a static page", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(html, /<title>Intent Map｜分形意图编辑器<\/title>/);
  assert.match(html, /everything-app/);
  assert.match(html, /root-node-viewport/);
  assert.match(html, /Intent Map 应用根/);
  assert.match(page, /一切皆节点 · v2/);
  assert.match(page, /导出 v2/);
  assert.match(page, /兼容 v1/);
  assert.doesNotMatch(html, /next\/headers|x-forwarded-host|codex-preview/);
});

test("renders ten interface nodes and five runtime nodes as root children", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");
  const interfaceNodes = [
    "顶栏与全局命令",
    "意图结构树",
    "模块库",
    "静态校验",
    "面包屑导航",
    "当前作用域工具条",
    "当前容器渲染器",
    "画布状态",
    "属性编辑器",
    "运行追踪",
  ];
  const runtimeNodes = [
    "文档加载器",
    "应用状态",
    "事件时钟",
    "命令处理器",
    "意图执行器",
  ];

  [...interfaceNodes, ...runtimeNodes].forEach((name) =>
    assert.match(html, new RegExp(name)),
  );
  assert.equal((html.match(/class="runtime-node /g) ?? []).length, 15);
});

test("supports root camera navigation, layout editing, and semantic LOD", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const shell = await readFile(
    new URL("app/runtime/node-renderer.tsx", root),
    "utf8",
  );
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /const MIN_SCALE = 0\.5/);
  assert.match(page, /const MAX_SCALE = 2/);
  assert.match(page, /nearestNode\(event\.clientX, event\.clientY\)/);
  assert.match(page, /setScopePath\(\(path\) => path\.slice\(0, -1\)\)/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.key === "Home"/);
  assert.match(page, /event\.key === "0"/);
  assert.match(page, /layoutLocked/);
  assert.match(page, /runtime-add-child/);
  assert.match(shell, /scale < 0\.75/);
  assert.match(shell, /runtime-node-titlebar/);
  assert.match(shell, /runtime-resize-\$\{direction\}/);
  assert.match(css, /\.root-node-viewport\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(css, /\.runtime-node-titlebar\s*\{[^}]*cursor:\s*grab/s);
});

test("derives and aggregates root pipes without persisting edges", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const model = await readFile(new URL("app/runtime/model.ts", root), "utf8");

  assert.match(page, /const deriveEdges/);
  assert.match(page, /const aggregateEdges/);
  assert.match(page, /selectedEdgeId/);
  assert.match(page, /edge\.members\.map/);
  assert.match(model, /\.filter\(\(\[key\]\) => key !== "edges"\)/);
});

test("routes interface commands through the state node and event clock", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /processEventBatch\(pendingEvents, runtimeState, tick\)/);
  assert.match(page, /dispatchRuntimeEvent\("SELECT_NODE"/);
  assert.match(page, /dispatchRuntimeEvent\("NAVIGATE_SCOPE"/);
  assert.match(page, /dispatchRuntimeEvent\("SET_LAYOUT_LOCK"/);
  assert.match(page, /dispatchRuntimeEvent\("DOCUMENT_CHANGED"/);
  assert.match(page, /commandHandlerRef\.current/);
  assert.match(page, /runtime-mini-trace/);
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
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.doesNotMatch(layout, /next\/headers|headers\(\)/);
  assert.doesNotMatch(page, /next\/headers|headers\(\)/);
});
