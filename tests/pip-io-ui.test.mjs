import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWorkspaceCanvasSources = async () => (await Promise.all([
  "workspace-canvas.tsx",
  "workspace-canvas-model.ts",
  "free-workspace-canvas.tsx",
  "legacy-workspace-canvas.tsx",
  "workspace-canvas-pointer.ts",
  "workspace-canvas-wheel.ts",
  "creator-window.tsx",
  "projection-scale-controls.tsx",
  "workspace-window-chrome.tsx",
].map((file) => readFile(
  new URL(`../pip-editor/pip-host/view/${file}`, import.meta.url),
  "utf8",
)))).join("\n");

const readHostSources = async () => (await Promise.all([
  "pip-host.tsx",
  "use-host-effects.ts",
].map((file) => readFile(
  new URL(`../pip-editor/pip-host/${file}`, import.meta.url),
  "utf8",
)))).join("\n");

const readWindowStyles = async () => (await Promise.all([
  "pip-host.module.css",
  "workspace-window.module.css",
].map((file) => readFile(
  new URL(`../pip-editor/pip-host/view/${file}`, import.meta.url),
  "utf8",
)))).join("\n");

test("blank host imports only explicit PIP files and never auto-loads domain packages", async () => {
  const host = await readHostSources();
  const panel = await readFile(new URL("../pip-editor/pip-host-io/plugin-manager/panel.tsx", import.meta.url), "utf8");
  assert.match(host, /importPip\(bytes/);
  assert.match(panel, /accept="\.pip,application\/vnd\.intent-map\.pip"/);
  assert.doesNotMatch(host + panel, /\.zip|intent-node-collection/);
  assert.doesNotMatch(host, /buildIntentPluginSuite|buildScenePluginSuite|installSamples/);
});

test("desktop development loads authoritative A1 and A2 packages instead of stale dist copies", async () => {
  const launcher = await readFile(new URL("../scripts/run-pip-desktop.mjs", import.meta.url), "utf8");
  assert.match(launcher, /"--pip", systemPipFilePath\(release\.loader\)/);
  assert.match(launcher, /"--editor", systemPipFilePath\(release\.pipIntent\)/);
  assert.doesNotMatch(launcher, /runtimeDirectory/);
});

test("the generic host records verified hashes without a trust prompt", async () => {
  const host = await readHostSources();
  assert.match(host, /confirmTrust: \(\) => true/);
  assert.doesNotMatch(host, /window\.confirm|confirmHostPackageTrust/);
});

test("plugin commands are serialized per workspace against the latest graph snapshot", async () => {
  const [host, actions] = await Promise.all([
    readHostSources(),
    readFile(new URL("../pip-editor/pip-host/pip-host-actions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(host, /commandQueues[^\n]*useState[\s\S]*new Map<string, Promise<void>>/);
  assert.match(actions, /workspaceStore\s*\.list\(\)\s*\.find\(\(workspace\) => workspace\.id === workspaceId\)/);
  assert.match(actions, /previous\.catch\(\(\) => undefined\)\.then/);
  assert.doesNotMatch(actions, /command\(request\.input, active\.graph\)/);
});

test("the workspace remains a bounded two-axis trackpad scroll region", async () => {
  const css = await readFile(new URL("../pip-editor/pip-host/view/pip-host.module.css", import.meta.url), "utf8");
  assert.match(css, /\.canvasWrap \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.canvas \{[^}]*overflow: auto;[^}]*touch-action: pan-x pan-y;/);
  assert.doesNotMatch(css, /\.canvas \{[^}]*touch-action: none;/);
});

test("independent workspaces switch through a Chrome-like tab strip", async () => {
  const [tabs, panel, host] = await Promise.all([
    readFile(
      new URL(
        "../pip-editor/pip-host/view/workspace-tabs.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../pip-editor/pip-host-io/plugin-manager/panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readHostSources(),
  ]);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"[\s\S]*aria-selected=\{active\}/);
  assert.match(tabs, /onActivate\(workspace\.id\)/);
  assert.match(tabs, /workspaceTabAdd/);
  assert.match(tabs, /onClose\(workspace\.id\)/);
  assert.match(tabs, /draggable/);
  assert.match(tabs, /event\.currentTarget\.blur\(\);[\s\S]*onActivate/);
  assert.match(tabs, /event\.currentTarget\.blur\(\);[\s\S]*onNew/);
  assert.match(
    host,
    /presentWorkspace\(id, point, "top-left", viewport\)/,
  );
  assert.doesNotMatch(panel, /独立工作区|onActivateWorkspace/);
});

test("blank host canvas does not reserve an empty tab strip", async () => {
  const [surface, css] = await Promise.all([
    readFile(
      new URL(
        "../pip-editor/pip-host/view/pip-host-surface.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../pip-editor/pip-host/view/pip-host.module.css",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    surface,
    /tabWorkspaces\.length > 0 && <WorkspaceTabs/,
  );
  assert.match(
    surface,
    /tabWorkspaces\.length \? "" : styles\.workspaceAreaBare/,
  );
  assert.match(
    css,
    /\.workspaceAreaBare \{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);/,
  );
});

test("a workspace window owns its creator keyboard shortcut", async () => {
  const [workspaceCanvas, hostCanvas] = await Promise.all([
    readWorkspaceCanvasSources(),
    readFile(
      new URL(
        "../pip-editor/pip-host/view/host-canvas.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(workspaceCanvas, /data-canvas-shortcuts/);
  assert.match(workspaceCanvas, /event\.stopPropagation\(\)/);
  assert.match(hostCanvas, /target\.closest\("\[data-canvas-shortcuts\]"\)/);
  assert.match(hostCanvas, /owner !== event\.currentTarget/);
  assert.match(
    hostCanvas,
    /canvasOwner !== event\.currentTarget[\s\S]*dataset\?\.nodeId/,
  );
  assert.match(
    workspaceCanvas,
    /if \(windowId && !frame\) return;[\s\S]*event\.preventDefault\(\)/,
  );
});

test("free-layout canvas exposes creator wire, camera controls, and system manager window", async () => {
  const [canvas, manager, host] = await Promise.all([
    readWorkspaceCanvasSources(),
    readFile(new URL("../pip-editor/pip-host-io/plugin-manager/panel.tsx", import.meta.url), "utf8"),
    readHostSources(),
  ]);
  assert.match(canvas, /event\.altKey/); assert.match(canvas, /event\.code === "Space"/); assert.match(canvas, /clientWidth \/ 2/); assert.match(canvas, /creationWire/); assert.match(canvas, /screenToWorld/);
  assert.match(canvas, /element\.scrollLeft = 0;\s*element\.scrollTop = 0/);
  assert.match(canvas, /event\.currentTarget\.scrollLeft = 0;\s*event\.currentTarget\.scrollTop = 0/);
  assert.match(canvas, /matches\("input,textarea,select,\[contenteditable=true\]"\)/); assert.match(canvas, /element\.focus\(\{ preventScroll: true \}\)/); assert.match(canvas, /tabIndex=\{-1\}/);
  assert.match(canvas, /element\?\.addEventListener\("keydown", handleKeyDown\)/);
  assert.doesNotMatch(canvas, /addEventListener\("pageshow", focusCanvas\)/);
  assert.match(canvas, /element\.focus\(\{ preventScroll: true \}\);/);
  assert.match(canvas, />适应</); assert.match(manager, /data-window-drag/); assert.doesNotMatch(manager, /data-resize-toggle|data-window-close/);
  assert.match(canvas, /\["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"\]\.includes/);
  assert.doesNotMatch(host, /panelCollapsed|layoutPanelCollapsed/);
});

test("projection windows float system controls above the top-right content edge", async () => {
  const [window, navbar, css] = await Promise.all([
    readFile(new URL("../pip-editor/pip-host/view/workspace-window.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/pip-host/view/projection-navbar.tsx", import.meta.url), "utf8"),
    readWindowStyles(),
  ]);
  assert.match(window, /windowControls\("top"\)[\s\S]*windowControls\("bottom"\)/);
  assert.match(window, /windowGlassUnderlay[^>]*aria-hidden="true"/);
  assert.match(window, /data-window-drag[\s\S]*aria-label=[\s\S]*data-resize-toggle[\s\S]*data-window-close/);
  assert.doesNotMatch(window, /data-window-drag-button/);
  assert.match(window, /windowDragRailLeft[\s\S]*data-window-drag[\s\S]*aria-label="左侧拖动区域"/);
  assert.match(window, /windowDragRailRight[\s\S]*data-window-drag[\s\S]*aria-label="右侧拖动区域"/);
  assert.doesNotMatch(navbar, /data-window-drag|projectionWindowActions|projectionDragHandle/);
  assert.match(css, /\.windowSystemControls \{[^}]*position:\s*absolute;[^}]*left:\s*-18px;[^}]*right:\s*-18px;[^}]*height:\s*37px;/);
  assert.match(css, /\.windowSystemControls \{[^}]*border:\s*0;/);
  assert.match(css, /\.windowGlassUnderlay \{[^}]*inset:\s*-37px -18px;[^}]*radial-gradient\([\s\S]*#10193678 42%,[\s\S]*#17234208 100%[\s\S]*backdrop-filter:\s*blur\(10px\)/);
  assert.match(css, /\.windowViewport \{[^}]*position:\s*relative;[^}]*z-index:\s*16;/);
  assert.match(css, /\.windowGlassUnderlay \{[^}]*z-index:\s*14;/);
  assert.match(css, /\.windowSystemControlsTop \{[^}]*top:\s*-37px;/);
  assert.match(css, /\.windowSystemControlsBottom \{[^}]*bottom:\s*-37px;/);
  assert.match(css, /\.windowDragRail \{[^}]*z-index:\s*15;[^}]*width:\s*18px;/);
  assert.match(css, /\.windowDragRailLeft \{[^}]*left:\s*-18px;/);
  assert.match(css, /\.windowDragRailRight \{[^}]*right:\s*-18px;/);
  assert.match(css, /\.windowDragRail \{[^}]*background:\s*transparent;/);
  assert.match(css, /\.freeWindow:hover \.windowGlassUnderlay,[\s\S]*visibility:\s*visible;\s*opacity:\s*1/);
  assert.match(css, /\.freeWindow:hover \.windowDragRail,[\s\S]*visibility:\s*visible;\s*opacity:\s*1/);
  assert.match(css, /@container \(max-width:500px\)[\s\S]*\.projectionNav > select \{[^}]*flex:0 1 120px;/);
  assert.match(css, /\.windowSystemControls \{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/);
  assert.match(css, /\.freeWindow:hover \.windowSystemControls,[\s\S]*\.freeWindow:focus-within \.windowSystemControls \{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/);
  assert.match(css, /@media \(hover:\s*none\)[\s\S]*windowGlassUnderlay[\s\S]*visibility:\s*visible;/);
  assert.match(css, /@media \(hover:\s*none\)[\s\S]*\.windowSystemControls \{[^}]*visibility:\s*visible;/);
});

test("trackpad movement and pinch route between workspace and active projection", async () => {
  const canvas = await readWorkspaceCanvasSources();
  const host = await readHostSources();
  const window = await readFile("pip-editor/pip-host/view/workspace-window.tsx", "utf8");
  const semantic = await readFile("pip-editor/pip-host/projection/semantic-projection.tsx", "utf8");
  const hostStyles = await readWindowStyles();
  const scene = await readFile("pip-editor-io/scene/elements/view-element.js", "utf8");
  assert.match(canvas, /addEventListener\("wheel", handle, \{ passive: false \}\)/);
  assert.match(host, /preventPageZoom/);
  assert.match(canvas, /views\.activeWindowId === windowId/);
  assert.match(canvas, /panWindowContent\(frame/);
  assert.match(canvas, /activeWindowId: windowId \? normalized\.activeWindowId : undefined/);
  assert.match(canvas, /onViewsChange\(\{ \.\.\.views, activeWindowId: undefined \}\)/);
  assert.match(canvas, /semanticScale/); assert.match(canvas, /applySemanticScale/);
  assert.match(canvas, /semanticGestures = useRef\(new Map/); assert.match(canvas, /gesture\.scale \* Math\.exp/); assert.match(canvas, /gesture\.switched = next\.index !== navigation\.index/);
  assert.match(window, /preview\.contentScale \?\? 1/); // Legacy non-semantic projections retain their old scale.
  assert.match(semantic, /--projection-origin-x/); assert.match(semantic, /--projection-origin-y/);
  assert.match(semantic, /forwardFlip \? 1\.4 : \.75/);
  assert.match(semantic, /projectionForInstance\(node, nodeTypes\.projections\(\)\)\?\.zoomViewport/);
  assert.match(semantic, /clipPath: target && transition/);
  assert.match(hostStyles, /\.semanticViewport[^}]*overflow:clip[^}]*contain:paint/);
  assert.doesNotMatch(canvas, /scene\.update-camera|xZoom/);
  assert.doesNotMatch(scene, /addEventListener\("wheel"|pendingZoom/);
});

test("undo and redo live in the plugin panel without a global header", async () => {
  const host = await readFile(new URL("../pip-editor/pip-host/pip-host.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../pip-editor/pip-host-io/plugin-manager/panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(host, /<header|styles\.header|styles\.addArea/);
  assert.match(panel, /aria-label="撤销"/);
  assert.match(panel, /aria-label="重做"/);
  assert.match(panel, /disabled=\{!canUndo\}/);
  assert.match(panel, /disabled=\{!canRedo\}/);
});

test("the graph status floats at the workspace bottom-left without shrinking the canvas", async () => {
  const css = await readFile(new URL("../pip-editor/pip-host/view/pip-host.module.css", import.meta.url), "utf8");
  assert.match(css, /\.canvasInfo \{[^}]*position: absolute;[^}]*bottom: 0;[^}]*left: 0;[^}]*pointer-events: none;/);
  assert.match(css, /\.canvas \{[^}]*height: 100%;/);
  assert.doesNotMatch(css, /\.canvas \{[^}]*calc\(100% - 36px\)/);
});

test("projection resize mode sits immediately before the projection close action", async () => {
  const [window, css] = await Promise.all([
    readFile(new URL("../pip-editor/pip-host/view/workspace-window.tsx", import.meta.url), "utf8"),
    readWindowStyles(),
  ]);
  const scene = await readFile(new URL("../pip-editor-io/scene/elements/render.js", import.meta.url), "utf8");
  assert.ok(window.indexOf("data-resize-toggle") < window.indexOf("data-window-close"));
  assert.match(window, /resizeMode === "simple"[\s\S]*\?[\s\S]*\["e", "s", "se"\] as const[\s\S]*:[\s\S]*directions/);
  assert.match(css, /width:\s*6px;[\s\S]*height:\s*6px;[\s\S]*border:\s*1px solid #c5b7ff;[\s\S]*border-radius:\s*2px;[\s\S]*background:\s*#2d2460/);
  assert.match(css, /box-shadow:\s*0 0 7px rgba\(139, 92, 246, \.48\)/);
  assert.match(css, /data-direction="nw"[^}]*top:\s*3px;\s*left:\s*3px/);
  assert.match(css, /data-direction="ne"[^}]*top:\s*3px;\s*right:\s*3px/);
  assert.match(css, /data-direction="se"[^}]*right:\s*3px;\s*bottom:\s*3px/);
  assert.match(css, /data-direction="sw"[^}]*bottom:\s*3px;\s*left:\s*3px/);
  assert.match(css, /\.freeWindow:hover \.resizeHandle::after,[\s\S]*visibility:\s*visible;\s*opacity:\s*1/);
  assert.doesNotMatch(scene, /data-resize-toggle/);
});

test("A3 may own projection chrome while A2 retains a fallback navbar", async () => {
  const [contracts, canvas, semantic, css] = await Promise.all([
    readFile(new URL("../pip-editor/pip-host/contracts/package-types.ts", import.meta.url), "utf8"),
    readWorkspaceCanvasSources(),
    readFile(new URL("../pip-editor/pip-host/projection/semantic-projection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/pip-host/view/pip-host.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(contracts, /windowChrome\?:\s*"host"\s*\|\s*"plugin"/);
  assert.match(canvas, /windowChrome === "plugin"/);
  assert.match(canvas, /!pluginChrome && <ProjectionNavbar/);
  assert.match(canvas, /workspaceView=\{\{[\s\S]*\.\.\.normalized,[\s\S]*projections:[\s\S]*\.\.\.normalized\.projections,[\s\S]*\[node\.id\]: \{ \.\.\.frame, navigation \}/);
  assert.match(semantic, /PipNodeRenderer[^>]*workspaceView=\{workspaceView\}/);
  assert.match(css, /\.projectionShell\.pluginChrome\s*\{[^}]*grid-template-rows:minmax\(0,1fr\)/);
});

test("workspace projection status names each selection scope instead of aggregating a misleading count", async () => {
  const canvas = await readWorkspaceCanvasSources();
  assert.match(canvas, /displayName\(nodeId\)} → \$\{\s*selections\[nodeId\]\?\.map\(displayName\)/);
  assert.match(canvas, /descriptor\.label\?\.\(node, workspace\.graph\)/);
  assert.match(canvas, /workspace\.selection\.length} 个已选/);
  assert.doesNotMatch(canvas, /selectedCount|new Set\(\[workspace\.selection/);
});
