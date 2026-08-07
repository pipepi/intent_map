import type { IntentNode } from "../../app/runtime/model.ts";
import { readA3CustomNodeExtension } from "../core/custom-nodes.ts";
import {
  A3_PROJECTION_INDEX_PATH,
  a3ProjectionSourceSha256,
  assertA3ProjectionIndex,
  type A3ProjectionEntry,
} from "./projection-index.ts";
import type { A3ProjectionWorkspaceSession } from "./projection-workspace.ts";
import {
  createWorkspaceResourceIndex,
  type WorkspaceResource,
} from "../workspace/resource-index.ts";

export const A3_PROJECTION_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type A3ProjectionProposal = {
  schemaVersion: typeof A3_PROJECTION_PROPOSAL_SCHEMA_VERSION;
  projectionId: string;
  kind: string;
  sourceNodeId: string;
  capability: string;
  resources: WorkspaceResource[];
};

const collectNodes = (root: IntentNode) => {
  const nodes = new Map<string, IntentNode>();
  const visit = (node: IntentNode) => {
    if (nodes.has(node.id)) throw new Error(`Duplicate intent node id: ${node.id}`);
    nodes.set(node.id, node);
    node.children?.forEach(visit);
  };
  visit(root);
  return nodes;
};

const assertProposal = async (
  proposal: A3ProjectionProposal,
  root: IntentNode,
): Promise<{ entry: A3ProjectionEntry; resources: WorkspaceResource[] }> => {
  if (proposal.schemaVersion !== A3_PROJECTION_PROPOSAL_SCHEMA_VERSION || !Array.isArray(proposal.resources)) {
    throw new Error("Invalid a3 projection proposal");
  }
  if (proposal.resources.some(({ path }) => path === A3_PROJECTION_INDEX_PATH)) {
    throw new Error("Projection providers cannot replace the a3 projection index");
  }
  const resourceIndex = await createWorkspaceResourceIndex(proposal.resources);
  const declaredPaths = proposal.resources.map(({ path }) => path);
  if (
    declaredPaths.length !== resourceIndex.resources.length
    || declaredPaths.some((path, index) => path !== resourceIndex.resources[index].path)
  ) {
    throw new Error("Projection proposal resources must be sorted and unique");
  }
  const source = collectNodes(root).get(proposal.sourceNodeId);
  if (!source) throw new Error(`Projection source does not exist: ${proposal.sourceNodeId}`);
  const customNode = readA3CustomNodeExtension(source.extension);
  if (!customNode) throw new Error(`Projection source is not an a3 custom node: ${proposal.sourceNodeId}`);
  if (customNode.capability !== proposal.capability) {
    throw new Error(`Projection capability does not match its source: ${proposal.capability}`);
  }
  const [entry] = assertA3ProjectionIndex({
    schemaVersion: 1,
    projections: [{
      projectionId: proposal.projectionId,
      kind: proposal.kind,
      sourceNodeId: proposal.sourceNodeId,
      sourceSha256: await a3ProjectionSourceSha256(source),
      capability: proposal.capability,
      materialization: "generated",
      resourcePaths: resourceIndex.resources.map(({ path }) => path),
    }],
  }).projections;
  return { entry, resources: proposal.resources.map((resource) => ({
    ...resource,
    bytes: resource.bytes.slice(),
  })) };
};

export const applyA3ProjectionProposal = async ({
  proposal,
  root,
  workspace,
  allowManualOverwrite = false,
}: {
  proposal: A3ProjectionProposal;
  root: IntentNode;
  workspace: A3ProjectionWorkspaceSession;
  allowManualOverwrite?: boolean;
}): Promise<{ projection: A3ProjectionEntry; orphanedResourcePaths: string[] }> => {
  const prepared = await assertProposal(proposal, root);
  const previous = workspace.projection(prepared.entry.projectionId);
  if (previous && previous.materialization !== "generated" && !allowManualOverwrite) {
    throw new Error(`${previous.projectionId} contains manual content and requires explicit confirmation`);
  }
  for (const candidate of workspace.list()) {
    if (candidate.projectionId === prepared.entry.projectionId) continue;
    const conflict = prepared.entry.resourcePaths.find((path) => candidate.resourcePaths.includes(path));
    if (conflict) throw new Error(`${conflict} is already owned by ${candidate.projectionId}`);
  }
  const orphanedResourcePaths = previous?.resourcePaths.filter((path) =>
    !prepared.entry.resourcePaths.includes(path)) ?? [];
  workspace.upsert(prepared.entry);
  for (const resource of prepared.resources) {
    await workspace.writeResource(prepared.entry.projectionId, resource, {
      attach: true,
      origin: "generated",
    });
  }
  return {
    projection: workspace.projection(prepared.entry.projectionId) as A3ProjectionEntry,
    orphanedResourcePaths,
  };
};
