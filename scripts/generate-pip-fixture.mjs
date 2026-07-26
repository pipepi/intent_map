import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PIP_LOADER_SOURCE,
  encodePip,
} from "../app/runtime/pip.ts";

const output = path.resolve(import.meta.dirname, "../tests/fixtures/minimal-valid.pip");
const bytes = await encodePip({
  manifest: {
    packageId: "intent-map.test",
    name: "Intent Map Test",
    packageVersion: "0.1.0",
    rootNodeId: "application_root",
    loaderAbi: "pip-loader/1",
    requiredCapabilities: [],
    createdAt: "2026-07-26T00:00:00.000Z",
    contentType: "application/vnd.intent-map.pip",
  },
  loaderSource: DEFAULT_PIP_LOADER_SOURCE,
  rootTreeText: JSON.stringify({
    version: 2,
    rootIntent: { id: "application_root" },
  }),
  assets: [{
    path: "index.html",
    mime: "text/html; charset=utf-8",
    bytes: new TextEncoder().encode("<h1>PIP</h1>"),
  }],
});

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
process.stdout.write(`${output}\n`);
