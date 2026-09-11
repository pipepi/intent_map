import { createGraph } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import test from "node:test";

import { createCorePipGraph } from "../pip-editor/pip/index.ts";

const identity = {
    node_id: "pip.core.identity",
    pip_id: "identity"
};

const type = {
  id: "type",
    fork_level: "pipe",
    predicate_value: { predicate: {
            node_id: "pip.core.type",
            pip_id: "identity"
        }, value: {
    kind: "ref",
    target: {
                node_id: "pip.core.predicate",
                pip_id: "identity"
            },
  } },
    pips: []
};

const coreNode = (id) => ({
  id,
    fork_level: "node",
    pips: [
    {
      id: "identity",
            fork_level: "pipe",
            predicate_value: { predicate: identity, value: { kind: "const", value: id } },
            pips: []
        },
    type,
  ]
});

test("createCorePipGraph creates and prints the canonical core graph", () => {
  const graph = createCorePipGraph();

  process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    assert.deepEqual(graph, createGraph({
        "pip.core.identity": coreNode("pip.core.identity"),
        "pip.core.predicate": coreNode("pip.core.predicate"),
        "pip.core.type": coreNode("pip.core.type"),
"pip.meta.revision": coreNode("pip.meta.revision"),
"pip.meta.root-node-ids": coreNode("pip.meta.root-node-ids"),
"pip.meta.workspace": coreNode("pip.meta.workspace"),
    }, 0));
});
