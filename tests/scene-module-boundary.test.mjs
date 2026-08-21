import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
test("authored Scene projection modules stay below 300 lines", async () => {
  const files = (await readdir(new URL("plugins/scene/", root), { recursive: true }))
    .filter((path) => /\.(?:js|ts|css)$/.test(path));
  for (const path of files) {
    const source = await readFile(new URL(`plugins/scene/${path}`, root), "utf8");
    const lines = source.split(/\r?\n/).length;
    assert.ok(lines <= 300, `${path} has ${lines} lines`);
  }
});
