import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url), directories = ["pip-editor", "pip-editor-io", "tests"];
const moduleDirectories = ["pip-editor", "pip-editor-io"];

async function authoredModules() {
  const modules = new Map();
  for (const directory of moduleDirectories) {
    const files = (await readdir(new URL(`${directory}/`, root), { recursive: true }))
      .filter((item) => /\.(?:js|mjs|ts|tsx)$/.test(item));
    for (const file of files) modules.set(`${directory}/${file}`, await readFile(new URL(`${directory}/${file}`, root), "utf8"));
  }
  return modules;
}

function resolveLocalImport(from, specifier, modules) {
  if (!specifier.startsWith(".")) return undefined;
  const parts = from.split("/");
  parts.pop();
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  const base = parts.join("/").replace(/\.(?:js|mjs|ts|tsx)$/, "");
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.js`]
    .find((candidate) => modules.has(candidate));
}
test("authored modules stay below 300 physical lines", async () => {
  for (const directory of directories) for (const path of (await readdir(new URL(`${directory}/`, root), { recursive: true })).filter((item) => /\.(?:js|mjs|ts|tsx|css)$/.test(item))) {
    const source = await readFile(new URL(`${directory}/${path}`, root), "utf8");
    const lines = source.split(/\r?\n/).length;
    assert.ok(lines <= 300, `${directory}/${path} has ${lines} lines`);
  }
});

test("projection host and external projection suites have no circular imports", async () => {
  const modules = await authoredModules(), edges = new Map();
  const inProjectionBoundary = (file) => file.startsWith("pip-editor/pip-host/projection/")
    || file.startsWith("pip-editor-io/pip-projections/") || file.startsWith("pip-editor-io/scene/");
  for (const [file, source] of modules) {
    const imports = [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)];
    edges.set(file, imports.map((match) => resolveLocalImport(file, match[1], modules)).filter(Boolean).filter(inProjectionBoundary));
  }
  const visiting = new Set(), visited = new Set(), path = [];
  const visit = (file) => {
    if (visiting.has(file)) assert.fail(`circular import: ${[...path.slice(path.indexOf(file)), file].join(" -> ")}`);
    if (visited.has(file)) return;
    visiting.add(file); path.push(file);
    for (const dependency of edges.get(file) ?? []) visit(dependency);
    path.pop(); visiting.delete(file); visited.add(file);
  };
  for (const file of modules.keys()) if (inProjectionBoundary(file)) visit(file);
});
