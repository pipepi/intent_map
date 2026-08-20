import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRelationPatch,
  assertRelationGraph,
  createCoreRelationGraph,
  createRelationIndex,
} from "../app/relation/model.ts";

const identity = { nodeId: "relation.core.identity", relationId: "identity" };

const person = (id, name) => ({
  id,
  relations: [
    { id: "identity", predicate: identity, object: { kind: "const", value: id }, relations: [] },
    { id: "name", predicate: identity, object: { kind: "const", value: name }, relations: [] },
  ],
});

test("core relation ontology is a closed self-describing graph", () => {
  const graph = createCoreRelationGraph();
  assert.doesNotThrow(() => assertRelationGraph(graph));
  assert.equal(createRelationIndex(graph).relations.size, 6);
});

test("relation patch applies atomically and produces an inverse patch", () => {
  const graph = createCoreRelationGraph();
  const applied = applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 0,
    operations: [{ op: "put-node", node: person("person.xiaoming", "小明") }],
  });
  assert.equal(applied.graph.revision, 1);
  assert.equal(applied.graph.nodes["person.xiaoming"].relations[1].object.value, "小明");
  const undone = applyRelationPatch(applied.graph, applied.inverse);
  assert.equal(undone.graph.revision, 2);
  assert.equal(undone.graph.nodes["person.xiaoming"], undefined);
});

test("consumer-owned references are indexed in both directions", () => {
  let graph = createCoreRelationGraph();
  graph = applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 0,
    operations: [
      { op: "put-node", node: person("person.source", "来源") },
      {
        op: "put-node",
        node: {
          ...person("event.target", "事件"),
          relations: [
            ...person("event.target", "事件").relations,
            {
              id: "subject",
              predicate: identity,
              object: { kind: "ref", target: { nodeId: "person.source", relationId: "identity" } },
              relations: [{ id: "confidence", predicate: identity, object: { kind: "const", value: 1 }, relations: [] }],
            },
          ],
        },
      },
    ],
  }).graph;
  const index = createRelationIndex(graph);
  assert.deepEqual(index.incoming.get("person.source\u0000identity"), [
    { nodeId: "event.target", relationId: "subject" },
  ]);
});

test("patch rejects stale revisions and dangling references without changing source", () => {
  const graph = createCoreRelationGraph();
  assert.throws(() => applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 1,
    operations: [],
  }), /Stale/);
  assert.throws(() => applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 0,
    operations: [{
      op: "put-node",
      node: {
        id: "broken",
        relations: [{
          id: "identity",
          predicate: identity,
          object: { kind: "ref", target: { nodeId: "missing", relationId: "identity" } },
          relations: [],
        }],
      },
    }],
  }), /Dangling/);
  assert.equal(graph.revision, 0);
  assert.equal(graph.nodes.broken, undefined);
});

test("removing a referenced node requires references to be removed in the same patch", () => {
  let graph = createCoreRelationGraph();
  graph = applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 0,
    operations: [
      { op: "put-node", node: person("person.source", "来源") },
      {
        op: "put-node",
        node: {
          id: "consumer",
          relations: [
            { id: "identity", predicate: identity, object: { kind: "const", value: "consumer" }, relations: [] },
            { id: "input", predicate: identity, object: { kind: "ref", target: { nodeId: "person.source", relationId: "identity" } }, relations: [] },
          ],
        },
      },
    ],
  }).graph;
  assert.throws(() => applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 1,
    operations: [{ op: "remove-node", nodeId: "person.source" }],
  }), /Dangling/);
  const result = applyRelationPatch(graph, {
    schemaVersion: 1,
    baseRevision: 1,
    operations: [
      { op: "remove-relation", nodeId: "consumer", relationId: "input" },
      { op: "remove-node", nodeId: "person.source" },
    ],
  });
  assert.equal(result.graph.nodes["person.source"], undefined);
});
