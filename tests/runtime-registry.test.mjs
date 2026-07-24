import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("registers every built-in application implementation", async () => {
  const source = await readFile(new URL("app/runtime/registry.tsx", root), "utf8");
  const expected = [
    "application-root",
    "intent-document-loader",
    "application-state",
    "event-clock",
    "command-processor",
    "intent-executor",
    "global-toolbar",
    "intent-tree",
    "module-library",
    "validation",
    "breadcrumb",
    "scope-toolbar",
    "current-container",
    "canvas-status",
    "properties",
    "run-trace",
  ];

  expected.forEach((key) => assert.match(source, new RegExp(`"${key}"`)));
  assert.match(source, /Object\.freeze\(builtInRenderers\)/);
  assert.doesNotMatch(source, /eval\(|new Function|import\(key\)/);
});

test("provides one recursive shell for all node implementations", async () => {
  const source = await readFile(
    new URL("app/runtime/node-renderer.tsx", root),
    "utf8",
  );

  assert.match(source, /export function NodeRenderer/);
  assert.match(source, /runtime-node-titlebar/);
  assert.match(source, /runtime-minimized-titlebar/);
  assert.match(source, /scale < 0\.75/);
  assert.match(source, /lod === "always-live"/);
  assert.match(source, /layoutLocked/);
  assert.match(source, /runtime-port-input/);
  assert.match(source, /runtime-port-output/);
  assert.match(source, /simpleResizeDirections = \["e", "s", "se"\]/);
  assert.match(source, /visibleDirections\.map/);
  assert.match(source, /resize-mode-toggle runtime-mode-toggle/);
  assert.match(source, /resizeMode === "simple" \? "┘" : "⤢"/);
  assert.match(source, /nodeDisplayMode\(node\) === "minimized"/);
  assert.match(source, /onDisplayModeToggle/);
  assert.match(source, /data-display-mode/);
});
