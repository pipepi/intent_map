import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blank host imports only explicit PIP files and never auto-loads domain packages", async () => {
  const host = await readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../pip-editor/relation-host/view/plugin-panel.tsx", import.meta.url), "utf8");
  assert.match(host, /importPip\(bytes/);
  assert.match(panel, /accept="\.pip,application\/vnd\.intent-map\.pip"/);
  assert.doesNotMatch(host + panel, /\.zip|intent-node-collection/);
  assert.doesNotMatch(host, /buildIntentPluginSuite|buildScenePluginSuite|installSamples/);
});

test("desktop development loads authoritative A1 and A2 packages instead of stale dist copies", async () => {
  const launcher = await readFile(new URL("../scripts/run-pip-desktop.mjs", import.meta.url), "utf8");
  assert.match(launcher, /"--pip", systemPipFilePath\(release\.loader\)/);
  assert.match(launcher, /"--editor", systemPipFilePath\(release\.intentMap\)/);
  assert.doesNotMatch(launcher, /runtimeDirectory/);
});

test("the generic host records verified hashes without a trust prompt", async () => {
  const host = await readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8");
  assert.match(host, /confirmTrust: \(\) => true/);
  assert.doesNotMatch(host, /window\.confirm|confirmHostPackageTrust/);
});

test("plugin commands are serialized per workspace against the latest graph snapshot", async () => {
  const [host, actions] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/relation-host-actions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(host, /commandQueuesRef = useRef\(new Map<string, Promise<void>>\(\)\)/);
  assert.match(actions, /workspaceStore\s*\.list\(\)\s*\.find\(\(workspace\) => workspace\.id === workspaceId\)/);
  assert.match(actions, /previous\.catch\(\(\) => undefined\)\.then/);
  assert.doesNotMatch(actions, /command\(request\.input, active\.graph\)/);
});

test("the workspace remains a bounded two-axis trackpad scroll region", async () => {
  const css = await readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8");
  assert.match(css, /\.canvasWrap \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.canvas \{[^}]*overflow: auto;[^}]*touch-action: pan-x pan-y;/);
  assert.doesNotMatch(css, /\.canvas \{[^}]*touch-action: none;/);
});

test("independent workspaces switch through a Chrome-like tab strip", async () => {
  const tabs = await readFile(new URL("../pip-editor/relation-host/view/workspace-tabs.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../pip-editor/relation-host/view/plugin-panel.tsx", import.meta.url), "utf8");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab" aria-selected=\{active\}/);
  assert.match(tabs, /onActivate\(workspace\.id\)/);
  assert.match(tabs, /workspaceTabAdd/);
  assert.match(tabs, /onClose\(workspace\.id\)/);
  assert.match(tabs, /draggable/);
  assert.match(tabs, /event\.currentTarget\.blur\(\); onActivate/); assert.match(tabs, /event\.currentTarget\.blur\(\); onNew/);
  assert.doesNotMatch(panel, /独立工作区|onActivateWorkspace/);
});

test("free-layout canvas exposes creator wire, camera controls, and system manager window", async () => {
  const [canvas, manager, host] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/plugin-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(canvas, /event\.altKey/); assert.match(canvas, /event\.code === "Space"/); assert.match(canvas, /clientWidth \/ 2/); assert.match(canvas, /creationWire/); assert.match(canvas, /screenToWorld/);
  assert.match(canvas, /element\.scrollLeft = 0; element\.scrollTop = 0/);
  assert.match(canvas, /event\.currentTarget\.scrollLeft = 0; event\.currentTarget\.scrollTop = 0/);
  assert.match(canvas, /matches\("input,textarea,select,\[contenteditable=true\]"\)/); assert.match(canvas, /element\.focus\(\{ preventScroll: true \}\)/); assert.match(canvas, /tabIndex=\{-1\}/);
  assert.match(canvas, /addEventListener\("pageshow", focusCanvas\)/); assert.match(canvas, /addEventListener\("focus", focusCanvas\)/); assert.match(canvas, /setTimeout\(focusCanvas, 160\)/);
  assert.match(canvas, /element\.focus\(\{ preventScroll: true \}\);/);
  assert.match(canvas, />适应</); assert.match(manager, /data-window-drag/); assert.match(manager, /data-resize-toggle/);
  assert.match(canvas, /\["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"\]\.includes/);
  assert.doesNotMatch(host, /panelCollapsed|layoutPanelCollapsed/);
});

test("projection windows float system controls above the top-right content edge", async () => {
  const [window, navbar, css] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/view/workspace-window.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/projection-navbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(window, /systemControls\("top"\)[\s\S]*systemControls\("bottom"\)/);
  assert.match(window, /windowGlassUnderlay[^>]*aria-hidden="true"/);
  assert.match(window, /data-window-drag aria-label=[\s\S]*data-resize-toggle[\s\S]*data-window-close/);
  assert.doesNotMatch(window, /data-window-drag-button/);
  assert.match(window, /windowDragRailLeft[\s\S]*data-window-drag aria-label="左侧拖动区域"/);
  assert.match(window, /windowDragRailRight[\s\S]*data-window-drag aria-label="右侧拖动区域"/);
  assert.doesNotMatch(navbar, /data-window-drag|projectionWindowActions|projectionDragHandle/);
  assert.match(css, /\.windowSystemControls \{[^}]*position:absolute;[^}]*left:-18px;[^}]*right:-18px;[^}]*height:37px;/);
  assert.match(css, /\.windowSystemControls \{[^}]*border:0;/);
  assert.match(css, /\.windowGlassUnderlay \{[^}]*inset:-37px -18px;[^}]*radial-gradient\(ellipse at center,#10193678 42%,#17234208 100%\);[^}]*backdrop-filter:blur\(10px\)/);
  assert.match(css, /\.windowViewport \{[^}]*position:relative;[^}]*z-index:16;/);
  assert.match(css, /\.windowGlassUnderlay \{[^}]*z-index:14;/);
  assert.match(css, /\.windowSystemControlsTop \{[^}]*top:-37px;/);
  assert.match(css, /\.windowSystemControlsBottom \{[^}]*bottom:-37px;/);
  assert.match(css, /\.windowDragRail \{[^}]*z-index:15;[^}]*width:18px;/);
  assert.match(css, /\.windowDragRailLeft \{[^}]*left:-18px;/);
  assert.match(css, /\.windowDragRailRight \{[^}]*right:-18px;/);
  assert.match(css, /\.windowDragRail \{[^}]*background:transparent;/);
  assert.match(css, /\.freeWindow:hover \.windowGlassUnderlay,[^}]*visibility:visible;\s*opacity:1/);
  assert.match(css, /\.freeWindow:hover \.windowDragRail,[^}]*visibility:visible;\s*opacity:1/);
  assert.match(css, /@container \(max-width:500px\)[\s\S]*\.projectionNav > select \{[^}]*flex:0 1 120px;/);
  assert.match(css, /\.windowSystemControls \{[^}]*visibility:hidden;[^}]*opacity:0;[^}]*pointer-events:none;/);
  assert.match(css, /\.freeWindow:hover \.windowSystemControls,[^}]*\.freeWindow:focus-within \.windowSystemControls \{[^}]*visibility:visible;[^}]*pointer-events:auto;/);
  assert.match(css, /@media \(hover:none\)[^{]*\{[^}]*windowGlassUnderlay[^}]*visibility:visible;/);
  assert.match(css, /@media \(hover:none\)[\s\S]*\.windowSystemControls \{[^}]*visibility:visible;/);
});

test("trackpad movement and pinch route between workspace and active projection", async () => {
  const canvas = await readFile("pip-editor/relation-host/view/workspace-canvas.tsx", "utf8");
  const host = await readFile("pip-editor/relation-host/relation-host.tsx", "utf8");
  const window = await readFile("pip-editor/relation-host/view/workspace-window.tsx", "utf8");
  const semantic = await readFile("pip-editor/relation-host/projection/semantic-projection.tsx", "utf8");
  const hostStyles = await readFile("pip-editor/relation-host/view/relation-host.module.css", "utf8");
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
  const host = await readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../pip-editor/relation-host/view/plugin-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(host, /<header|styles\.header|styles\.addArea/);
  assert.match(panel, /aria-label="撤销"/);
  assert.match(panel, /aria-label="重做"/);
  assert.match(panel, /disabled=\{!canUndo\}/);
  assert.match(panel, /disabled=\{!canRedo\}/);
});

test("the graph status floats at the workspace bottom-left without shrinking the canvas", async () => {
  const css = await readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8");
  assert.match(css, /\.canvasInfo \{[^}]*position: absolute;[^}]*bottom: 0;[^}]*left: 0;[^}]*pointer-events: none;/);
  assert.match(css, /\.canvas \{[^}]*height: 100%;/);
  assert.doesNotMatch(css, /\.canvas \{[^}]*calc\(100% - 36px\)/);
});

test("workspace camera controls dock to the bottom-right outside the scaled world", async () => {
  const [css, canvas] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.cameraControls \{[^}]*position:absolute;[^}]*right:0;[^}]*bottom:0;/);
  assert.ok(canvas.indexOf("styles.freeWorld") < canvas.indexOf("styles.cameraControls"));
});

test("projection resize mode sits immediately before the projection close action", async () => {
  const [window, css] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/view/workspace-window.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8"),
  ]);
  const scene = await readFile(new URL("../pip-editor-io/scene/elements/render.js", import.meta.url), "utf8");
  assert.ok(window.indexOf("data-resize-toggle") < window.indexOf("data-window-close"));
  assert.match(window, /resizeMode === "simple" \? \["e", "s", "se"\] : directions/);
  assert.match(css, /width:6px;height:6px;border:1px solid #c5b7ff;border-radius:2px;background:#2d2460/);
  assert.match(css, /box-shadow:0 0 7px rgba\(139,92,246,\.48\)/);
  assert.match(css, /data-direction="nw"[^}]*top:3px;left:3px/);
  assert.match(css, /data-direction="ne"[^}]*top:3px;right:3px/);
  assert.match(css, /data-direction="se"[^}]*right:3px;bottom:3px/);
  assert.match(css, /data-direction="sw"[^}]*bottom:3px;left:3px/);
  assert.match(css, /\.freeWindow:hover \.resizeHandle::after,[^}]*visibility:visible;opacity:1/);
  assert.doesNotMatch(scene, /data-resize-toggle/);
});

test("A3 may own projection chrome while A2 retains a fallback navbar", async () => {
  const [contracts, canvas, semantic, css] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/contracts/package-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/projection/semantic-projection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/relation-host.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(contracts, /windowChrome\?:\s*"host"\s*\|\s*"plugin"/);
  assert.match(canvas, /windowChrome === "plugin"/);
  assert.match(canvas, /!pluginChrome && <ProjectionNavbar/);
  assert.match(canvas, /workspaceView=\{\{ \.\.\.normalized, projections: \{ \.\.\.normalized\.projections, \[node\.id\]: \{ \.\.\.frame, navigation \} \} \}\}/);
  assert.match(semantic, /RelationNodeRenderer[^>]*workspaceView=\{workspaceView\}/);
  assert.match(css, /\.projectionShell\.pluginChrome\s*\{[^}]*grid-template-rows:minmax\(0,1fr\)/);
});

test("workspace projection status names each selection scope instead of aggregating a misleading count", async () => {
  const canvas = await readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /displayName\(node\.id\)} → \$\{scopedSelections\[node\.id\]\?\.map\(displayName\)/);
  assert.match(canvas, /descriptor\.label\?\.\(node, workspace\.graph\)/);
  assert.match(canvas, /workspace\.selection\.length} 个已选/);
  assert.doesNotMatch(canvas, /selectedCount|new Set\(\[workspace\.selection/);
});
