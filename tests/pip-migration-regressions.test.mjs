import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPipDocument, serializePipDocument, pipDocumentValues, graphNodes,
  graphRevision, applyPipTx, createCorePipGraph, setGraphNode, assertPipGraph,
} from "../pip-editor/pip/index.ts";
import { migrate_graph } from "../pip-editor/pip/legacy-semantics.ts";
import { triggerProviders } from "../pip-editor-io/pip-projections/flow/triggers.js";

test("触发器输入映射按 payload 字段名读取，不迁移同名操作符", () => {
  const source = {
    id: "trigger", fork_level: 2,
    pips: [{
      id: "mapping", fork_level: 3,
      predicate_value: {
        predicate: { node_id: "relation.trigger.predicate.input-mapping", pip_id: "identity" },
        value: { kind: "const", value: { op: "relation.flow", target: "source" } },
      },
      pips: [],
    }],
  };
  const migrated = migrate_graph(source);
  assert.deepEqual(migrated.pips[0].predicate_value.value, source.pips[0].predicate_value.value);
  assert.deepEqual(triggerProviders[0].mapInput(migrated, {
    "relation.flow": 42, source: "kept",
  }), { op: 42, target: "kept" });
});

test("旧 v1/v2 的 revision 节点与引用保留，元数据确定性避让", () => {
  const identity = { nodeId: "relation.core.identity", relationId: "identity" };
  const values = {
    graph: {
      revision: 7,
      nodes: {
        revision: {
          id: "revision",
          relations: [{
            id: "identity", predicate: identity,
            object: { kind: "const", value: "revision" }, relations: [],
          }],
        },
        "revision~1": { id: "revision~1", relations: [] },
        source: {
          id: "source",
          relations: [{
            id: "link", predicate: identity,
            object: { kind: "ref", target: { nodeId: "revision", relationId: "identity" } },
            relations: [],
          }],
        },
      },
    },
    rootNodeIds: ["revision"],
    workspace: { initialSelection: ["revision"] },
  };
  const inputs = [
    { format: "relation-workspace", schemaVersion: 1, ...values },
    { id: "relation-workspace@2", relations: Object.entries(values).map(([id, value]) => ({ id, value })) },
  ];
  for (const input of inputs) {
    const before = structuredClone(input);
    const document = loadPipDocument(input);
    const { graph, rootNodeIds: root_ids, workspace } = pipDocumentValues(document);
    assert.deepEqual(input, before);
    assert.equal(graphRevision(graph), 7);
    const metadata = graph.pips.find(pip => pip.fork_level === 3);
    assert.equal(metadata.id, "revision~2");
    assert.equal(graphNodes(graph).source.pips[0].predicate_value.value.target.node_id, "revision");
    assert.deepEqual(root_ids, ["revision"]);
    assert.deepEqual(workspace.initialSelection, ["revision"]);
    assert.deepEqual(loadPipDocument(JSON.parse(serializePipDocument(document))), document);
    const applied = applyPipTx(graph, {
      schemaVersion: 2, baseRevision: 7,
      operations: [{ op: "put", parent_path: ["revision"], pip: { id: "note", fork_level: 3, pips: [] } }],
    });
    assert.equal(graphRevision(applied.pip), 8);
    const restored = applyPipTx(applied.pip, applied.inverse).pip;
    assert.equal(graphRevision(restored), 9);
    assert.deepEqual(graphNodes(restored), graphNodes(graph));
    assert.equal(restored.pips.find(pip => pip.fork_level === 3).id, "revision~2");
  }
});

test("元数据避让后仍拒绝同谓词重复元数据", () => {
  const graph = createCorePipGraph();
  setGraphNode(graph, { id: "revision", fork_level: 2, pips: [] });
  assert.doesNotThrow(() => assertPipGraph(graph));
  const metadata = graph.pips.find(pip => pip.fork_level === 3);
  graph.pips.push({ ...structuredClone(metadata), id: "duplicate" });
  assert.throws(() => assertPipGraph(graph), /Expected one metadata/);
});
