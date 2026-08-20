import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
test("blank relation host does not import external Intent or Scene suites", async () => {
  const files = (await readdir(new URL("app/", root), { recursive: true })).filter((file) => /\.(?:ts|tsx)$/.test(file));
  for (const file of files) {
    const source = await readFile(new URL(`app/${file}`, root), "utf8");
    assert.doesNotMatch(source, /plugins\/(?:intent|scene)/, file);
  }
});
