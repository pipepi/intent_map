import assert from "node:assert/strict";
import test from "node:test";
import { chart } from "../pip-editor-io/spot-terminal/elements/chart.js";
import { captureSellScroll, restoreSellScroll } from "../pip-editor-io/spot-terminal/elements/book-scroll.js";
import { availableBotModes, nextBotDelay, randomBotOrder } from "../pip-editor-io/spot-terminal/runtime/bot.js";
import { fuseState } from "../pip-editor-io/spot-terminal/runtime/fusion.js";
import { klineState, mergeProvisionalKline, mergeSnapshotKlines } from "../pip-editor-io/spot-terminal/runtime/normalize.js";
import { mergeMessage } from "../pip-editor-io/spot-terminal/runtime/stomp.js";

test("Binance open-time and internal close-time current candles both merge monotonically", () => {
  const now = 125000, open = 120000, close = 180000;
  const previous = (time) => [{ time, openPrice: 100, highestPrice: 110, lowestPrice: 90,
    closePrice: 105, volume: 8, turnover: 800, count: 8 }];
  const stale = (time) => [{ time, openPrice: 102, highestPrice: 107, lowestPrice: 95,
    closePrice: 103, volume: 5, turnover: 500, count: 5 }];
  assert.deepEqual(mergeSnapshotKlines(previous(open), stale(open), now)[0], previous(open)[0]);
  assert.deepEqual(mergeSnapshotKlines(previous(close), stale(close), now)[0], previous(close)[0]);
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

test("guard mode passively replenishes the weaker book side without crossing", () => {
  const base = { selectedSymbol: "BTC/USDT", botGuard: true, botType: "MARKET_PRICE", ticker: { lastPrice: 78 } };
  const buy = randomBotOrder({ ...base, bids: [{ price: 77, amount: 0.1 }], asks: [{ price: 79, amount: 0.3 }] }, () => 0);
  assert.deepEqual([buy.direction, buy.type, buy.amount], ["BUY", "LIMIT_PRICE", "0.01000000"]);
  assert.ok(Number(buy.price) < 77);
  const sell = randomBotOrder({ ...base, bids: [{ price: 77, amount: 0.4 }], asks: [{ price: 79, amount: 0.1 }] }, () => 0);
  assert.deepEqual([sell.direction, sell.type], ["SELL", "LIMIT_PRICE"]);
  assert.ok(Number(sell.price) > 79);
  const forced = randomBotOrder({ ...base, botSide: "SELL", bids: [], asks: [{ price: 79, amount: 9 }] }, () => 0);
  assert.equal(forced.direction, "SELL");
});

test("limit bot fallback price randomizes one percent around the latest trade", () => {
  const state = { selectedSymbol: "BTC/USDT", bids: [], asks: [], ticker: { lastPrice: 100 }, botSide: "BUY", botType: "LIMIT_PRICE" };
  const orderAt = (priceRandom) => randomBotOrder(state, (() => {
    const values = [0, 0.5, priceRandom]; return () => values.shift();
  })());
  assert.equal(orderAt(0).price, "99.00000000");
  assert.equal(orderAt(1).price, "101.00000000");
});

test("shared thumb topic ignores scalar updates for another symbol", () => {
  const live = { symbol: "BTC/USDT", thumb: { symbol: "BTC/USDT", close: 79722.4 } };
  const head = "MESSAGE\ndestination:/topic/market/thumb";
  mergeMessage(live, head, JSON.stringify({ symbol: "XRP/USDT", close: 1.4295 }));
  assert.deepEqual(live.thumb, { symbol: "BTC/USDT", close: 79722.4 });
  mergeMessage(live, head, JSON.stringify({ symbol: "BTC/USDT", close: 79730 }));
  assert.equal(live.thumb.close, 79730);
});
