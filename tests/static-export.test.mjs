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
  assert.match(html, /height:173px/);
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
  assert.match(css, /\.graph-node:hover \.resize-nw/);
  assert.match(css, /\.graph-node:hover \.resize-ne/);
  assert.match(css, /\.graph-node:hover \.resize-se/);
  assert.match(css, /\.graph-node:hover \.resize-sw/);
  assert.match(css, /\.graph-node\.selected \.resize-nw/);
  assert.match(css, /\.graph-node\.selected \.resize-sw[\s\S]*opacity:\s*1 !important/);
  assert.doesNotMatch(css, /\.graph-node:hover \.resize-[nesw],/);
  assert.doesNotMatch(css, /\.graph-node\.selected \.resize-[nesw],/);
});

test("gives the current container the same resize modes as child nodes", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /canvasSize\?: \{ width: number; height: number \}/);
  assert.match(page, /canvasContentOffset\?: \{ x: number; y: number \}/);
  assert.match(page, /currentResizeMode === "full" \? resizeDirections : simpleResizeDirections/);
  assert.match(page, /resizeCurrentContainer\(direction, event\)/);
  assert.match(page, /canvasSize: finalState\.size/);
  assert.match(page, /canvasContentOffset: finalState\.offset/);
  assert.match(page, /direction\.includes\("w"\) \? nextSize\.width - startSize\.width : 0/);
  assert.match(page, /direction\.includes\("n"\) \? nextSize\.height - startSize\.height : 0/);
  assert.match(page, /x: child\.position\.x \+ contentShift\.x/);
  assert.match(page, /y: child\.position\.y \+ contentShift\.y/);
  assert.match(page, /startSize\.width - startOffset\.x/);
  assert.match(page, /startSize\.height - startOffset\.y/);
  assert.doesNotMatch(page, /left: 23 \+ canvasContentOffset\.x/);
  assert.doesNotMatch(page, /left: 26 \+ canvasContentOffset\.x/);
  assert.doesNotMatch(page, /top: 76 \+ canvasContentOffset\.y/);
  assert.doesNotMatch(page, /170 \+ canvasContentOffset\.y/);
  assert.doesNotMatch(page, /178 \+ canvasContentOffset\.x/);
  assert.match(page, /x: child\.position\.x \+ contentShift\.x/);
  assert.match(page, /y: child\.position\.y \+ contentShift\.y/);
  assert.match(page, /left: 410 \+ canvasContentOffset\.x/);
  assert.match(page, /viewBox=\{`0 0 \$\{canvasSize\.width\} \$\{canvasSize\.height\}`\}/);
  assert.match(page, /viewport\.clientWidth \/ activeCanvasSize\.width/);
  assert.match(page, /viewport\.clientHeight \/ activeCanvasSize\.height/);
  assert.match(
    page,
    /left: CANVAS_NODE_MARGIN\.left,\s+top: CANVAS_NODE_MARGIN\.top,/,
  );
  assert.doesNotMatch(
    page,
    /left: CANVAS_NODE_MARGIN\.left \+ contentOffset\.x/,
  );
  assert.doesNotMatch(
    page,
    /top: CANVAS_NODE_MARGIN\.top \+ contentOffset\.y/,
  );
  assert.match(
    page,
    /startSize\.width \+ CANVAS_NODE_MARGIN\.left - minimumChildLeft/,
  );
  assert.match(
    page,
    /startSize\.height \+ CANVAS_NODE_MARGIN\.top - minimumChildTop/,
  );
  assert.match(
    page,
    /child\.position\.x \+\s+getNodeSize\(child\)\.width \+\s+CANVAS_NODE_MARGIN\.right/,
  );
  assert.match(
    page,
    /child\.position\.y \+\s+getNodeSize\(child\)\.height \+\s+CANVAS_NODE_MARGIN\.bottom/,
  );
  assert.match(html, /container-resize-layer/);
  assert.match(html, /resize-mode-toggle container-mode-toggle simple/);
  assert.match(css, /\.container-resize-layer\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.container-resize-layer \.resize-handle\s*\{[^}]*pointer-events:\s*auto/s);
});

test("anchors derived edges to named node interface ports", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(page, /getNodePortAnchorX\(source, "output"\)/);
  assert.match(page, /getNodePortAnchorX\(target, "input"\)/);
  assert.match(page, /NODE_PORT_SECTION_TOP = 83/);
  assert.match(
    page,
    /NODE_PORT_SECTION_TOP \+ NODE_PORT_SIZE\.height \/ 2 \+ index \* NODE_PORT_ROW_GAP/,
  );
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
  assert.match(page, /NODE_PORT_ANCHOR_OUTSET = 5\.5/);
  assert.match(css, /\.input-interface-port\s*\{[^}]*left:\s*0/s);
  assert.match(css, /\.output-interface-port\s*\{[^}]*right:\s*0/s);
  assert.match(css, /\.input-interface-port \.node-port-dot\s*\{[^}]*left:\s*-9px/s);
  assert.match(css, /\.output-interface-port \.node-port-dot\s*\{[^}]*right:\s*-9px/s);
  assert.match(css, /\.node-port-name\s*\{[^}]*flex:\s*0 0 56px/s);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(
    page,
    /className="node-interface-port input-interface-port container-interface-port"/,
  );
  assert.match(
    page,
    /className="node-interface-port output-interface-port container-interface-port"/,
  );
  assert.match(page, /x: -NODE_PORT_ANCHOR_OUTSET/);
  assert.match(page, /y: getNodePortY\(Math\.max\(index, 0\)\)/);
  assert.match(page, /const targetX = canvasSize\.width \+ NODE_PORT_ANCHOR_OUTSET/);
  assert.match(page, /const targetY = getNodePortY\(outputIndex\)/);
  assert.doesNotMatch(page, /className="intent-node env-node"/);
  assert.doesNotMatch(page, /className="intent-node output-node"/);
  assert.match(
    css,
    /\.environment-stack,\s*\.output-stack\s*\{[^}]*width:\s*72px[^}]*top:\s*83px/s,
  );
  assert.match(css, /\.environment-stack\s*\{[^}]*left:\s*0/s);
  assert.match(css, /\.output-stack\s*\{[^}]*right:\s*0/s);
  assert.match(css, /\.canvas-stage\s*\{[^}]*overflow:\s*visible/s);
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
