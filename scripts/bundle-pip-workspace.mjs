import path from "node:path";

import { decodePip, pipFilename } from "../app/runtime/pip.ts";
import { streamNodeWorkspaceBundle } from "../a3/bundle/node-streaming-bundle.ts";
import { openNodeSplitWorkspace } from "../a3/workspace/node-directory-store.ts";
import { openWorkspaceResourceSession } from "../a3/workspace/resource-store.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const [workspaceArgument, outputArgument] = process.argv.slice(2);
if (!workspaceArgument || !outputArgument || workspaceArgument.startsWith("--") || outputArgument.startsWith("--")) {
  throw new Error(
    "Usage: npm run pip:workspace:bundle -- <workspace-directory> <new-versioned.pip> [PIP limit options]",
  );
}

const workspace = await openNodeSplitWorkspace(path.resolve(workspaceArgument));
const options = pipIoOptionsFromArgs(process.argv.slice(2));
const pip = await decodePip(await workspace.readIntentPip(), options);
const destination = path.resolve(outputArgument);
const expected = pipFilename(pip.manifest);
if (path.basename(destination) !== expected) {
  throw new Error(`Bundle filename must match intent.pip identity: ${expected}`);
}
const session = openWorkspaceResourceSession(pip, workspace.resources);
const result = await streamNodeWorkspaceBundle({
  pip,
  session,
  store: workspace.resources,
  destination,
  options,
});
process.stdout.write(`${result.path}\n${result.byteLength} bytes\n${session.list().length} resources\n`);
