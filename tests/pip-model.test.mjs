import { graphRevision, graphNodes, pipStatement } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPipTx,
  assertPipGraph,
  createCorePipGraph,
  createPipIndex,
} from "../pip-editor/pip/index.ts";

const identity = { node_id: "pip.core.identity", pip_id: "identity" };

const person = (id, name) => ({
  id,
    fork_level: 2,
    pips: [
    { id: "identity", fork_level: 3, predicate_value: { predicate: identity, value: { kind: "const", value: id } }, pips: [] },
    { id: "name", fork_level: 3, predicate_value: { predicate: identity, value: { kind: "const", value: name } }, pips: [] },
  ]
});

test("core pip ontology is a closed self-describing graph", () => {
  let graph = createCorePipGraph();
  assert.doesNotThrow(() => assertPipGraph(graph));
  assert.equal(createPipIndex(graph).pips.size, 12);
});

test("pip patch applies atomically and produces an inverse patch", () => {
  let graph = createCorePipGraph();
  const applied = applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 0,
    operations: [{ op: "put", parent_path: [], pip: person("person.xiaoming", "小明") }],
  });
  assert.equal(graphRevision(applied.pip), 1);
  assert.equal(pipStatement(graphNodes(applied.pip)["person.xiaoming"].pips[1]).value.value, "小明");
  const undone = applyPipTx(applied.pip, applied.inverse);
  assert.equal(graphRevision(undone.pip), 2);
  assert.equal(graphNodes(undone.pip)["person.xiaoming"], undefined);
});

test("consumer-owned references are indexed in both directions", () => {
  let graph = createCorePipGraph();
  graph = applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 0,
    operations: [
      { op: "put", parent_path: [], pip: person("person.source", "来源") },
      { op: "put", parent_path: [], pip: {
          ...person("event.target", "事件"),
                    pips: [
            ...person("event.target", "事件").pips,
            {
              id: "subject",
                            fork_level: 3,
                            predicate_value: { predicate: identity, value: { kind: "ref", target: { node_id: "person.source", pip_id: "identity" } } },
                            pips: [{ id: "confidence", fork_level: 3, predicate_value: { predicate: identity, value: { kind: "const", value: 1 } }, pips: [] }]
                        },
          ],
        } },
    ],
  }).pip;
  const index = createPipIndex(graph);
  assert.deepEqual(index.incoming.get("person.source\u0000identity"), [
    { node_id: "event.target", pip_id: "subject" },
  ]);
});

test("patch rejects stale revisions and dangling references without changing source", () => {
  let graph = createCorePipGraph();
  assert.throws(() => applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 1,
    operations: [],
  }), /Stale/);
  assert.throws(() => applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 0,
    operations: [{ op: "put", parent_path: [], pip: {
        id: "broken",
                    fork_level: 2,
                    pips: [{
          id: "identity",
                            fork_level: 3,
                            predicate_value: { predicate: identity, value: { kind: "ref", target: { node_id: "missing", pip_id: "identity" } } },
                            pips: []
                        }]
                } }],
  }), /Dangling/);
  assert.equal(graphRevision(graph), 0);
  assert.equal(graphNodes(graph).broken, undefined);
});

test("removing a referenced node requires references to be removed in the same patch", () => {
  let graph = createCorePipGraph();
  graph = applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 0,
    operations: [
      { op: "put", parent_path: [], pip: person("person.source", "来源") },
      { op: "put", parent_path: [], pip: {
          id: "consumer",
                    fork_level: 2,
                    pips: [
            { id: "identity", fork_level: 3, predicate_value: { predicate: identity, value: { kind: "const", value: "consumer" } }, pips: [] },
            { id: "input", fork_level: 3, predicate_value: { predicate: identity, value: { kind: "ref", target: { node_id: "person.source", pip_id: "identity" } } }, pips: [] },
          ]
                } },
    ],
  }).pip;
  assert.throws(() => applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 1,
    operations: [{ op: "remove", parent_path: [], pip_id: "person.source" }],
  }), /Dangling/);
  const result = applyPipTx(graph, {
    schemaVersion: 2,
    baseRevision: 1,
    operations: [
      { op: "remove", parent_path: ["consumer"], pip_id: "input" },
      { op: "remove", parent_path: [], pip_id: "person.source" },
    ],
  });
  assert.equal(graphNodes(result.pip)["person.source"], undefined);
});
