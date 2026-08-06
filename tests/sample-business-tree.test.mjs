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
    [
      "scenario_flow",
      "scenario_constraints",
      "decision_boundaries",
      "success_outcomes",
    ],
  );
  assert.equal(actor.outputs[0].id, "actors");
  assert.deepEqual(root.outputs[0].binding, {
    kind: "ref",
    nodeId: "success_outcomes",
    portId: "intent_contract",
  });
  assert.doesNotMatch(
    JSON.stringify(root),
    /UI Demo|数据库|API|前端|后端|代码生成/,
  );
});
