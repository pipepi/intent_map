import assert from "node:assert/strict";
import test from "node:test";
import { PipForkLevel, applyPipTx, createCorePipGraph, createPipDocument, pipDocumentValues, graphRevision } from "../pip-editor/pip/index.ts";

const pipe = (id, pips = []) => ({ id, fork_level: PipForkLevel.PIPE, pips });
const patch = operations => ({ schemaVersion: 2, operations });
const put = (parent_path, pip) => ({ op: "put", parent_path, pip });
const remove = (parent_path, pip_id) => ({ op: "remove", parent_path, pip_id });

test("standalone NODE and PIPE edits preserve ordering through multi-operation undo", () => {
  for (const fork_level of [PipForkLevel.NODE, PipForkLevel.PIPE]) {
    const source = { id: "root", fork_level, pips: [pipe("a"), pipe("b", [pipe("child")]), pipe("c")] };
    const before = structuredClone(source);
    const applied = applyPipTx(source, patch([
      remove([], "a"), put(["b"], pipe("extra")), remove([], "c"), put([], pipe("d")),
    ]));
    assert.deepEqual(source, before);
    assert.deepEqual(applied.pip.pips.map(pip => pip.id), ["b", "d"]);
    assert.deepEqual(applyPipTx(applied.pip, applied.inverse).pip, source);
    assert.equal(applied.inverse.baseRevision, undefined);
  }
});

test("DOCUMENT paths reach nested Pips and revision advances once per transaction", () => {
  const source = createPipDocument(createCorePipGraph(), []);
  const graph = pipDocumentValues(source).graph;
  const node = { id: "sample", fork_level: PipForkLevel.NODE, pips: [] };
  const applied = applyPipTx(source, { ...patch([
    put([graph.id], node), put([graph.id, node.id], pipe("nested")),
    put([graph.id, node.id, "nested"], pipe("leaf")),
  ]), baseRevision: 0 });
  assert.equal(graphRevision(pipDocumentValues(applied.pip).graph), 1);
  const undone = applyPipTx(applied.pip, applied.inverse).pip;
  const expected = structuredClone(source);
  pipDocumentValues(expected).graph.pips.find(pip => pip.id === "revision").predicate_value.value.value = 2;
  assert.deepEqual(undone, expected);
});

test("undo preserves graph sibling order even when revision metadata follows removed node", () => {
  const source = createCorePipGraph();
  source.pips.unshift({ id: "sample", fork_level: PipForkLevel.NODE, pips: [] });
  const applied = applyPipTx(source, { ...patch([remove([], "sample")]), baseRevision: 0 });
  const undone = applyPipTx(applied.pip, applied.inverse).pip;
  assert.deepEqual(undone.pips.map(pip => pip.id), source.pips.map(pip => pip.id));
  assert.equal(graphRevision(undone), 2);
});

test("invalid operations, paths and stale revisions fail atomically", () => {
  const source = pipe("root", [pipe("a")]);
  for (const operation of [remove([], "missing"), put(["missing"], pipe("b")), put([""], pipe("b")), { op: "put-node" }, put([], { id: "bad" })]) {
    assert.throws(() => applyPipTx(source, patch([put([], pipe("temporary")), operation])));
    assert.deepEqual(source, pipe("root", [pipe("a")]));
  }
  assert.throws(() => applyPipTx(source, { ...patch([]), schemaVersion: 1 }), /schema/);
  assert.throws(() => applyPipTx(source, { ...patch([]), baseRevision: 0 }), /Stale/);
  const graph = createCorePipGraph();
  assert.throws(() => applyPipTx(graph, patch([])), /Stale/);
  assert.throws(() => applyPipTx(graph, { ...patch([remove([], "revision")]), baseRevision: 0 }));
  assert.equal(graphRevision(graph), 0);
});
