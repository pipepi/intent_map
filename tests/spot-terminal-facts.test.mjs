import assert from "node:assert/strict";
import test from "node:test";
import { applyRelationPatch, createCoreRelationGraph } from "../pip-editor/relation/index.ts";
import { NodeTypePluginRegistry } from "../pip-editor/relation-host/activation/node-type-registry.ts";
import { navigateProjection, replaceCurrentProjection } from "../pip-editor/relation-host/projection/projection-navigation.ts";
import { forwardRoute, navigationForRoot, projectionOptions, routeForProjection } from "../pip-editor/relation-host/projection/projection-routes.ts";
import { WorkspaceSessionStore } from "../pip-editor/relation-host/workspace/workspace-store.ts";
import { moveChild } from "../pip-editor-io/relation-projections/runtime/commands.js";
import { terminalCreator } from "../pip-editor-io/spot-terminal/runtime/creator.js";
import { reconcile_facts } from "../pip-editor-io/spot-terminal/runtime/facts/reconcile.js";
import { initialState, patchState } from "../pip-editor-io/spot-terminal/runtime/state.js";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";

const target = (node, predicate) => node.relations.find((item) => item.predicate.nodeId === predicate)?.object?.target?.nodeId;
const data_module = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("Spot facts materialize stable children and equivalent simple/detail projections", () => {
  const source = createCoreRelationGraph(), created = terminalCreator.create({ graph: source });
  const first = applyRelationPatch(source, created.patch).graph;
  const detail_id = created.preferredProjection.projectionId;
  const terminal_id = target(first.nodes[detail_id], "relation.projection.predicate.observes");
  const state = {
    authenticated: true, selectedSymbol: "BTC/USDT", selectedPeriod: "1min",
    member: { memberId: "member-1", username: "alice" },
    symbols: [{ symbol: "BTC/USDT" }], wallets: [{ unit: "USDT", balance: 20 }],
    bids: [{ price: 10, amount: 2 }], asks: [{ price: 11, amount: 1 }], ticker: { lastPrice: 10.5 },
    klines: [{ time: 1000, closePrice: 10.5 }],
    orders: [{ orderId: "order-1", symbol: "BTC/USDT", direction: "BUY", status: "TRADING" }],
    trades: [{ tradeId: "trade-1", symbol: "BTC/USDT", price: 10.5, amount: 1, time: 1001 }],
  };
  const graph = applyRelationPatch(first, patchState(first, terminal_id, state)).graph;
  const terminal = graph.nodes[terminal_id], children = terminal.relations
    .filter((item) => item.predicate.nodeId === "spot.terminal.predicate.contains").map((item) => item.object.target.nodeId);
  assert.ok(children.some((id) => id.includes(":order-event:order-1")));
  assert.ok(children.some((id) => id.includes(":trade-event:trade-1")));
  assert.ok(children.some((id) => id.includes(":account:member-1")));
  assert.ok(children.some((id) => id.includes(":kline:")));
  for (const child_id of children) {
    assert.ok(graph.nodes[`${child_id}:projection:simple`]);
    assert.ok(graph.nodes[`${child_id}:projection:detail`]);
  }
  const flow = Object.values(graph.nodes).find((node) => target(node, "relation.projection.predicate.uses") === "spot.terminal.projection.children");
  const world = Object.values(graph.nodes).find((node) => target(node, "relation.projection.predicate.uses") === "spot.terminal.projection.world-events");
  assert.equal(flow.relations.filter((item) => item.predicate.nodeId === "relation.projection.predicate.presents").length, children.length);
  assert.equal(world.relations.filter((item) => item.predicate.nodeId === "relation.projection.predicate.presents").length, children.length);
});

test("Spot fact reconciliation reuses stable ids and removes facts outside the bounded snapshot", () => {
  const source = createCoreRelationGraph(), created = terminalCreator.create({ graph: source });
  const first = applyRelationPatch(source, created.patch).graph;
  const terminal_id = target(first.nodes[created.preferredProjection.projectionId], "relation.projection.predicate.observes");
  const populated = applyRelationPatch(first, patchState(first, terminal_id, { orders: [{ orderId: "same" }], trades: [], symbols: [], wallets: [] })).graph;
  const order_id = `${terminal_id}:fact:order-event:same`;
  assert.ok(populated.nodes[order_id]);
  const repeated = applyRelationPatch(populated, patchState(populated, terminal_id, { orders: [{ orderId: "same", status: "DONE" }], trades: [], symbols: [], wallets: [] })).graph;
  assert.equal(repeated.nodes[order_id].relations.find((item) => item.id === "value").object.value.status, "DONE");
  const cleared = applyRelationPatch(repeated, patchState(repeated, terminal_id, { orders: [], trades: [], symbols: [], wallets: [] })).graph;
  assert.equal(cleared.nodes[order_id], undefined);
  assert.equal(cleared.nodes[`${order_id}:projection:simple`], undefined);
  assert.equal(cleared.nodes[`${order_id}:projection:detail`], undefined);
});

test("Spot reconciliation is incremental and preserves independent composition frames", () => {
  const source = createCoreRelationGraph(), created = terminalCreator.create({ graph: source });
  let graph = applyRelationPatch(source, created.patch).graph;
  const terminal_id = target(graph.nodes[created.preferredProjection.projectionId], "relation.projection.predicate.observes");
  assert.equal(reconcile_facts(graph, terminal_id, initialState()).operations.length, 0);
  const projections = Object.values(graph.nodes), flow = projections.find((node) => target(node, "relation.projection.predicate.uses") === "spot.terminal.projection.children");
  const world = projections.find((node) => target(node, "relation.projection.predicate.uses") === "spot.terminal.projection.world-events");
  const child_id = flow.relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.presents").object.target.nodeId;
  const flow_frame = { x: 900, y: 500, width: 260, height: 140, resizeMode: "simple" };
  const world_frame = { x: 120, y: 700, width: 280, height: 160, resizeMode: "simple" };
  graph = applyRelationPatch(graph, moveChild({ parentProjectionId: flow.id, childProjectionId: child_id, frame: flow_frame }, graph)).graph;
  graph = applyRelationPatch(graph, moveChild({ parentProjectionId: world.id, childProjectionId: child_id, frame: world_frame }, graph)).graph;
  graph = applyRelationPatch(graph, patchState(graph, terminal_id, { ...initialState(), botEnabled: true })).graph;
  const frame_of = (id) => graph.nodes[id].relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.presents")
    .relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.frame").object.value;
  assert.deepEqual(frame_of(flow.id), flow_frame);
  assert.deepEqual(frame_of(world.id), world_frame);
});

test("fallback Pair remains the object of order and trade events", () => {
  const source = createCoreRelationGraph(), created = terminalCreator.create({ graph: source });
  const first = applyRelationPatch(source, created.patch).graph;
  const terminal_id = target(first.nodes[created.preferredProjection.projectionId], "relation.projection.predicate.observes");
  const graph = applyRelationPatch(first, patchState(first, terminal_id, {
    selectedSymbol: "BTC/USDT", symbols: [], wallets: [], orders: [{ orderId: "order", symbol: "BTC/USDT" }], trades: [{ tradeId: "trade", symbol: "BTC/USDT" }],
  })).graph;
  const pair_id = `${terminal_id}:fact:pair:BTC%2FUSDT`;
  for (const kind of ["order-event:order", "trade-event:trade"]) {
    assert.equal(target(graph.nodes[`${terminal_id}:fact:${kind}`], "spot.terminal.predicate.object"), pair_id);
  }
});

test("Spot route is Terminal self → children → presented Child self with same-level replacements", async () => {
  const suite = await buildSpotTerminalPluginSuite(), registry = new NodeTypePluginRegistry({ load: data_module });
  await registry.install(suite.nodeType);
  const source = createCoreRelationGraph(), created = terminalCreator.create({ graph: source });
  const first = applyRelationPatch(source, created.patch).graph;
  const terminal_id = target(first.nodes[created.preferredProjection.projectionId], "relation.projection.predicate.observes");
  const graph = applyRelationPatch(first, patchState(first, terminal_id, {
    orders: [{ orderId: "route-order", symbol: "BTC/USDT" }], symbols: [{ symbol: "BTC/USDT" }], selectedSymbol: "BTC/USDT",
  })).graph;
  registry.validators().forEach((validate) => assert.doesNotThrow(() => validate(graph)));
  const terminal_options = projectionOptions(terminal_id, graph, registry);
  let navigation = navigationForRoot(created.preferredProjection.projectionId, graph, registry);
  const simple_route = routeForProjection(terminal_options.find(({ label }) => label.includes("Spot Simple")).projectionNodeId, graph, registry);
  navigation = replaceCurrentProjection(navigation, simple_route);
  assert.deepEqual([navigation.index, navigation.entries.length, navigation.entries[0].scope], [0, 1, "self"]);
  const flow_route = forwardRoute(navigation, graph, registry);
  navigation = navigateProjection(navigation, flow_route);
  const world_route = routeForProjection(terminal_options.find(({ label }) => label.includes("World Events")).projectionNodeId, graph, registry);
  navigation = replaceCurrentProjection(navigation, world_route);
  assert.deepEqual([navigation.index, navigation.entries.length, navigation.entries[1].scope], [1, 2, "children"]);
  const child_simple_id = `${terminal_id}:fact:order-event:route-order:projection:simple`;
  const child_route = forwardRoute(navigation, graph, registry, child_simple_id);
  navigation = navigateProjection(navigation, child_route);
  const child_options = projectionOptions(child_route.observedNodeId, graph, registry);
  assert.deepEqual(child_options.map(({ label }) => label), ["▣ order-event Simple", "↗ order-event Detail"]);
  const child_detail = routeForProjection(child_options[1].projectionNodeId, graph, registry, child_route.enteredFrom);
  navigation = replaceCurrentProjection(navigation, child_detail);
  assert.deepEqual([navigation.index, navigation.entries.length, navigation.entries[2].scope], [2, 3, "self"]);
  assert.equal(navigation.entries[2].enteredFrom.childProjectionId, child_simple_id);

  const order_id = child_route.observedNodeId;
  const workspace = { id: "spot.navigation", graph, rootNodeIds: [created.preferredProjection.projectionId], views: {
    kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 }, systemWindows: {},
    projections: { [created.preferredProjection.projectionId]: { x: 80, y: 80, width: 1120, height: 720, resizeMode: "simple", navigation } },
  }, selection: [order_id], scopedSelections: { [created.preferredProjection.projectionId]: [order_id] }, undo: [], redo: [], capabilityDiagnostics: [], savedGraphFingerprint: "", source: {} };
  const store = new WorkspaceSessionStore([workspace], () => {});
  store.commitPatch(workspace.id, patchState(graph, terminal_id, { orders: [], trades: [], symbols: [], wallets: [] }), registry.validators());
  const next = store.list()[0], next_navigation = next.views.projections[created.preferredProjection.projectionId].navigation;
  assert.equal(next.graph.nodes[child_simple_id], undefined);
  assert.deepEqual([next_navigation.index, next_navigation.entries.length, next_navigation.entries[1].scope], [1, 2, "children"]);
  assert.deepEqual(next.selection, []);
  assert.deepEqual(next.scopedSelections[created.preferredProjection.projectionId], []);
});
