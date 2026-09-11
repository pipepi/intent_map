import { graphRevision, pipStatement, graphNodes } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { NodeTypePluginRegistry } from "../pip-editor/pip-host/activation/node-type-registry.ts";
import { ExecutionEventQueue } from "../pip-editor/pip-host/execution/event-queue.ts";
import { ExecutionSessionManager } from "../pip-editor/pip-host/execution/session-manager.ts";
import { applyPipTx } from "../pip-editor/pip/index.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const waitFor = async (read, predicate) => {
  for (let count = 0; count < 100; count += 1) {
    const value = read(); if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for execution");
};
async function fixture() {
  const suite = await buildIntentPluginSuite(), registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(suite.support.nodeType); await registry.install(suite.nodeType);
  let snapshot = { sessions: [] };
  const manager = new ExecutionSessionManager(registry, (next) => { snapshot = next; });
  return { suite, registry, manager, snapshot: () => snapshot };
}
test("Intent execution follows the existing contains scopes down and returns a root output", async () => {
    const { suite, manager, snapshot } = await fixture();
    const sessionId = await manager.start({ workspaceId: "w", graph: suite.nodeMap.graph, targetNodeId: "intent.application-root", value: { "input:source": { title: "hello" } } });
    const session = await waitFor(() => snapshot().sessions.find((item) => item.id === sessionId), (item) => item?.status === "completed");
    assert.deepEqual(session.outputs[0].value, { "output:result": { rendered: { title: "hello" } } });
    assert.deepEqual(session.trace.filter((item) => item.kind === "success").map((item) => item.nodeId), [
    "intent.document-loader", "intent.app-state", "intent.render-action", "intent.business-root",
  ]);
    assert.equal(graphRevision(suite.nodeMap.graph), 0);
});
test("continuous execution queues lineage-isolated frames and drains on close", async () => {
  const { suite, manager, snapshot } = await fixture();
  const sessionId = await manager.start({ workspaceId: "w", graph: suite.nodeMap.graph, targetNodeId: "intent.application-root", value: { "input:source": 1 }, continuous: true });
  await manager.push(sessionId, { "input:source": 2 }); manager.close(sessionId);
  const session = await waitFor(() => snapshot().sessions.find((item) => item.id === sessionId), (item) => item?.status === "completed");
  assert.equal(session.outputs.length, 2);
  assert.equal(new Set(session.outputs.map((item) => item.lineageId)).size, 2);
  assert.deepEqual(session.outputs.map((item) => item.value["output:result"].rendered), [1, 2]);
});
test("trigger validators reject private child targets", async () => {
    const { suite, registry } = await fixture(), graph = structuredClone(suite.nodeMap.graph);
    const target = graphNodes(graph)["intent.trigger.manual"].pips.find((item) => item.id === "target");
    pipStatement(target).value = { kind: "ref", target: { node_id: "intent.app-state", pip_id: "identity" } };
    assert.throws(() => registry.validators().forEach((validate) => validate(graph)), /private child/);
});
test("execution results enter Pip only through explicit persistence", async () => {
    const { suite, registry, manager, snapshot } = await fixture();
    const sessionId = await manager.start({ workspaceId: "w", graph: suite.nodeMap.graph, targetNodeId: "intent.application-root", value: { "input:source": null } });
    await waitFor(() => snapshot().sessions.find((item) => item.id === sessionId), (item) => item?.status === "completed");
    const applied = applyPipTx(suite.nodeMap.graph, manager.persistencePatch(sessionId, 0));
    registry.validators().forEach((validate) => validate(applied.pip));
    assert.equal(graphRevision(applied.pip), 1);
    assert.ok(Object.keys(graphNodes(applied.pip)).some((id) => id.startsWith("pip.execution.run.")));
});
test("bounded execution queues expose backpressure without reordering", async () => {
  const queue = new ExecutionEventQueue(1); await queue.push("first");
  let released = false; const waiting = queue.push("second").then(() => { released = true; });
  await Promise.resolve(); assert.equal(released, false); assert.equal(queue.shift(), "first");
  await waiting; assert.equal(queue.shift(), "second");
});
test("Intent A5 opens blank and A4 exposes existing projection instances through creators", async () => {
  const { suite, registry } = await fixture();
  assert.deepEqual(suite.nodeMap.manifest.rootNodeIds, []);
  assert.deepEqual(suite.nodeMap.workspace.views.projections, {});
  const creators = registry.creators().filter((item) => item.id.startsWith("intent.open-"));
  assert.deepEqual(creators.map((item) => item.id), ["intent.open-properties", "intent.open-children", "intent.open-flow"]);
  const context = { workspaceId: "w", graph: suite.nodeMap.graph, rootNodeIds: [], worldPosition: { x: 400, y: 300 } };
  assert.ok(creators.every((item) => item.accepts(context)));
  assert.deepEqual((await creators[2].create(context)).addRootNodeIds, ["intent.view.flow:intent.application-root"]);
  assert.equal(creators[2].accepts({ ...context, rootNodeIds: ["intent.view.flow:intent.application-root"] }), false);
});
