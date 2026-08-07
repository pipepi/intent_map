import path from "node:path";

import { openA3ProjectionWorkspace } from "../a3/projection/projection-workspace.ts";
import { openNodeSplitWorkspace } from "../a3/workspace/node-directory-store.ts";
import { openWorkspaceResourceSession } from "../a3/workspace/resource-store.ts";
import { decodePip } from "../app/runtime/pip.ts";
import { loadIntentDocument } from "../app/runtime/model.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const [workspaceArgument] = process.argv.slice(2);
if (!workspaceArgument || workspaceArgument.startsWith("--")) {
  throw new Error(
    "Usage: npm run pip:projection:audit -- <workspace-directory> [PIP limit options]",
  );
}

const workspace = await openNodeSplitWorkspace(path.resolve(workspaceArgument));
const options = pipIoOptionsFromArgs(process.argv.slice(2));
const pip = await decodePip(await workspace.readIntentPip(), options);
const document = loadIntentDocument(JSON.parse(pip.rootTreeText));
const resources = openWorkspaceResourceSession(pip, workspace.resources);
const projections = await openA3ProjectionWorkspace(document.rootIntent, resources);
process.stdout.write(`${JSON.stringify({
  workspace: workspace.root,
  projections: projections.list(),
  diagnostics: await projections.audit(),
}, null, 2)}\n`);
