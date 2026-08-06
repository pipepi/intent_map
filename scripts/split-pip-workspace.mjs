import { lstat, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { decodePip } from "../app/runtime/pip.ts";
import { NodeDirectoryResourceStore } from "../a3/workspace/node-directory-store.ts";
import { splitPipWorkspace } from "../a3/workspace/split-workspace.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument || inputArgument.startsWith("--") || outputArgument.startsWith("--")) {
  throw new Error(
    "Usage: npm run pip:workspace:split -- <bundle.pip> <new-workspace-directory> [PIP limit options]",
  );
}

const input = path.resolve(inputArgument);
const output = path.resolve(outputArgument);
const assertOutputMissing = async () => {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Workspace destination already exists: ${output}`);
};
await assertOutputMissing();
const parent = path.dirname(output);
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(path.join(parent, `.${path.basename(output)}.tmp-`));

try {
  const io = pipIoOptionsFromArgs(process.argv.slice(2));
  const pip = await decodePip(new Uint8Array(await readFile(input)), io);
  const split = await splitPipWorkspace(pip, io);
  const resourcesDirectory = path.join(temporary, "resources");
  await mkdir(resourcesDirectory);
  await writeFile(path.join(temporary, "intent.pip"), split.intentPip, { flag: "wx" });
  const store = new NodeDirectoryResourceStore(resourcesDirectory);
  for (const resource of split.resources) await store.write(resource);
  await assertOutputMissing();
  await rename(temporary, output);
  process.stdout.write(
    `${output}\nintent.pip · ${split.intentPip.byteLength} bytes\nresources/ · ${split.resources.length} files\n`,
  );
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
