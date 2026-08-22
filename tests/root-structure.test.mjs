import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const exists = (relative) => access(new URL(relative, root)).then(() => true, () => false);

test("root keeps mechanisms in owned directories instead of legacy buckets", async () => {
  for (const legacy of [
    "a3/", "loader-n/", "packages/", "pip-loader/", "pip-repo/",
    "pip-seed-cli/", "pip-seed-runtime/", "pip-seed-tauri/",
    ".openai/", ".review/", "build/", "db/", "drizzle/", "examples/",
    "app/chatgpt-auth.ts", "postcss.config.mjs", "vite.config.ts", "worker/",
    "public/file.svg", "public/globe.svg", "public/og.png", "public/window.svg",
  ]) {
    assert.equal(await exists(legacy), false, legacy);
  }
  assert.equal(await exists("pip-editor/pip/workspace/"), true);
  assert.equal(await exists("pip-editor/pip/bundle/"), true);
  for (const mechanism of ["cli/", "runtime/", "tauri/", "repo/system/", "loader/"]) {
    assert.equal(await exists(`pip-seed/${mechanism}`), true, mechanism);
  }
});
