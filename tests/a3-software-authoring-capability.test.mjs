import assert from "node:assert/strict";
import test from "node:test";

import { assertPipCapabilityDescriptor } from "../a3/core/pip-capabilities.ts";
import { createA3CustomNodeExtension } from "../a3/core/custom-nodes.ts";
import {
  descriptor,
  invoke,
} from "../a3/extensions/software-authoring/capability.mjs";
import { businessFlowScenario } from "../a3/extensions/software-authoring/custom-nodes.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

test("software authoring declares deterministic worker commands and inner node kinds", () => {
  assert.deepEqual(assertPipCapabilityDescriptor(descriptor), descriptor);
  assert.deepEqual(descriptor.commands, ["describe-project", "plan-specification", "validate-project"]);
  assert.deepEqual(descriptor.projectionKinds, ["software-specification/1"]);
});

test("software authoring worker describes only implemented authoring surfaces", async () => {
  assert.deepEqual(await invoke({ command: "describe-project", payload: {} }), {
    authoringKind: "software-project/1",
    customNodeKinds: descriptor.customNodeKinds,
    projectionKinds: ["software-specification/1"],
    surfaces: ["inner-intent", "projection-diagnostics"],
  });
});

test("software authoring validates structure without judging contradictory intent", async () => {
  const root = createSampleBusinessRoot();
  root.children[0].extension = createA3CustomNodeExtension(businessFlowScenario({
    scenario: "Perform A and not-A",
    outcome: "Keep the deliberate contradiction",
    constraints: ["A", "not-A"],
  }));
  assert.deepEqual(
    await invoke({ command: "validate-project", payload: { rootIntent: root } }),
    { diagnostics: [] },
  );

  root.children[0].extension.data.settings.outcome = "";
  const invalid = await invoke({ command: "validate-project", payload: { rootIntent: root } });
  assert.deepEqual(invalid.diagnostics.map(({ code }) => code), ["missing-outcome"]);
});

test("software authoring ignores foreign extensions and warns on unknown owned kinds", async () => {
  const root = createSampleBusinessRoot();
  root.children[0].extension = { namespace: "foreign.extension", schemaVersion: 1, data: null };
  root.children[1].extension = createA3CustomNodeExtension({
    kind: "future-software-intent/1",
    capability: "software-authoring/1",
    settings: {},
  });
  const result = await invoke({ command: "validate-project", payload: { rootIntent: root } });
  assert.deepEqual(result.diagnostics.map(({ level, code }) => [level, code]), [
    ["warning", "unsupported-custom-node"],
  ]);
});

test("capability descriptors reject undeclared or ambiguous worker commands", () => {
  assert.throws(() => assertPipCapabilityDescriptor({
    ...descriptor,
    commands: ["validate-project", "describe-project"],
  }), /Invalid pip-capability/);
  assert.throws(() => assertPipCapabilityDescriptor({
    ...descriptor,
    customNodeKinds: undefined,
  }), /Invalid pip-capability/);
});
