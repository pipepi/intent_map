import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const systemPluginRoot = path.join(
  workspaceRoot,
  "pip-editor/pip-host-io",
);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test("system plugin source files stay below the readability boundary", async () => {
  const files = await sourceFiles(systemPluginRoot);
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const lines = source.split("\n").length;
    assert.ok(
      lines <= 300,
      `${path.relative(workspaceRoot, file)} has ${lines} physical lines`,
    );
  }
});

test("canvas and workspace state contain no concrete system plugin special case", async () => {
  const files = [
    "pip-editor/pip-host/view/workspace-canvas.tsx",
    "pip-editor/pip-host/view/workspace-canvas-model.ts",
    "pip-editor/pip-host/view/free-workspace-canvas.tsx",
    "pip-editor/pip-host/view/legacy-workspace-canvas.tsx",
    "pip-editor/pip-host/workspace/workspace-store.ts",
    "pip-editor/pip-host/workspace/view-state.ts",
  ];
  const source = (await Promise.all(files.map((file) =>
    readFile(path.join(workspaceRoot, file), "utf8")
  ))).join("\n");

  assert.doesNotMatch(source, /host\.plugin-manager/);
  assert.doesNotMatch(source, /openPluginManager|pluginManager=/);
  assert.doesNotMatch(source, /pip-host-io/);
});

test("system plugin implementation never imports the PipHost component", async () => {
  const files = await sourceFiles(systemPluginRoot);
  const source = (await Promise.all(files.map((file) =>
    readFile(file, "utf8")
  ))).join("\n");
  assert.doesNotMatch(source, /pip-host\.tsx/);
});
