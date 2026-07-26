import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodePip } from "../app/runtime/pip.ts";

const input = process.argv[2] ?? "dist/pip/intent-map.pip";
const pip = await decodePip(new Uint8Array(await readFile(path.resolve(input))));
process.stdout.write(
  `valid PIP\n${pip.manifest.name}\n${pip.manifest.rootNodeId}\n${pip.assets.length} assets\n`,
);
