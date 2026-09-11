import assert from "node:assert/strict";
import test from "node:test";
import {
  PipForkLevel, createCorePipGraph, setGraphNode, graphNodes, graphRevision,
  createPipIndex, pipKey, applyPipTx, assertPipGraph,
} from "../pip-editor/pip/index.ts";
import { importPipGraph } from "../pip-editor/pip-host/packages/node-map-package.ts";

const pipe = (id, pips = []) => ({ id, fork_level: PipForkLevel.PIPE, pips });
const fixture = () => {
  const graph = createCorePipGraph();
  setGraphNode(graph, { id: "sample", fork_level: PipForkLevel.NODE, pips: [pipe("parent")] });
  return graph;
};
const apply = (graph, operations) => applyPipTx(graph, {
  schemaVersion: 2, baseRevision: graphRevision(graph), operations,
});

test("nested paths locate edits while PipRef retains pip_id_parent", () => {
  const graph = fixture();
  const added = apply(graph, [{ op: "put", parent_path: ["sample", "parent"], pip: pipe("child") }]);
  const ref = { node_id: "sample", pip_id: "child", pip_id_parent: "parent" };
  assert.deepEqual(createPipIndex(added.pip).refs.get(pipKey(ref)), ref);
  const replacement = pipe("child", [pipe("grandchild")]);
  const replaced = apply(added.pip, [{ op: "put", parent_path: ["sample", "parent"], pip: replacement }]);
  assert.deepEqual(replaced.inverse.operations[0].parent_path, ["sample", "parent"]);
  const reverted = applyPipTx(replaced.pip, replaced.inverse);
  assert.deepEqual(graphNodes(reverted.pip), graphNodes(added.pip));
  assert.equal(graphRevision(reverted.pip), 3);
  const removed = apply(replaced.pip, [{ op: "remove", parent_path: ["sample", "parent"], pip_id: "child" }]);
  assert.deepEqual(removed.inverse.operations[0].parent_path, ["sample", "parent"]);
  assert.deepEqual(graphNodes(removed.pip).sample.pips[0].pips, []);
  const restored = applyPipTx(removed.pip, removed.inverse);
  assert.deepEqual(graphNodes(restored.pip).sample.pips[0].pips, [replacement]);
  assert.throws(() => apply(added.pip, [{ op: "put", parent_path: ["sample"], pip: pipe("child") }]), /Duplicate/);
  assert.deepEqual(graphNodes(graph).sample.pips[0].pips, []);
});

test("parent-qualified references validate and survive graph import", () => {
  const graph = fixture();
  graphNodes(graph).sample.pips[0].pips.push(pipe("child"));
  graphNodes(graph).sample.pips.push({
    ...pipe("reference"), predicate_value: {
      predicate: { node_id: "pip.core.identity", pip_id: "identity" },
      value: { kind: "ref", target: { node_id: "sample", pip_id: "child", pip_id_parent: "parent" } },
    },
  });
  assert.doesNotThrow(() => assertPipGraph(graph));
  const imported = importPipGraph(graph, graph);
  const copied = graphNodes(imported.graph)[imported.nodeIds.get("sample")];
  assert.deepEqual(copied.pips[1].predicate_value.value.target, {
    node_id: imported.nodeIds.get("sample"), pip_id: "child", pip_id_parent: "parent",
  });
  graphNodes(graph).sample.pips[1].predicate_value.value.target.pip_id_parent = "wrong";
  assert.throws(() => assertPipGraph(graph), /parent does not match/);
});
