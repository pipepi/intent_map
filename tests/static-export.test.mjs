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
  assert.match(html, /根内树 · 多视图工作区/);
  assert.match(html, />v3</);
  assert.match(page, /intent-map-v3\.intent-map\.json/);
  assert.match(page, /v3 工作区不再导出旧版 v1\/v2 文档/);
  assert.doesNotMatch(html, /next\/headers|x-forwarded-host|codex-preview/);
});

test("renders free-layout and workbench panels with six visible surfaces", async () => {
  const html = await readFile(new URL("out/index.html", root), "utf8");
  assert.match(html, /工作台/);
  assert.match(html, /自由布局/);
  assert.match(html, /节点树/);
  assert.match(html, /属性检视器/);
  assert.equal((html.match(/class="workspace-panel /g) ?? []).length, 2);
  assert.equal((html.match(/class="workspace-surface /g) ?? []).length, 6);
});

test("implements panel selection and both surface binding dimensions", async () => {
  const model = await readFile(new URL("app/runtime/model.ts", root), "utf8");
  const workspace = await readFile(
    new URL("app/runtime/workspace.tsx", root),
    "utf8",
  );

  assert.match(model, /type SurfaceInstance = FeaturePanelSurface \| ContainerSurface/);
  assert.match(model, /activeContainerSurfaceId\?: string/);
  assert.match(model, /mode: "fixed-container"/);
  assert.match(model, /mode: "fixed-node"/);
  assert.match(workspace, /activeContainerSurfaceId:/);
  assert.match(workspace, /revision: panel\.selection\.revision \+ 1/);
  assert.match(workspace, /共享选择位于当前范围之外/);
  assert.match(workspace, /当前 Panel 没有 Surface/);
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
  assert.match(page, /const \[navigationStack, setNavigationStack\]/);
  assert.match(page, /navigateToParent\(\)/);
  assert.match(page, /scopeCameraKey\(activeAddress\)/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.key === "Home"/);
  assert.match(page, /event\.key === "0"/);
  assert.match(page, /if \(!event\.ctrlKey\)/);
  assert.match(page, /x: old\.x - event\.deltaX \* deltaUnit/);
  assert.match(page, /y: old\.y - event\.deltaY \* deltaUnit/);
  assert.match(page, /event\.pointerType === "touch"/);
  assert.match(page, /touchPointersRef/);
  assert.match(page, /cameraForTouchGesture/);
  assert.match(page, /Math\.hypot/);
  assert.match(page, /gesture\.startDistance/);
  assert.match(page, /onPointerDownCapture/);
  assert.match(page, /points\.size > 1/);
  assert.match(page, /target\.addEventListener\("pointercancel", finish, true\)/);
  assert.match(page, /layoutLocked/);
  assert.match(page, /runtime-add-child/);
  assert.match(page, /className="focused-runtime-content"/);
  assert.doesNotMatch(page, /className="focused-runtime-surface"/);
  assert.doesNotMatch(page, /focused-runtime-surface[\s\S]*<header>/);
  assert.match(shell, /scale < 0\.55/);
  assert.match(shell, /lod === "always-live"/);
  assert.match(shell, /runtime-node-titlebar/);
  assert.match(shell, /runtime-minimized-titlebar/);
  assert.match(shell, /MINIMIZED_NODE_SIZE = \{ width: 220, height: 52 \}/);
  assert.match(shell, /onDisplayModeToggle/);
  assert.match(shell, /simpleResizeDirections = \["e", "s", "se"\]/);
  assert.match(shell, /resize-handle resize-\$\{direction\}/);
  assert.match(shell, /resize-mode-toggle runtime-mode-toggle/);
  assert.match(page, /resizeDirectionsFor\(nodeResizeMode\(scopeNode\)\)/);
  assert.match(page, /business-mode-toggle/);
  assert.doesNotMatch(
    page,
    /className=\{`resize-mode-toggle business-mode-toggle[\s\S]*?left:\s*node\.position\.x/,
  );
  assert.match(
    page,
    /className=\{`resize-mode-toggle business-mode-toggle[\s\S]*?onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*?event\.stopPropagation\(\);[\s\S]*?toggleBusinessResizeMode\(node\)/,
  );
  assert.match(page, /container-mode-toggle/);
  assert.match(page, /toggleBusinessResizeMode/);
  assert.match(page, /toggleNodeResizeMode/);
  assert.match(page, /toggleNodeDisplayMode/);
  assert.match(page, /toggleBusinessDisplayMode/);
  assert.match(page, /scopeMinimized/);
  assert.match(page, /renderedWorldSize/);
  assert.match(page, /scopeMinimized \? MINIMIZED_NODE_SIZE : worldSize/);
  assert.match(page, /className="root-minimized-node"/);
  assert.match(page, /left: 0/);
  assert.match(page, /top: 0/);
  assert.match(page, /Display-mode changes intentionally refit the same scope/);
  assert.match(page, /window\.setTimeout\(\(\) => setToast\(""\), 2400\)/);
  assert.match(page, /aria-label=\{`关闭提示：\$\{toast\}`\}/);
  assert.match(page, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /data-display-mode/);
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
  assert.match(css, /\.runtime-node\.minimized/);
  assert.match(css, /\.business-node\.minimized/);
  assert.match(css, /\.business-container-node/);
  assert.match(css, /\.business-container-header/);
  assert.match(css, /\.business-container-interfaces/);
  assert.match(css, /\.business-container-node > footer/);
  assert.match(css, /\.root-minimized-node/);
  assert.match(css, /\.node-display-toggle/);
});

test("enables WebView2 pinch gestures in the Tauri seed host", async () => {
  const host = await readFile(
    new URL("pip-seed-tauri/src/main.rs", root),
    "utf8",
  );

  assert.match(
    host,
    /WebviewWindowBuilder::new[\s\S]*?\.zoom_hotkeys_enabled\(true\)[\s\S]*?\.build\(\)\?/,
  );
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
  const businessGeometry = await readFile(
    new URL("app/runtime/business-canvas.ts", root),
    "utf8",
  );
  const shell = await readFile(
    new URL("app/runtime/node-renderer.tsx", root),
    "utf8",
  );

  assert.match(page, /selected\.implementation\?\.core/);
  assert.match(page, /selected\.implementation\?\.core/);
  assert.match(page, /重置应用节点图/);
  assert.match(page, /createApplicationDocument\(clone\(businessRoot\)/);
  assert.match(page, /bindingOptionsFor/);
  assert.match(page, /updateInputBinding/);
  assert.match(page, /updateOutputMapping/);
  assert.match(page, /moveBusinessNodeStart/);
  assert.match(page, /resizeBusinessNodeStart/);
  assert.match(page, /getBoundingClientRect\(\)\.width \/ world\.offsetWidth/);
  assert.match(businessGeometry, /BUSINESS_PORT_TOP = 66/);
  assert.match(businessGeometry, /BUSINESS_PORT_ROW = 28/);
  assert.match(businessGeometry, /BUSINESS_PORT_HEIGHT = 24/);
  assert.match(businessGeometry, /BUSINESS_PORT_DOT_OFFSET = 9/);
  assert.match(businessGeometry, /BUSINESS_NODE_BOTTOM_PADDING = 12/);
  assert.match(businessGeometry, /businessNodeMinimumHeight/);
  assert.match(businessGeometry, /rows \* BUSINESS_PORT_ROW \+/);
  assert.match(businessGeometry, /businessNodeSize/);
  assert.match(page, /className="business-container-node"/);
  assert.match(page, /businessScope\.name/);
  assert.match(page, /businessScope\.description/);
  assert.match(page, /businessScope\.inputs\.map/);
  assert.match(page, /businessScope\.outputs\.map/);
  assert.match(page, /businessScope\.children\?\.length/);
  assert.match(businessGeometry, /Math\.max\(size\.height, businessNodeMinimumHeight\(node\)\)/);
  assert.match(businessGeometry, /const minimumHeight = businessNodeMinimumHeight\(node\)/);
  assert.match(page, /style=\{\{ top: BUSINESS_PORT_TOP \}\}/);
  assert.match(page, /businessEdgeGeometry/);
  assert.match(page, /deriveBusinessVisualEdges/);
  assert.match(businessGeometry, /BUSINESS_PORT_TOP \+\s*BUSINESS_PORT_HEIGHT \/ 2/);
  assert.match(businessGeometry, /sourceSize!\.width \+\s*\(sourceMinimized \? 0 : BUSINESS_PORT_DOT_OFFSET\)/);
  assert.match(page, /ACTIVE_BUSINESS_SCOPE_REF_ID/);
  assert.match(page, /key === "business-scope-reference"/);
  assert.match(page, /isBusinessScope &&\s*renderBusinessScopeLayer\(\)/);
  assert.match(page, /!isBusinessScope && visibleNodes\.map/);
  assert.match(page, /navigationStack\.length > 1/);
  assert.match(css, /\.business-node-ports i::before/);
  assert.match(css, /\.business-node-ports i\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(css, /\.business-node-ports i > span/);
  assert.match(css, /\.business-node-ports i\.input\s*\{\s*left:\s*8px/);
  assert.match(css, /\.business-node-ports i\.input::before\s*\{\s*left:\s*-21px/);
  assert.match(css, /\.business-node-ports i\.output\s*\{[\s\S]*right:\s*8px/);
  assert.match(css, /\.business-node-ports i\.output::before\s*\{[\s\S]*right:\s*-21px/);
  assert.match(
    css,
    /\.business-node > strong\s*\{[\s\S]*top:\s*42px;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/,
  );
  assert.match(
    css,
    /\.business-node > span:not\(\.resize-handle\)\s*\{[\s\S]*top:\s*14px;/,
  );
  assert.doesNotMatch(css, /\.business-node > span\s*\{/);
  assert.match(css, /\.business-node > small\s*\{[\s\S]*top:\s*70px;/);
  assert.match(css, /\.business-node\s*\{[\s\S]*display:\s*block;/);
  assert.match(
    page,
    /const moveBusinessNodeStart = \([\s\S]*?event\.stopPropagation\(\);[\s\S]*?if \(layoutLocked/,
  );
  assert.match(page, /key === "current-container"/);
  assert.doesNotMatch(page, /renderBusinessCanvas/);
  assert.match(css, /\.business-scope-reference-card/);
  assert.match(page, /<strong>业务输入<\/strong>/);
  assert.match(page, /<strong>业务输出<\/strong>/);
  assert.match(shell, /referenceContextLabels/);
  assert.match(shell, /document:\s*"文档快照"/);
  assert.match(shell, /scope:\s*"目标作用域"/);
  assert.match(shell, /selection:\s*"选中节点"/);
  assert.match(shell, /reference-context-heading/);
  assert.match(
    css,
    /\.runtime-node\[data-implementation="business-scope-reference"\] \.runtime-port-input\s*\{[\s\S]*width:\s*120px;[\s\S]*border-style:\s*dashed;/,
  );
  assert.match(
    css,
    /\.business-scope-reference-card\s*\{[\s\S]*padding:\s*14px 14px 14px 144px;/,
  );
  assert.match(css, /\.root-boundary\.business-scope-root/);
});

test("keeps node movement and automatic lanes inside the active root", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /bounds\.width - size\.width - 20/);
  assert.match(page, /bounds\.height - size\.height - 20/);
  assert.match(page, /interface: \[500, 950, 1400\]/);
  assert.match(page, /laneHeights\[lane\]\.indexOf/);
  assert.match(page, /height: Math\.max\(1500, maximumBottom\)/);
});

test("keeps scope changes visible and separates the reference from business content", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /cameraKeepsScopeVisible/);
  assert.match(page, /visibleWidth >= 96 && visibleHeight >= 96/);
  assert.match(page, /centerScopeAtScale\(1\)/);
  assert.match(page, /lastEnterAtRef\.current < 280/);
  assert.match(page, /className="scope-navigation-bar"/);
  assert.match(page, /FIT_VIEW_PADDING = 56/);
  assert.match(page, /scaledHeight > viewport\.clientHeight - FIT_VIEW_PADDING \* 2/);
  assert.match(page, /fitOnNextScopeRef\.current = true/);
  assert.match(page, /className="scope-path"/);
  assert.match(page, /scope-path-current/);
  assert.match(page, /className="scope-pipeline-trigger"/);
  assert.match(page, /className="scope-legend-popover"/);
  assert.doesNotMatch(page, /className="root-legend"/);
  assert.doesNotMatch(css, /\.root-legend/);
  assert.match(page, /scopeNode\.implementation\?\.key !== "current-container"/);
  assert.match(page, /const lodSummary = camera\.scale < 0\.55/);
  assert.match(css, /\.root-boundary\.scope-arrival/);
  assert.match(css, /\.business-node\.lod-summary/);
  assert.match(css, /\.business-node\s*\{[\s\S]*z-index:\s*2;/);
  assert.match(css, /\.business-container-interfaces\s*\{[\s\S]*z-index:\s*3;/);
  assert.match(css, /\.business-node:focus-visible:not\(\.selected\)/);
  assert.match(
    css,
    /\.runtime-mode-toggle\s*\{[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*bottom:\s*auto;/,
  );
  assert.match(
    css,
    /\.business-mode-toggle\s*\{[\s\S]*right:\s*8px;[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*bottom:\s*auto;/,
  );
  assert.match(page, /top:\s*worldSize\.height \+ 8/);
  assert.match(css, /\.everything-app\s*\{[\s\S]*height:\s*100dvh;[\s\S]*min-height:\s*0;/);
  assert.match(css, /\.business-scope-reference-card\s*\{[\s\S]*overflow:\s*hidden;/);
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
