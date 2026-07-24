import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_EVENTS_PER_TICK,
  createRuntimeEvent,
  processEventBatch,
} from "../app/runtime/pipeline.ts";

const state = {
  scopeId: "root",
  selectionId: "root",
  layoutLocked: false,
  documentRevision: 0,
  lastEventType: "",
};

test("applies state events atomically in one discrete tick", () => {
  const result = processEventBatch(
    [
      createRuntimeEvent("SELECT_NODE", "intent_tree", { nodeId: "child" }),
      createRuntimeEvent("NAVIGATE_SCOPE", "breadcrumb", { scopeId: "scope" }),
      createRuntimeEvent("SET_LAYOUT_LOCK", "global_toolbar", { locked: true }),
      createRuntimeEvent("DOCUMENT_CHANGED", "properties"),
    ],
    state,
    1,
  );

  assert.deepEqual(result.state, {
    scopeId: "scope",
    selectionId: "child",
    layoutLocked: true,
    documentRevision: 1,
    lastEventType: "DOCUMENT_CHANGED",
  });
  assert.equal(result.nextTick[0].type, "STATE_CHANGED");
  assert.equal(result.trace.every((entry) => entry.tick === 1), true);
});

test("turns UI events into deterministic commands", () => {
  const event = createRuntimeEvent("RUN_REQUEST", "global_toolbar");
  const result = processEventBatch([event], state, 7);

  assert.deepEqual(
    result.commands.map((command) => command.type),
    ["RUN_BUSINESS"],
  );
  assert.equal(result.commands[0].sourceEventId, event.id);
  assert.equal(result.trace[0].outcome, "command");
});

test("deduplicates event ids and guards each tick", () => {
  const event = createRuntimeEvent("SELECT_NODE", "intent_tree", {
    nodeId: "child",
  });
  const result = processEventBatch([event, event], state, 2);

  assert.equal(result.trace[1].outcome, "ignored");
  assert.throws(
    () =>
      processEventBatch(
        Array.from({ length: MAX_EVENTS_PER_TICK + 1 }, (_, index) => ({
          ...event,
          id: `event-${index}`,
        })),
        state,
        3,
      ),
    /超出安全上限/,
  );
});
