import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage } from "../pip-editor/relation-host/packages/element-package.ts";
import { decodeNodeTypePackage, validateNodeTypeDependencies } from "../pip-editor/relation-host/packages/node-type-package.ts";
import { importPip } from "../pip-editor/relation-host/packages/import-pip.ts";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";
import { bootstrapState, historyKlines, mergeKlines, mergeTicker, normalizeBook, ordersState } from "../pip-editor-io/spot-terminal/runtime/normalize.js";
import { DEFAULT_PERIODS, periodOf } from "../pip-editor-io/spot-terminal/runtime/periods.js";
import { terminalView } from "../pip-editor-io/spot-terminal/elements/render.js";
import { acceptsKlinePeriod, acknowledgeKlines, mergeDepth, mergeMessage } from "../pip-editor-io/spot-terminal/runtime/stomp.js";
import { validateOrder } from "../pip-editor-io/spot-terminal/runtime/validation.js";
import { withWindowChrome } from "../pip-editor-io/spot-terminal/runtime/window-chrome.js";
import { windowNavigation } from "../pip-editor-io/spot-terminal/elements/window-navigation.js";
import { childrenTerminal, embeddedTerminal, worldTerminal } from "../pip-editor-io/spot-terminal/elements/projection-views.js";
import { terminalCreator } from "../pip-editor-io/spot-terminal/runtime/creator.js";
import { NodeTypePluginRegistry } from "../pip-editor/relation-host/activation/node-type-registry.ts";
import { projectionOptions } from "../pip-editor/relation-host/projection/projection-routes.ts";

const dataModule = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("spot terminal produces independently importable A3 and exact A4 dependency", async () => {
  const suite = await buildSpotTerminalPluginSuite();
  const element = await decodeElementPackage(suite.elementPip), nodeType = await decodeNodeTypePackage(suite.nodeTypePip);
  assert.equal(element.manifest.layer, "a3");
  assert.equal(nodeType.manifest.layer, "a4");
  assert.equal(nodeType.manifest.dependencies[0].sha256, element.contentSha256);
  assert.equal(nodeType.embeddedElements[0].contentSha256, element.contentSha256);
  assert.doesNotThrow(() => validateNodeTypeDependencies(nodeType, [element]));
  assert.throws(() => validateNodeTypeDependencies(nodeType, []), /official\.spot-terminal-elements/);
});

test("spot A4 imports its embedded A3 before activating A4", async () => {
  const suite = await buildSpotTerminalPluginSuite(), elements = [], types = [];
  const context = {
    confirmTrust: () => true, trustHashes: () => {}, openNodeMap: () => {},
    installElement: async (plugin) => { elements.push(plugin); return "installed"; },
    installNodeType: async (plugin) => { validateNodeTypeDependencies(plugin, elements); types.push(plugin); return "installed"; },
  };
  assert.equal((await importPip(suite.nodeTypePip, context)).layer, "a4");
  assert.equal(elements[0].manifest.packageId, "official.spot-terminal-elements");
  assert.equal(types[0].manifest.packageId, "official.spot-terminal-types");
});

test("spot terminal bundled sources expose creator, commands and projection", async () => {
  const suite = await buildSpotTerminalPluginSuite();
  assert.match(suite.element.entrySource, /spot-terminal-view/);
  assert.match(suite.nodeType.entrySource, /spot\.terminal\.create/);
  assert.match(suite.nodeType.entrySource, /terminal\/login/);
  assert.match(suite.nodeType.entrySource, /exchange\/order\/add/);
  assert.match(suite.nodeType.entrySource, /market\/history/);
  assert.match(suite.nodeType.entrySource, /spot\.terminal\.projection\.workspace/);
  assert.match(suite.nodeType.entrySource, /spot\.terminal\.projection\.children/);
  assert.match(suite.nodeType.entrySource, /spot\.terminal\.projection\.embedded/);
  assert.match(suite.nodeType.entrySource, /surfaces/);
  assert.match(suite.nodeType.entrySource, /embedded/);
  assert.match(suite.nodeType.entrySource, /scope/);
  assert.match(suite.element.entrySource, /set-workspace-window/);
});

test("spot creator installs four contextual projection instances", () => {
  const result = terminalCreator.create({ graph: { revision: 7, nodes: {} } });
  const nodes = result.patch.operations.filter((operation) => operation.op === "put-node").map((operation) => operation.node);
  const uses = (node) => node.relations.find((relation) => relation.predicate.nodeId === "relation.projection.predicate.uses")?.object?.target?.nodeId;
  assert.equal(nodes.filter((node) => uses(node)?.startsWith("spot.terminal.projection.")).length, 4);
  assert.ok(nodes.some((node) => uses(node) === "spot.terminal.projection.workspace"));
  assert.ok(nodes.some((node) => uses(node) === "spot.terminal.projection.children"));
  assert.ok(nodes.some((node) => uses(node) === "spot.terminal.projection.world-events"));
  assert.ok(nodes.some((node) => uses(node) === "spot.terminal.projection.embedded"));
  const root = nodes.find((node) => node.id === result.preferredProjection.projectionId);
  assert.ok(root.relations.some((relation) => relation.predicate.nodeId === "relation.projection.predicate.dives-into"));
  assert.equal(uses(nodes.find((node) => node.id === root.relations.find((relation) => relation.predicate.nodeId === "relation.projection.predicate.dives-into").object.target.nodeId)), "spot.terminal.projection.children");
  const overview = nodes.find((node) => uses(node) === "spot.terminal.projection.embedded");
  assert.equal(uses(nodes.find((node) => node.id === overview.relations.find((relation) => relation.predicate.nodeId === "relation.projection.predicate.dives-into").object.target.nodeId)), "spot.terminal.projection.children");
});

test("spot A4 runtime exposes all four created projections to workspace navigation", async () => {
  const suite = await buildSpotTerminalPluginSuite();
  const nodeType = await decodeNodeTypePackage(suite.nodeTypePip);
  const registry = new NodeTypePluginRegistry({ load: dataModule });
  await registry.install(nodeType);
  assert.deepEqual(registry.projections().map(({ scope, surfaces }) => [scope, surfaces]), [
    ["self", ["workspace", "embedded"]], ["children", ["workspace"]], ["children", ["workspace"]], ["self", ["workspace", "embedded"]],
  ]);
  assert.deepEqual(registry.projections().map(({ zoomViewport }) => zoomViewport?.top), [36, 36, 36, 0]);

  const created = registry.creators().find(({ id }) => id === "spot.terminal.create")
    .create({ graph: { revision: 0, nodes: {} } });
  const nodes = Object.fromEntries(created.patch.operations
    .filter(({ op }) => op === "put-node").map(({ node }) => [node.id, node]));
  const terminalId = nodes[created.preferredProjection.projectionId].relations
    .find(({ predicate }) => predicate.nodeId === "relation.projection.predicate.observes").object.target.nodeId;
  assert.deepEqual(projectionOptions(terminalId, { revision: 1, nodes }, registry).map(({ scope, label }) => [scope, label]), [
    ["self", "↗ Spot Detail"],
    ["children", "⇄ Spot Flow"],
    ["children", "◎ Spot World Events"],
    ["self", "▣ Spot Overview"],
  ]);
});

test("spot A3 renders internal workspace and compact parent-space views", () => {
  assert.match(childrenTerminal({ authenticated: true, symbols: [1, 2], assets: [1], orders: [], connected: true }), /直接子级内部视角/);
  assert.match(embeddedTerminal({ authenticated: true, symbol: "BTC\/USDT", ticker: { lastPrice: 78000 }, connected: true }), /BTC\/USDT/);
  assert.match(worldTerminal({ authenticated: true, symbol: "BTC\/USDT", orders: [], connected: true }), /World Events/);
  assert.match(worldTerminal({ authenticated: true, symbol: "BTC\/USDT", orders: [], connected: true }), /观察子级 · 世界事件模型/);
});

test("spot A4 supplies window navigation state and A3 renders its chrome", () => {
  const frame = { x: 10, y: 20, width: 390, height: 720, navigation: {
    index: 1, semanticScale: 1.25, entries: [
      { projectionNodeId: "parent", scope: "self", enteredFrom: undefined },
      { projectionNodeId: "spot-view", scope: "self" },
    ],
  } };
  const state = withWindowChrome({ authenticated: false }, { projections: { "root-window": frame } }, "spot-view");
  assert.equal(state.windowChrome.windowId, "root-window");
  assert.equal("enteredFrom" in state.windowChrome.frame.navigation.entries[0], false);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(state)));
  assert.deepEqual([state.windowChrome.canBack, state.windowChrome.canForward, state.windowChrome.scale], [true, false, 1.25]);
  const html = windowNavigation(state);
  assert.match(html, /data-window-back/);
  assert.match(html, /data-window-forward[^>]*disabled/);
  assert.match(html, /aria-label="当前投影"/);
  assert.match(html, /125%/);
});

test("spot plugin chrome renders and selects all semantic projection routes", () => {
  const options = [
    { projectionNodeId: "self", observedNodeId: "spot", scope: "self", label: "Detail · 观察自身" },
    { projectionNodeId: "children", observedNodeId: "spot", scope: "children", label: "Flow · 观察子级" },
    { projectionNodeId: "embedded", observedNodeId: "spot", scope: "self", label: "Overview · 观察自身" },
  ];
  const state = withWindowChrome({}, { projections: { window: { navigation: {
    index: 0, semanticScale: 1, entries: [{ projectionNodeId: "self", observedNodeId: "spot", scope: "self" }],
  } } } }, "self", "Spot Trading Terminal", options);
  const html = windowNavigation(state);
  assert.equal((html.match(/<option/g) ?? []).length, 3);
  assert.match(html, /value="children"/);
  assert.match(html, /Overview · 观察自身/);
});

test("spot A3 consumes the host semantic zoom variable for every projection view", async () => {
  const suite = await buildSpotTerminalPluginSuite();
  assert.match(suite.element.entrySource, /--projection-zoom/);
  assert.match(suite.element.entrySource, /terminal-children/);
  assert.match(suite.element.entrySource, /terminal-embedded/);
  assert.match(suite.element.entrySource, /--projection-origin-x/);
  assert.match(suite.element.entrySource, /--projection-origin-y/);
  assert.match(suite.element.entrySource, /isolation:isolate/);
  assert.match(suite.element.entrySource, /z-index:20/);
});

test("market buy amount uses settlement unit while fills use trading unit", () => {
  const [buy, sell] = ordersState([
    { symbol: "BTC/USDT", direction: "BUY", type: "MARKET_PRICE" },
    { symbol: "BTC/USDT", direction: "SELL", type: "MARKET_PRICE" },
  ]);
  assert.deepEqual([buy.amountLabel, buy.amountUnit, buy.tradedUnit], ["结算金额", "USDT", "BTC"]);
  assert.deepEqual([sell.amountLabel, sell.amountUnit, sell.tradedUnit], ["委托数量", "BTC", "BTC"]);
});

test("one-sided depth updates preserve the opposite side", () => {
  const live = { bids: [{ price: 77 }], asks: [{ price: 79 }] };
  mergeDepth(live, { direction: "SELL", items: [{ price: 78 }] });
  assert.deepEqual(live, { bids: [{ price: 77 }], asks: [{ price: 78 }] });
  mergeDepth(live, { direction: "BUY", items: [] });
  assert.deepEqual(live, { bids: [], asks: [{ price: 78 }] });
});

test("order book is stable high-to-low with cumulative depth from the best price", () => {
  const asks = normalizeBook([
    { price: 101, amount: 1 }, { price: 103, amount: 3 }, { price: 102, amount: 2 },
  ], "asks");
  assert.deepEqual(asks.map((item) => item.price), [103, 102, 101]);
  assert.deepEqual(asks.map((item) => Math.round(item.depthPercent)), [100, 50, 17]);
  const bids = normalizeBook([
    { price: 99, amount: 3 }, { price: 101, amount: 1 }, { price: 100, amount: 2 },
  ], "bids");
  assert.deepEqual(bids.map((item) => item.price), [101, 100, 99]);
  assert.deepEqual(bids.map((item) => Math.round(item.depthPercent)), [17, 50, 100]);
});

test("STOMP close price increment preserves the stable ticker lastPrice contract", () => {
  assert.deepEqual(
    mergeTicker({ lastPrice: 78000, high: 78100, low: 77000 }, { close: 78060.72, change: 0.72 }),
    { lastPrice: 78060.72, high: 78100, low: 77000, close: 78060.72, change: 0.72 },
  );
  assert.equal(mergeTicker({ lastPrice: 78060.72 }, { volume: 12 }).lastPrice, 78060.72);
  assert.equal(mergeTicker({}, { close: 90, change: -10, chg: -10 }).change, -10);
});

test("latest All-in market history arrays normalize to the A3 candle contract", () => {
  assert.deepEqual(historyKlines([[120000, 100, 110, 90, 105, 12]]), [{
    time: 120000, openPrice: 100, highestPrice: 110, lowestPrice: 90,
    closePrice: 105, volume: 12, count: 0,
  }]);
});

test("backend K-line period metadata reaches the mobile period selector", () => {
  const state = bootstrapState({ defaultSymbol: "BTC/USDT", symbols: [{ symbol: "BTC/USDT" }],
    klinePeriods: DEFAULT_PERIODS });
  assert.equal(state.periods.length, 9);
  assert.deepEqual(periodOf(state.periods, "4hour"), DEFAULT_PERIODS[5]);
  const html = terminalView({ ...state, selectedPeriod: "15min", ticker: {} });
  assert.match(html, /aria-label="K线周期"/);
  assert.match(html, /data-period="15min" class="active">15m/);
  assert.match(html, /data-period="1mon" class="">1M/);
});

test("All-in pair precision and minimums normalize orders before submission", () => {
  const pair = { coinScale: 4, baseCoinScale: 2, minVolume: "0.01", minTurnover: "10" };
  assert.deepEqual(validateOrder({ symbol: "BTC/USDT", direction: "SELL", type: "LIMIT_PRICE", price: "12.345", amount: "0.012345" }, pair),
    { symbol: "BTC/USDT", direction: "SELL", type: "LIMIT_PRICE", price: "12.34", amount: "0.0123" });
  assert.deepEqual(validateOrder({ symbol: "BTC/USDT", direction: "BUY", type: "MARKET_PRICE", price: "", amount: "10.999" }, pair).amount, "10.99");
  assert.throws(() => validateOrder({ symbol: "BTC/USDT", direction: "BUY", type: "MARKET_PRICE", amount: "9.99" }, pair), /不能低于 10/);
});

test("All-in pair constraints reach the A3 numeric order controls", () => {
  const html = terminalView({ selectedSymbol: "BTC/USDT", symbols: [{ symbol: "BTC/USDT", coinScale: 4,
    baseCoinScale: 2, minVolume: "0.01", minTurnover: "10" }], draft: { direction: "BUY", type: "LIMIT_PRICE" } });
  assert.match(html, /<input type="number" min="0\.01" step="0\.01" name="price"/);
  assert.match(html, /<input type="number" min="0\.01" step="0\.0001" name="amount"/);
});

test("finalized STOMP kline merges by time without replacing the current last candle", () => {
  const current = [
    { time: 100, closePrice: 10, count: 4 },
    { time: 200, closePrice: 12, count: 3 },
  ];
  const merged = mergeKlines(current, [{ time: 100, closePrice: 11, count: 5 }]);
  assert.deepEqual(merged, [
    { time: 100, closePrice: 11, count: 5 },
    { time: 200, closePrice: 12, count: 3 },
  ]);
  assert.equal(mergeKlines(merged, [{ time: 200, closePrice: 9, count: 2 }]).at(-1).closePrice, 12);
});

test("STOMP K line remains until HTTP acknowledges the same or newer version", () => {
  const live = { klines: [{ time: 100, closePrice: 11, sourceStateVersion: 12 }] };
  acknowledgeKlines(live, []);
  assert.equal(live.klines.length, 1);
  acknowledgeKlines(live, [{ time: 100 }]);
  assert.equal(live.klines.length, 1);
  acknowledgeKlines(live, [{ time: 100, sourceStateVersion: 11 }]);
  assert.equal(live.klines.length, 1);
  acknowledgeKlines(live, [{ time: 100, sourceStateVersion: 12 }]);
  assert.deepEqual(live.klines, []);
});

test("versionless STOMP K line is acknowledged by the latest backend count", () => {
  const live = { klines: [{ time: 100, closePrice: 11, count: 5 }] };
  acknowledgeKlines(live, [{ time: 100, count: 4 }]);
  assert.equal(live.klines.length, 1);
  acknowledgeKlines(live, [{ time: 100, count: 5 }]);
  assert.deepEqual(live.klines, []);
});

test("latest All-in terminals do not synthesize candles from local trades", () => {
  const live = { marketSource: "ROUTED", trades: [], klines: [] };
  mergeMessage(live, "MESSAGE\ndestination:/topic/market/trade/BTC/USDT", JSON.stringify({
    time: 61000, price: 100, amount: 1,
  }));
  assert.equal(live.provisionalKline, undefined);
  assert.equal(live.trades.length, 1);
});

test("A3 exposes backend-routed market history", () => {
  const html = terminalView({ selectedSymbol: "BTC/USDT", selectedMarketSource: "ROUTED",
    symbols: [{ symbol: "BTC/USDT", marketSource: "ROUTED" }], ticker: {} });
  assert.match(html, /title="ROUTED"/);
});

test("one-minute chart rejects aggregate K lines multiplexed on the symbol topic", () => {
  assert.equal(acceptsKlinePeriod({ period: "1min" }), true);
  assert.equal(acceptsKlinePeriod({}), true);
  for (const period of ["5min", "10min", "15min", "30min", "1hour", "4hour", "1day", "1week", "1mon"])
    assert.equal(acceptsKlinePeriod({ period }), false);
  const live = { klines: [] }, head = "MESSAGE\ndestination:/topic/market/kline/BTC/USDT";
  mergeMessage(live, head, JSON.stringify({ time: 300, period: "5min", closePrice: 20 }));
  assert.deepEqual(live.klines, []);
  mergeMessage(live, head, JSON.stringify({ time: 60, period: "1min", closePrice: 10 }));
  assert.deepEqual(live.klines, [{ time: 60, period: "1min", closePrice: 10 }]);
  const fiveMinute = { period: "5min", klines: [] };
  mergeMessage(fiveMinute, head, JSON.stringify({ time: 300, period: "5min", closePrice: 12 }));
  assert.equal(fiveMinute.klines[0].closePrice, 12);
  assert.equal(acceptsKlinePeriod({ period: "1month" }, "1mon"), true);
});
