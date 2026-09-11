import assert from "node:assert/strict";
import test from "node:test";
import {
  createCorePipGraph, createPipDocument, loadPipDocument,
  pipDocumentValues, serializePipDocument, graphNodes, setGraphNode,
} from "../pip-editor/pip/index.ts";
import { legacy_identifiers } from "../pip-editor/pip/legacy-identifiers.ts";
import { migrate_binding, migrate_workspace } from "../pip-editor/pip/legacy-workspace.ts";
import { assertPipManifest } from "../pip-editor/pip-package/manifest.ts";

// 测试夹具明确生成旧协议，不能随业务源码的命名替换一起改掉。
function old_document() {
  const document = createPipDocument(createCorePipGraph(), ["pip.core.type"]);
  const reverse_ids = new Map([...legacy_identifiers].map(([old_id, new_id]) => [new_id, old_id]));
  const visit = value => {
    if (typeof value === "string") {
      return reverse_ids.get(value) ?? value;
    }
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    }
    return value;
  };
  const result = visit(document);
  result.id = "relation-workspace@3";
  return result;
}

test("旧 v3 的身份、引用和根节点一起迁移，且输入不变、迁移幂等", () => {
  const source = old_document();
  const before = structuredClone(source);
  const migrated = loadPipDocument(source);
  assert.deepEqual(source, before);
  assert.equal(migrated.id, "pip-workspace@3");
  const { graph, rootNodeIds: root_ids } = pipDocumentValues(migrated);
  assert.deepEqual(root_ids, ["pip.core.type"]);
  assert.equal(graphNodes(graph)["pip.core.type"].pips[0].predicate_value.value.value, "pip.core.type");
  assert.doesNotMatch(serializePipDocument(migrated), /relation\./);
  assert.deepEqual(loadPipDocument(migrated), migrated);
  assert.deepEqual(loadPipDocument(JSON.parse(serializePipDocument(migrated))), migrated);
});

test("嵌套 ref 被迁移，普通 const 和第三方身份原样保留", () => {
  const source = old_document();
  const graph = source.pips.find(pip => pip.fork_level === "graph");
  setGraphNode(graph, {
    id: "relation.custom.user",
    fork_level: "node",
    pips: [{
      id: "text",
      fork_level: "pipe",
      predicate_value: {
        predicate: { node_id: "relation.core.identity", pip_id: "identity" },
        value: { kind: "const", value: "relation.core.type" },
      },
      pips: [{
        id: "nested",
        fork_level: "pipe",
        predicate_value: {
          predicate: { node_id: "relation.core.type", pip_id: "identity" },
          value: {
            kind: "op",
            op: "custom.operator",
            args: [{ kind: "ref", target: { node_id: "relation.core.type", pip_id: "identity" } }],
          },
        },
        pips: [],
      }],
    }],
  });
  const migrated = pipDocumentValues(loadPipDocument(source));
  const text = graphNodes(migrated.graph)["relation.custom.user"].pips[0];
  assert.equal(text.predicate_value.value.value, "relation.core.type");
  assert.equal(text.pips[0].predicate_value.value.args[0].target.node_id, "pip.core.type");
});

test("新旧节点身份冲突时拒绝迁移，不覆盖任何一方", () => {
  const source = old_document();
  const graph = source.pips.find(pip => pip.fork_level === "graph");
  setGraphNode(graph, graphNodes(createCorePipGraph())["pip.core.type"]);
  assert.throws(() => loadPipDocument(source), /identity collision/);
  assert.ok(graphNodes(graph)["relation.core.type"]);
  assert.ok(graphNodes(graph)["pip.core.type"]);
});

test("工作空间仅迁移已知路径，保护用户文本与自定义对象", () => {
  const source = {
    title: "relation.core.type",
    custom: { nodeId: "relation.core.type" },
    initialSelection: ["relation.core.type"],
    views: {
      projections: {
        "relation.core.type": {
          navigation: { entries: [{ projectionNodeId: "relation.projection.definition.flow" }] },
        },
      },
    },
  };
  const migrated = migrate_workspace(source);
  assert.equal(migrated.title, source.title);
  assert.deepEqual(migrated.custom, source.custom);
  assert.deepEqual(migrated.initialSelection, ["pip.core.type"]);
  assert.equal(migrated.views.projections["pip.core.type"].navigation.entries[0].projectionNodeId, "pip.projection.definition.flow");
  assert.deepEqual(migrate_workspace(migrated), migrated);
  assert.throws(() => migrate_workspace({ views: { projections: {
    "relation.core.type": {}, "pip.core.type": {},
  } } }), /collision/);
});

test("旧可执行插件明确要求重建，不能当成新插件静默加载", () => {
  for (const legacy_abi of [
    { layer: "a3", elementAbi: "relation-element/2" },
    { layer: "a4", nodeTypeAbi: "relation-node-type/2" },
  ]) {
    assert.throws(() => assertPipManifest(legacy_abi), /must be rebuilt/);
  }
});

test("执行绑定迁移旧引用字段，但不解释其中的用户常量", () => {
  const migrated = migrate_binding({
    target: { nodeId: "relation.core.type", relationId: "identity" },
    value: { nodeId: "relation.core.type", relationId: "identity" },
  });
  assert.deepEqual(migrated.target, { node_id: "pip.core.type", pip_id: "identity" });
  assert.deepEqual(migrated.value, { nodeId: "relation.core.type", relationId: "identity" });
});
