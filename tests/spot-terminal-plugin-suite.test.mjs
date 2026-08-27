import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage } from "../pip-editor/relation-host/packages/element-package.ts";
import { decodeNodeTypePackage, validateNodeTypeDependencies } from "../pip-editor/relation-host/packages/node-type-package.ts";
import { importPip } from "../pip-editor/relation-host/packages/import-pip.ts";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";
import { bootstrapState, historyKlines, klineState, mergeKlines, mergeProvisionalKline, mergeSnapshotKlines, mergeTicker, normalizeBook, ordersState } from "../pip-editor-io/spot-terminal/runtime/normalize.js";
import { DEFAULT_PERIODS, periodOf } from "../pip-editor-io/spot-terminal/runtime/periods.js";
import { chart } from "../pip-editor-io/spot-terminal/elements/chart.js";
import { terminalView } from "../pip-editor-io/spot-terminal/elements/render.js";
import { captureSellScroll, restoreSellScroll } from "../pip-editor-io/spot-terminal/elements/book-scroll.js";
import { fuseState } from "../pip-editor-io/spot-terminal/runtime/fusion.js";
import { acceptsKlinePeriod, acknowledgeKlines, mergeDepth, mergeMessage } from "../pip-editor-io/spot-terminal/runtime/stomp.js";
import { availableBotModes, nextBotDelay, randomBotOrder } from "../pip-editor-io/spot-terminal/runtime/bot.js";
import { validateOrder } from "../pip-editor-io/spot-terminal/runtime/validation.js";

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
});

test("sell book opens at the best ask and preserves deliberate upward scrolling", () => {
  const initial = { scrollHeight: 300, clientHeight: 100, scrollTop: 0 };
  restoreSellScroll(initial, null);
  assert.equal(initial.scrollTop, 200);
  const pinned = captureSellScroll(initial);
  const updated = { scrollHeight: 340, clientHeight: 100, scrollTop: 0 };
  restoreSellScroll(updated, pinned);
  assert.equal(updated.scrollTop, 240);
  const inspecting = { scrollHeight: 340, clientHeight: 100, scrollTop: 70 };
  const position = captureSellScroll(inspecting);
  restoreSellScroll(inspecting, position);
  assert.equal(inspecting.scrollTop, 70);
});

test("live one-minute candle persistently overlays empty HTTP placeholders", () => {
  const base = [{ time: 120000, openPrice: 100, highestPrice: 100, lowestPrice: 100, closePrice: 100, volume: 0, turnover: 0, count: 0 }];
  const provisional = {
    time: 120000, openPrice: 101, highestPrice: 101, lowestPrice: 99,
    closePrice: 99, volume: 3, turnover: 301, count: 2,
  };
  assert.deepEqual(mergeProvisionalKline(base, provisional)[0], provisional);
  assert.deepEqual(mergeProvisionalKline(base, provisional)[0], provisional);
});

test("HTTP refresh is fused with live candle before a single UI state is published", () => {
  const placeholder = { time: 120000, openPrice: 100, highestPrice: 100, lowestPrice: 100, closePrice: 100, count: 0 };
  const provisional = { time: 120000, openPrice: 101, highestPrice: 102, lowestPrice: 99, closePrice: 102, count: 3 };
  const live = { provisionalKline: provisional, klines: [] };
  assert.deepEqual(fuseState({ klines: [placeholder], ticker: {}, trades: [], bids: [], asks: [] }, live).klines[0], provisional);
});

test("open candle high and low never shrink across an HTTP refresh", () => {
  const now = 61000, time = 120000;
  const previous = [{ time, openPrice: 100, highestPrice: 110, lowestPrice: 90, closePrice: 105, volume: 8, turnover: 800, count: 8 }];
  const incoming = [{ time, openPrice: 102, highestPrice: 107, lowestPrice: 95, closePrice: 103, volume: 5, turnover: 500, count: 5 }];
  assert.deepEqual(mergeSnapshotKlines(previous, incoming, now)[0], previous[0]);
  const newer = [{ ...incoming[0], highestPrice: 112, lowestPrice: 94, closePrice: 111, volume: 9, turnover: 900, count: 9 }];
  assert.deepEqual(mergeSnapshotKlines(previous, newer, now)[0], {
    ...newer[0], openPrice: 100, highestPrice: 112, lowestPrice: 90,
  });
});

test("K line response wrappers and flat-price candles remain visible", () => {
  const row = { time: 100, openPrice: 78810.21, highestPrice: 78810.21, lowestPrice: 78810.21, closePrice: 78810.21 };
  assert.deepEqual(klineState({ records: [row] }), [row]);
  const svg = chart([row]);
  assert.match(svg, /<rect/);
  assert.doesNotMatch(svg, /y="24"[^>]*height="1"/);
});

test("random bot covers four modes with the requested currency ranges", () => {
  const state = { selectedSymbol: "BTC/USDT", bids: [{ price: 77 }], asks: [{ price: 79 }], ticker: { lastPrice: 78 } };
  const make = (mode, amount) => randomBotOrder(state, (() => { const values = [mode, amount]; return () => values.shift(); })());
  const orders = [make(0, 0), make(0.3, 1), make(0.55, 0), make(0.8, 1)];
  assert.deepEqual(orders.map(({ direction, type }) => [direction, type]), [
    ["BUY", "LIMIT_PRICE"], ["BUY", "MARKET_PRICE"], ["SELL", "LIMIT_PRICE"], ["SELL", "MARKET_PRICE"],
  ]);
  assert.equal(Number(orders[0].amount), 0.01);
  assert.equal(Number(orders[1].amount), 100);
  assert.equal(Number(orders[2].amount), 0.01);
  assert.equal(Number(orders[3].amount), 0.1);
  assert.equal(orders[0].price, "79.00000000");
  assert.equal(orders[2].price, "77.00000000");
});

test("bot liquidity guards and manual side override constrain eligible modes", () => {
  const state = { bids: [{ price: 77 }], asks: [] };
  assert.deepEqual(availableBotModes(state), [
    ["BUY", "LIMIT_PRICE"], ["SELL", "LIMIT_PRICE"], ["SELL", "MARKET_PRICE"],
  ]);
  assert.deepEqual(availableBotModes({ ...state, botSide: "BUY" }), [["BUY", "LIMIT_PRICE"]]);
  assert.deepEqual(availableBotModes({ bids: [], asks: [{ price: 79 }], botSide: "SELL" }), [["SELL", "LIMIT_PRICE"]]);
  assert.deepEqual(availableBotModes({ ...state, asks: [{ price: 79 }], botSide: "BUY" }), [
    ["BUY", "LIMIT_PRICE"], ["BUY", "MARKET_PRICE"],
  ]);
  assert.deepEqual(availableBotModes({ ...state, asks: [{ price: 79 }], botType: "LIMIT_PRICE" }), [
    ["BUY", "LIMIT_PRICE"], ["SELL", "LIMIT_PRICE"],
  ]);
  assert.deepEqual(availableBotModes({ ...state, botType: "MARKET_PRICE" }), [["SELL", "MARKET_PRICE"]]);
  assert.deepEqual(availableBotModes({ bids: [], asks: [], botSide: "BUY", botType: "MARKET_PRICE" }), []);
  assert.throws(
    () => randomBotOrder({ selectedSymbol: "BTC/USDT", bids: [], asks: [], botSide: "BUY", botType: "MARKET_PRICE" }),
    /等待市价单所需的对手盘/,
  );
});

test("bot speed mode uses normal and rapid randomized delay ranges", () => {
  assert.equal(nextBotDelay(false, () => 0), 2000);
  assert.equal(nextBotDelay(false, () => 1), 5000);
  assert.equal(nextBotDelay(true, () => 0), 200);
  assert.equal(nextBotDelay(true, () => 1), 500);
});

test("limit bot fallback price randomizes one percent around the latest trade", () => {
  const state = { selectedSymbol: "BTC/USDT", bids: [], asks: [], ticker: { lastPrice: 100 }, botSide: "BUY", botType: "LIMIT_PRICE" };
  const orderAt = (priceRandom) => randomBotOrder(state, (() => {
    const values = [0, 0.5, priceRandom]; return () => values.shift();
  })());
  assert.equal(orderAt(0).price, "99.00000000");
  assert.equal(orderAt(1).price, "101.00000000");
});
