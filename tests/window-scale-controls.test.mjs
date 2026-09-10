import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workspace and projection scale controls share the external window chrome", async () => {
  const [
    canvas,
    cameraControls,
    controls,
    projectionControls,
    window,
    css,
    windowCss,
    navbar,
    pluginNavbar,
    systemWindow,
    creatorWindow,
    creatorCss,
    preferences,
  ] = await Promise.all([
    read("pip-editor/relation-host/view/free-workspace-canvas.tsx"),
    read("pip-editor/relation-host/view/workspace-camera-controls.tsx"),
    read("pip-editor/relation-host/view/workspace-window-chrome.tsx"),
    read("pip-editor/relation-host/view/projection-scale-controls.tsx"),
    read("pip-editor/relation-host/view/workspace-window.tsx"),
    read("pip-editor/relation-host/view/relation-host.module.css"),
    read("pip-editor/relation-host/view/workspace-window.module.css"),
    read("pip-editor/relation-host/view/projection-navbar.tsx"),
    read("pip-editor-io/spot-terminal/elements/window-navigation.js"),
    read("pip-editor/relation-host/view/system-plugin-window.tsx"),
    read("pip-editor/relation-host/view/creator-window.tsx"),
    read("pip-editor/relation-host/view/creator-window.module.css"),
    read("pip-editor/relation-host-io/preferences/panel.tsx"),
  ]);

  assert.match(
    css,
    /\.cameraControls \{[^}]*position:absolute;[^}]*right:0;[^}]*bottom:0;/,
  );
  assert.match(canvas, /<WorkspaceCameraControls/);
  assert.match(cameraControls, /<WindowScaleControls/);
  assert.match(canvas, /<ProjectionScaleControls/);
  assert.match(canvas, /data-workspace-status/);
  assert.match(
    windowCss,
    /\.windowContent \[data-workspace-status\] \{[^}]*display: none;/,
  );
  assert.match(projectionControls, /subject="投影"/);
  assert.match(controls, /aria-label=\{`缩小\$\{subject\}`\}/);
  assert.match(controls, /aria-label=\{`放大\$\{subject\}`\}/);
  assert.match(controls, /aria-label=\{`适应\$\{subject\}`\}/);
  assert.match(controls, /canvasStyles\.cameraControls/);
  assert.match(
    controls,
    /createPortal\(controls\(\{[\s\S]*windowStyles\.windowCameraControls/,
  );
  assert.doesNotMatch(
    navbar,
    /semanticScale \* 100|重置投影缩放与位置/,
  );
  assert.doesNotMatch(pluginNavbar, /data-window-reset|chrome\.scale/);
  assert.match(window, /path\.find\([\s\S]*dataset\?\.nodeId[\s\S]*event\.currentTarget/);
  assert.match(window, /if \(!active\) onActivate\?\.\(\)/);
  assert.match(systemWindow, /<WindowContentScaleControls/);
  assert.match(creatorWindow, /<WindowContentScaleControls/);
  assert.match(controls, /contentScale: clampContentScale\(next\)/);
  assert.match(controls, /onFit=\{\(\) => setScale\(1\)\}/);
  assert.doesNotMatch(
    creatorCss,
    /\.creator \{[^}]*(?:box-shadow|border-radius|background:)/,
  );
  assert.ok(
    window.indexOf("styles.windowExtraControls")
      < window.indexOf("data-resize-toggle"),
  );
  assert.match(preferences, /const workspaceOpenModeGroup = useId\(\)/);
  assert.equal(
    preferences.match(/name=\{workspaceOpenModeGroup\}/g)?.length,
    2,
  );
});
