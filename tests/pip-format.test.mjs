import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  decodePip,
  encodePip,
} from "../app/runtime/pip.ts";

const manifest = {
  packageId: "intent-map.test",
  name: "Intent Map Test",
  packageVersion: "0.1.0",
  rootNodeId: "application_root",
  loaderAbi: "pip-loader/1",
  requiredCapabilities: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  contentType: "application/vnd.intent-map.pip",
};

const rootTreeText = JSON.stringify({
  version: 2,
  rootIntent: { id: "application_root" },
});

test("PIP v1 encodes deterministically and round-trips", async () => {
  const input = {
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText,
    assets: [
      { path: "index.html", mime: "text/html; charset=utf-8", bytes: new TextEncoder().encode("<h1>PIP</h1>") },
    ],
  };
  const first = await encodePip(input);
  const second = await encodePip(input);
  assert.deepEqual(first, second);
  assert.deepEqual(await decodePip(first), input);
});

test("PIP v1 rejects corruption, truncation, and overlapping sections", async () => {
  const bytes = await encodePip({
    manifest,
    loaderSource: DEFAULT_PIP_LOADER_SOURCE,
    rootTreeText,
    assets: [],
  });

  const corrupted = bytes.slice();
  corrupted[corrupted.length - 1] ^= 0xff;
  await assert.rejects(() => decodePip(corrupted), /hash mismatch/);

  await assert.rejects(() => decodePip(bytes.slice(0, 40)), /truncated/);

  const overlapping = bytes.slice();
  const view = new DataView(overlapping.buffer);
  view.setBigUint64(16 + 48, view.getBigUint64(16, true), true);
  await assert.rejects(() => decodePip(overlapping), /overlap/);

  const oversized = bytes.slice();
  new DataView(oversized.buffer).setBigUint64(24, BigInt(64 * 1024 * 1024 + 1), true);
  await assert.rejects(() => decodePip(oversized), /size limit/);
});
