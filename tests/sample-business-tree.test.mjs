import assert from "node:assert/strict";
import test from "node:test";

import {
  businessTreeDepth,
  createSampleBusinessRoot,
} from "../app/runtime/sample-business-tree.ts";

test("keeps the v2 four-level sample business tree stable", () => {
  const root = createSampleBusinessRoot();
  const scenario = root.children.find((node) => node.id === "scenario_flow");
  const participants = scenario.children.find(
    (node) => node.id === "scenario_participants",
  );
  const actor = participants.children.find(
    (node) => node.id === "scenario_actor_leaf",
  );

  assert.equal(root.id, "business_root");
  assert.equal(businessTreeDepth(root), 4);
  assert.deepEqual(
    root.children.map((node) => node.id),
    ["scenario_flow", "ui_consensus", "database_schema", "business_api"],
  );
  assert.equal(actor.outputs[0].id, "actors");
  assert.deepEqual(root.outputs[0].mapping, {
    kind: "ref",
    nodeId: "business_api",
    portId: "api_contract",
  });
});
