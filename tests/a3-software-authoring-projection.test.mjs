import assert from "node:assert/strict";
import test from "node:test";

import { applyA3ProjectionProposal } from "../a3/projection/projection-proposals.ts";
import { A3ProjectionWorkspaceSession } from "../a3/projection/projection-workspace.ts";
import { invoke } from "../a3/extensions/software-authoring/capability.mjs";
import {
  businessFlowScenario,
  softwareAuthoringExtension,
} from "../a3/extensions/software-authoring/custom-nodes.ts";
import { createWorkspaceResourceIndex } from "../a3/workspace/resource-index.ts";
import {
  MemoryWorkspaceResourceStore,
  WorkspaceResourceSession,
} from "../a3/workspace/resource-store.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

test("software authoring plans a small specification and the host materializes it", async () => {
  const root = createSampleBusinessRoot();
  const source = root.children[0];
  source.extension = softwareAuthoringExtension(businessFlowScenario({
    scenario: "Customer submits an order",
    trigger: "Cart is ready",
    outcome: "Order is accepted",
    constraints: ["Retry must be idempotent"],
  }));
  const proposal = await invoke({
    command: "plan-specification",
    payload: { node: source },
  });
  assert.equal(proposal.kind, "software-specification/1");
  assert.deepEqual(proposal.resources.map(({ path }) => path), ["docs/scenario_flow.md"]);
  const markdown = new TextDecoder().decode(proposal.resources[0].bytes);
  assert.match(markdown, /## Scenario[\s\S]*Customer submits an order/);
  assert.match(markdown, /## Constraints[\s\S]*Retry must be idempotent/);

  const store = new MemoryWorkspaceResourceStore();
  const resources = new WorkspaceResourceSession(await createWorkspaceResourceIndex([]), store);
  const workspace = new A3ProjectionWorkspaceSession(root, resources, {
    schemaVersion: 1,
    projections: [],
  });
  await applyA3ProjectionProposal({ proposal, root, workspace });
  assert.deepEqual(
    (await resources.read("docs/scenario_flow.md")).bytes,
    proposal.resources[0].bytes,
  );
});

test("software specification planning rejects unsafe destinations and malformed intent", async () => {
  const root = createSampleBusinessRoot();
  const source = root.children[0];
  source.extension = softwareAuthoringExtension(businessFlowScenario({
    scenario: "Submit",
    outcome: "Accepted",
  }));
  await assert.rejects(() => invoke({
    command: "plan-specification",
    payload: { node: source, resourcePath: "../outside.md" },
  }), /unsafe/);
  source.extension.data.settings.outcome = "";
  await assert.rejects(() => invoke({
    command: "plan-specification",
    payload: { node: source },
  }), /requires outcome/);
});
