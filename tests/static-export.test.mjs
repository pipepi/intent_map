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
  assert.match(page, /if \(!event\.ctrlKey\)/);
  assert.match(page, /x: old\.x - event\.deltaX \* deltaUnit/);
  assert.match(page, /y: old\.y - event\.deltaY \* deltaUnit/);
  assert.match(page, /event\.pointerType === "touch"/);
  assert.match(page, /touchPointersRef/);
  assert.match(page, /currentCenter\.x -\s*gesture\.startCenter\.x/);
  assert.match(page, /target\.addEventListener\("pointercancel", finish\)/);
  assert.match(page, /layoutLocked/);
  assert.match(page, /runtime-add-child/);
  assert.match(page, /className="focused-runtime-content"/);
  assert.doesNotMatch(page, /className="focused-runtime-surface"/);
  assert.doesNotMatch(page, /focused-runtime-surface[\s\S]*<header>/);
  assert.match(shell, /scale < 0\.75/);
  assert.match(shell, /lod === "always-live"/);
  assert.match(shell, /runtime-node-titlebar/);
  assert.match(shell, /simpleResizeDirections = \["e", "s", "se"\]/);
  assert.match(shell, /resize-handle resize-\$\{direction\}/);
  assert.match(shell, /resize-mode-toggle runtime-mode-toggle/);
  assert.match(page, /resizeDirectionsFor\(nodeResizeMode\(scopeNode\)\)/);
  assert.match(page, /business-mode-toggle/);
  assert.match(page, /container-mode-toggle/);
  assert.match(page, /toggleBusinessResizeMode/);
  assert.match(page, /toggleNodeResizeMode/);
  assert.match(page, /resizeScopeCanvasStart/);
  assert.match(page, /ROOT_CANVAS_MIN_SIZE/);
  assert.match(page, /ROOT_CANVAS_MAX_SIZE/);
  assert.match(page, /scope-canvas-resize/);
  assert.doesNotMatch(page, /className="root-hud"/);
  assert.doesNotMatch(css, /\.root-hud/);
  assert.match(css, /\.resize-mode-toggle\.simple/);
  assert.match(css, /\.resize-mode-toggle\.full/);
  assert.match(css, /\.resize-handle::after/);
  assert.doesNotMatch(css, /\.runtime-resize/);
  assert.doesNotMatch(css, /\.root-resize/);
  assert.doesNotMatch(css, /\.business-resize/);
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
  assert.match(page, /dispatchRuntimeEvent\(\s*"NAVIGATE_APP_PARENT"/);
  assert.match(page, /dispatchRuntimeEvent\(\s*"FIT_SCOPE"/);
  assert.match(page, /dispatchRuntimeEvent\(\s*"RESET_CAMERA"/);
  assert.match(page, /lastCommands\.forEach/);
  assert.match(page, /runtime-mini-trace/);
});

test("protects core composition and preserves business editing", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /selected\.implementation\?\.core/);
  assert.match(page, /window\.confirm\(`「\$\{selected\.name\}」是核心节点/);
  assert.match(page, /重置应用节点图/);
  assert.match(page, /createApplicationDocument\(clone\(businessRoot\)/);
  assert.match(page, /bindingOptionsFor/);
  assert.match(page, /updateInputBinding/);
  assert.match(page, /updateOutputMapping/);
  assert.match(page, /moveBusinessNodeStart/);
  assert.match(page, /resizeBusinessNodeStart/);
  assert.match(page, /getBoundingClientRect\(\)\.width \/ world\.offsetWidth/);
  assert.match(page, /const BUSINESS_PORT_TOP = 112/);
  assert.match(page, /const BUSINESS_PORT_ROW = 28/);
  assert.match(page, /const BUSINESS_PORT_HEIGHT = 24/);
  assert.match(page, /const BUSINESS_NODE_BORDER_WIDTH = 2/);
  assert.match(page, /const BUSINESS_NODE_BOTTOM_PADDING = 12/);
  assert.match(page, /const businessNodeMinimumHeight/);
  assert.match(page, /rows \* BUSINESS_PORT_ROW \+/);
  assert.match(page, /const businessNodeSize/);
  assert.match(page, /Math\.max\(size\.height, businessNodeMinimumHeight\(node\)\)/);
  assert.match(page, /const minimumHeight = businessNodeMinimumHeight\(node\)/);
  assert.match(page, /style=\{\{ top: BUSINESS_PORT_TOP \}\}/);
  assert.match(page, /BUSINESS_PORT_TOP \+\s*BUSINESS_NODE_BORDER_WIDTH \+/);
  assert.match(page, /BUSINESS_PORT_HEIGHT \/ 2/);
  assert.match(page, /sourceSize\.width \+\s*BUSINESS_PORT_DOT_OFFSET/);
  assert.match(css, /\.business-node-ports i::before/);
  assert.match(css, /\.business-node-ports i\.input\s*\{\s*left:\s*8px/);
  assert.match(css, /\.business-node-ports i\.input::before\s*\{\s*left:\s*-21px/);
  assert.match(css, /\.business-node-ports i\.output\s*\{[\s\S]*right:\s*8px/);
  assert.match(css, /\.business-node-ports i\.output::before\s*\{[\s\S]*right:\s*-21px/);
  assert.match(
    css,
    /\.business-node > strong\s*\{[\s\S]*top:\s*42px;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/,
  );
  assert.match(css, /\.business-node > span\s*\{[\s\S]*top:\s*14px;/);
  assert.match(css, /\.business-node > small\s*\{[\s\S]*top:\s*70px;/);
  assert.match(css, /\.business-node\s*\{[\s\S]*display:\s*block;/);
  assert.match(
    page,
    /const moveBusinessNodeStart = \([\s\S]*?event\.stopPropagation\(\);[\s\S]*?if \(layoutLocked/,
  );
  assert.match(page, /scopeNode\.implementation\?\.key === "current-container"/);
  assert.match(page, /expanded \? 1 : 0\.58/);
});

test("keeps node movement and automatic lanes inside the active root", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /bounds\.width - size\.width - 20/);
  assert.match(page, /bounds\.height - size\.height - 20/);
  assert.match(page, /interface: \[500, 950, 1400\]/);
  assert.match(page, /laneHeights\[lane\]\.indexOf/);
  assert.match(page, /height: Math\.max\(1500, maximumBottom\)/);
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
