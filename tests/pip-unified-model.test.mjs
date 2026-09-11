import assert from "node:assert/strict";
import test from "node:test";
import {
  PipForkLevel, META, assertPip, assertPipGraph, applyPipTx,
  createCorePipGraph, createPipDocument, loadPipDocument,
  serializePipDocument, pipDocumentValues, graphNodes, graphRevision,
  setGraphNode, metadataValue, createPipIndex,
} from "../pip-editor/pip/index.ts";
import { importPipGraph } from "../pip-editor/pip-host/packages/node-map-package.ts";
import { pipsByPredicate } from "../pip-editor/pip-host/projection/projection-instance.ts";

const emptyPipe = (id) => ({ id, fork_level: PipForkLevel.PIPE, pips: [] });
const node = (id) => ({ id, fork_level: PipForkLevel.NODE, pips: [emptyPipe("annotation")] });

test("DOCUMENT, GRAPH, NODE and PIPE persist only the unified Pip shape", () => {
  const graph = createCorePipGraph();
  setGraphNode(graph, node("sample"));
  const doc = createPipDocument(graph, ["sample"], { zoom: 2 });
  const visit = pip => {
    assert.ok(Object.keys(pip).every(key => ["id", "fork_level", "predicate_value", "pips"].includes(key)));
    pip.pips.forEach(visit);
  };
  visit(doc);
  assert.equal(doc.fork_level, PipForkLevel.DOCUMENT);
  const loaded = loadPipDocument(JSON.parse(serializePipDocument(doc)));
  assert.deepEqual(loaded, doc);
  const values = pipDocumentValues(loaded);
  assert.equal(values.graph.fork_level, PipForkLevel.GRAPH);
  assert.deepEqual(values.rootNodeIds, ["sample"]);
  assert.deepEqual(values.workspace, { zoom: 2 });
  assert.equal(metadataValue(values.graph, META.revision), 0);
  const lookup = graphNodes(values.graph);
  delete lookup.sample;
  assert.ok(graphNodes(values.graph).sample, "lookup membership is derived, not persisted");
});

test("predicate/value is optional as a pair, but never half a pair", () => {
  assert.doesNotThrow(() => assertPip(emptyPipe("empty")));
  assert.deepEqual(pipsByPredicate(node("sample"), "pip.core.type"), []);
  for (const predicate_value of [{ predicate: { node_id: "n", pip_id: "i" } }, { value: { kind: "const", value: 1 } }]) {
    assert.throws(() => assertPip({ ...emptyPipe("invalid"), predicate_value }));
  }
  assert.throws(() => assertPip({ ...emptyPipe("old"), object: { kind: "const", value: 1 } }), /Unexpected field/);
  assert.throws(() => assertPip({ ...emptyPipe("bad"), fork_level: 99 }), /fork_level/);
  assert.throws(() => assertPip({ ...emptyPipe("parent"), pips: [node("nested-node")] }), /fork level/);
});

test("metadata participates in closure and validates revisions and document roots", () => {
  const missing = createCorePipGraph();
  missing.pips = missing.pips.filter(pip => pip.id !== META.revision);
  assert.throws(() => assertPipGraph(missing), /Dangling/);
  const invalid = createCorePipGraph();
  invalid.pips.find(pip => pip.id === "revision").predicate_value.value.value = -1;
  assert.throws(() => assertPipGraph(invalid), /revision/);
  assert.throws(() => createPipDocument(createCorePipGraph(), ["missing"]), /root node/);
  const doc = createPipDocument(createCorePipGraph(), []);
  doc.pips.find(pip => pip.id === "workspace").predicate_value.predicate.node_id = "missing";
  assert.throws(() => loadPipDocument(doc), /metadata/);
});

test("optional-pair Pips survive patches, inverses and collision imports", () => {
  const initial = createCorePipGraph();
  const applied = applyPipTx(initial, { schemaVersion: 2, baseRevision: 0,
    operations: [{ op: "put", parent_path: [], pip: node("sample") }] });
  assert.equal(graphRevision(initial), 0);
  assert.equal(graphRevision(applied.pip), 1);
  assert.ok(createPipIndex(applied.pip).pips.has("sample\u0000annotation"));
  const imported = importPipGraph(applied.pip, applied.pip);
  assert.deepEqual(graphNodes(imported.graph)[imported.nodeIds.get("sample")].pips, [emptyPipe("annotation")]);
  const undone = applyPipTx(applied.pip, applied.inverse);
  assert.equal(graphNodes(undone.pip).sample, undefined);
  assert.equal(graphRevision(undone.pip), 2);
  assert.throws(() => applyPipTx(initial, { schemaVersion: 2, baseRevision: 0,
    operations: [{ op: "put", parent_path: [], pip: { ...emptyPipe("wrong-level"), fork_level: PipForkLevel.DOCUMENT } }] }), /fork level/);
  assert.equal(graphRevision(initial), 0);
});

test("legacy v1 and v2 inputs migrate once and serialize only as v3 Pips", () => {
  const graph = { revision: 7, nodes: { sample: { id: "sample", relations: [{
    id: "identity", predicate: { nodeId: "relation.core.identity", relationId: "identity" },
    object: { kind: "const", value: "sample" }, relations: [],
  }] } } };
  const values = { graph, rootNodeIds: ["sample"], workspace: {} };
  const v1 = loadPipDocument({ format: "relation-workspace", schemaVersion: 1, ...values });
  const v2 = loadPipDocument({ id: "relation-workspace@2", relations: Object.entries(values).map(([id, value]) => ({ id, value })) });
  assert.deepEqual(v1, v2);
  assert.equal(v1.id, "pip-workspace@3");
  assert.equal(graphRevision(pipDocumentValues(v1).graph), 7);
  assert.equal(graph.nodes.sample.relations[0].object.value, "sample");
  assert.deepEqual(loadPipDocument(JSON.parse(serializePipDocument(v1))), v1);
});
