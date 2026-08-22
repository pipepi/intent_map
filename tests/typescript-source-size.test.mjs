import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const excluded = new Set([".git", ".next", "node_modules", "dist", "build", "target"]);

async function sourceFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    // Self-hosting tests create temporary source mirrors at the repository root.
    // They represent packaged historical input, not maintained handwritten source.
    if (excluded.has(entry.name) || entry.name.startsWith(".pip-")) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(url));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(url);
  }
  return files;
}

test("handwritten TypeScript files stay at or below 300 lines", async () => {
  const oversized = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    const lines = source.endsWith("\n") ? source.split(/\r?\n/).length - 1 : source.split(/\r?\n/).length;
    if (lines > 300) oversized.push(`${path.relative(new URL(".", root).pathname, file.pathname)}:${lines}`);
  }
  assert.deepEqual(oversized, []);
});
