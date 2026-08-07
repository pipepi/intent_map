import assert from "node:assert/strict";
import test from "node:test";

import {
  businessConstraint,
  businessFlowScenario,
  createSoftwareAuthoringCustomNodeRegistry,
  softwareAuthoringExtension,
  softwareIntentGoal,
} from "../a3/extensions/software-authoring/custom-nodes.ts";

test("software authoring registers only inner intent goals, flows, and constraints", () => {
  const registry = createSoftwareAuthoringCustomNodeRegistry();
  assert.deepEqual(registry.list().map(({ kind }) => kind), [
    "business-constraint/1",
    "business-flow-scenario/1",
    "software-intent-goal/1",
  ]);
  assert.ok(registry.list().every(({ capability }) => capability === "software-authoring/1"));
});

test("software authoring accepts unconventional or contradictory business intent", () => {
  const registry = createSoftwareAuthoringCustomNodeRegistry();
  const flow = businessFlowScenario({
    scenario: "Settle before accepting the order",
    trigger: "The order does not exist yet",
    outcome: "Keep both accepted and rejected states for a deeper commercial goal",
    constraints: ["Never settle before acceptance", "Always settle before acceptance"],
  });
  assert.doesNotThrow(() => registry.validate(flow));
  assert.equal(softwareAuthoringExtension(flow).namespace, "intent-map.a3.custom-node");
});

test("software authoring constructors preserve goals without adding outer-tree fields", () => {
  const goal = softwareIntentGoal({ objective: "Understand the exchange", deepGoal: "Control complexity" });
  const constraint = businessConstraint({ statement: "A withdrawal requires review" });
  assert.deepEqual(Object.keys(goal.settings).sort(), ["deepGoal", "objective"]);
  assert.deepEqual(Object.keys(constraint.settings), ["statement"]);
  const serialized = JSON.stringify([goal, constraint]);
  for (const outerField of ["ui", "db", "api", "frontend", "backend", "code"]) {
    assert.equal(serialized.includes(`\"${outerField}\"`), false);
  }
});

test("software authoring validates shape rather than business correctness", () => {
  const registry = createSoftwareAuthoringCustomNodeRegistry();
  assert.throws(() => registry.validate({
    kind: "business-flow-scenario/1",
    capability: "software-authoring/1",
    settings: { scenario: "", outcome: "known" },
  }), /scenario must be non-empty text/);
  assert.throws(() => registry.validate({
    kind: "business-constraint/1",
    capability: "software-authoring/1",
    settings: { statement: "valid", rationale: "" },
  }), /rationale must be non-empty text/);
});
