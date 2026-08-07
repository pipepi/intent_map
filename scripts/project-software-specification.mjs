import path from "node:path";

import { invoke } from "../a3/extensions/software-authoring/capability.mjs";
import { applyA3ProjectionProposal } from "../a3/projection/projection-proposals.ts";
import { openA3ProjectionWorkspace } from "../a3/projection/projection-workspace.ts";
import { openNodeSplitWorkspace } from "../a3/workspace/node-directory-store.ts";
import { openWorkspaceResourceSession } from "../a3/workspace/resource-store.ts";
import { saveSplitWorkspaceIntent } from "../a3/workspace/split-workspace.ts";
import { decodePip } from "../app/runtime/pip.ts";
import { loadIntentDocument } from "../app/runtime/model.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const [workspaceArgument, nodeId] = process.argv.slice(2);
if (
  !workspaceArgument
  || !nodeId
  || workspaceArgument.startsWith("--")
  || nodeId.startsWith("--")
) {
  throw new Error(
    "Usage: npm run pip:software:spec -- <workspace-directory> <node-id> [--allow-manual-overwrite] [PIP limit options]",
  );
}

const findNode = (node, targetId) => {
  if (node.id === targetId) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, targetId);
    if (match) return match;
  }
};

const workspace = await openNodeSplitWorkspace(path.resolve(workspaceArgument));
const options = pipIoOptionsFromArgs(process.argv.slice(2));
const pip = await decodePip(await workspace.readIntentPip(), options);
const document = loadIntentDocument(JSON.parse(pip.rootTreeText));
const node = findNode(document.rootIntent, nodeId);
if (!node) throw new Error(`Intent node does not exist: ${nodeId}`);
const proposal = await invoke({ command: "plan-specification", payload: { node } });
const resources = openWorkspaceResourceSession(pip, workspace.resources);
const projections = await openA3ProjectionWorkspace(document.rootIntent, resources);
const result = await applyA3ProjectionProposal({
  proposal,
  root: document.rootIntent,
  workspace: projections,
  allowManualOverwrite: process.argv.includes("--allow-manual-overwrite"),
});
await projections.save();
await workspace.writeIntentPip(await saveSplitWorkspaceIntent(pip, resources.index, options));
process.stdout.write(`${JSON.stringify({
  workspace: workspace.root,
  projection: result.projection,
  orphanedResourcePaths: result.orphanedResourcePaths,
}, null, 2)}\n`);
