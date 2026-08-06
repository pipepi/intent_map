import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("editor exposes all PIP I/O policy fields and persists them through package I/O", async () => {
  const [surface, session, documentIo] = await Promise.all([
    source("app/editor/node-surfaces.tsx"),
    source("app/editor/use-document-session.ts"),
    source("app/editor/document-io.ts"),
  ]);

  for (const field of [
    "maxPipBytes",
    "maxSingleResourceBytes",
    "maxExpandedBytes",
    "maxResourceCount",
    "maxCompressionRatio",
  ]) {
    assert.match(surface, new RegExp(`\\["${field}"`));
  }
  assert.match(surface, /setPipIoPolicy\(\{ \.\.\.pipIoPolicy, \[field\]: limit \}\)/);
  assert.match(session, /useState<PipIoPolicy>\(ASK_PIP_IO_POLICY\)/);
  assert.match(documentIo, /ioPolicy: pipIoPolicy/);
  assert.match(documentIo, /setPipIoPolicy\(pip\.manifest\.ioPolicy\)/);
});
