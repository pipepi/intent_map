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
  assert.doesNotMatch(panel, /独立工作区|onActivateWorkspace/);
});

test("free-layout canvas exposes creator wire, camera controls, and system manager window", async () => {
  const [canvas, manager, host] = await Promise.all([
    readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/view/plugin-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pip-editor/relation-host/relation-host.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(canvas, /event\.altKey/); assert.match(canvas, /creationWire/); assert.match(canvas, /screenToWorld/);
  assert.match(canvas, />适应</); assert.match(manager, /data-window-drag/); assert.match(manager, /data-resize-toggle/);
  assert.doesNotMatch(host, /panelCollapsed|layoutPanelCollapsed/);
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

test("workspace projection status names each selection scope instead of aggregating a misleading count", async () => {
  const canvas = await readFile(new URL("../pip-editor/relation-host/view/workspace-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /displayName\(node\.id\)} → \$\{scopedSelections\[node\.id\]\?\.map\(displayName\)/);
  assert.match(canvas, /descriptor\.label\?\.\(node, workspace\.graph\)/);
  assert.match(canvas, /workspace\.selection\.length} 个已选/);
  assert.doesNotMatch(canvas, /selectedCount|new Set\(\[workspace\.selection/);
});
