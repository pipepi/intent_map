import assert from "node:assert/strict";
import test from "node:test";
import {
  createCorePipGraph, createPipDocument, loadPipDocument,
  serializePipDocument, pipDocumentValues, assertPip,
} from "../pip-editor/pip/index.ts";

const levels = ["document", "graph", "node", "pipe"];

// 夹具仅将结构层级还原为历史数字，用户 JSON 不参与转换。
function numeric_document(source) {
  const result = structuredClone(source);
  const visit = pip => {
    pip.fork_level = levels.indexOf(pip.fork_level);
    pip.pips.forEach(visit);
  };
  visit(result);
  return result;
}

test("新文档的所有层级输出语义字符串", () => {
  const document = createPipDocument(createCorePipGraph(), []);
  const visit = pip => {
    assert.ok(levels.includes(pip.fork_level));
    pip.pips.forEach(visit);
  };
  visit(JSON.parse(serializePipDocument(document)));
  assert.equal(document.fork_level, "document");
  assert.equal(pipDocumentValues(document).graph.fork_level, "graph");
});

test("读取历史数字 v3 时兼容转换，保留用户常量且不修改输入", () => {
  const document = createPipDocument(createCorePipGraph(), [], {
    fork_level: 2, pips: [{ fork_level: 3 }],
  });
  const old_document = numeric_document(document);
  const before = structuredClone(old_document);
  assert.deepEqual(loadPipDocument(old_document), document);
  assert.deepEqual(old_document, before);
  assert.deepEqual(loadPipDocument(JSON.parse(serializePipDocument(old_document))), document);
  const invalid = structuredClone(old_document);
  invalid.pips[0].fork_level = 99;
  assert.throws(() => loadPipDocument(invalid), /fork_level/);
  assert.throws(() => assertPip(old_document), /fork_level/);
});

test("旧信封内的数字 Graph 也能读取", () => {
  const document = numeric_document(createPipDocument(createCorePipGraph(), []));
  const graph = document.pips.find(pip => pip.fork_level === 1);
  const loaded = loadPipDocument({
    format: "relation-workspace", schemaVersion: 1,
    graph, rootNodeIds: [], workspace: {},
  });
  assert.equal(pipDocumentValues(loaded).graph.fork_level, "graph");
});
