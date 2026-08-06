import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const sourceUnder = async (relative) => {
  const directory = new URL(relative, root);
  const files = (await readdir(directory, { recursive: true }))
    .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
  return Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(new URL(file, directory), "utf8"),
  })));
};

test("a2 editor sources do not import or start a3 capabilities", async () => {
  const sources = await sourceUnder("app/editor/");
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /(?:from|import\()\s*["'][^"']*\/a3\//, file);
    assert.doesNotMatch(source, /usePipCapabilitySession|PipCapabilityWorker/, file);
  }
});

test("a3 implementation lives outside the a2 app directory", async () => {
  const [core, host, extension] = await Promise.all([
    readFile(new URL("a3/core/pip-capabilities.ts", root), "utf8"),
    readFile(new URL("a3/host/use-pip-capability-session.ts", root), "utf8"),
    readFile(new URL("a3/extensions/software-authoring/capability.mjs", root), "utf8"),
  ]);
  assert.match(core, /PIP_CAPABILITY_ABI/);
  assert.match(host, /usePipCapabilitySession/);
  assert.match(extension, /software-authoring\/1/);
});
