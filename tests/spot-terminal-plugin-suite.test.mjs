import assert from "node:assert/strict";
import test from "node:test";
import { decodeElementPackage } from "../pip-editor/relation-host/packages/element-package.ts";
import { decodeNodeTypePackage, validateNodeTypeDependencies } from "../pip-editor/relation-host/packages/node-type-package.ts";
import { importPip } from "../pip-editor/relation-host/packages/import-pip.ts";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";
import { mergeKlines, mergeTicker, normalizeBook, ordersState } from "../pip-editor-io/spot-terminal/runtime/normalize.js";
import { mergeDepth } from "../pip-editor-io/spot-terminal/runtime/stomp.js";
import { availableBotModes, randomBotOrder } from "../pip-editor-io/spot-terminal/runtime/bot.js";

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
