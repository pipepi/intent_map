import assert from "node:assert/strict";
import test from "node:test";

import { createCoreRelationGraph } from "../pip-editor/relation/index.ts";

const identity = {
  nodeId: "relation.core.identity",
  relationId: "identity",
};

const type = {
  id: "type",
  predicate: {
    nodeId: "relation.core.type",
    relationId: "identity",
  },
  object: {
    kind: "ref",
    target: {
      nodeId: "relation.core.predicate",
      relationId: "identity",
    },
  },
  relations: [],
};

const coreNode = (id) => ({
  id,
  relations: [
    {
      id: "identity",
      predicate: identity,
      object: { kind: "const", value: id },
      relations: [],
    },
    type,
  ],
});

test("createCoreRelationGraph creates and prints the canonical core graph", () => {
  const graph = createCoreRelationGraph();

  process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);

  assert.deepEqual(graph, {
    revision: 0,
    nodes: {
      "relation.core.identity": coreNode("relation.core.identity"),
      "relation.core.predicate": coreNode("relation.core.predicate"),
      "relation.core.type": coreNode("relation.core.type"),
    },
  });
});
