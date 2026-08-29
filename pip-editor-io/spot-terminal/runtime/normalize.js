import { periodsOf } from "./periods.js";

const array = (value) => Array.isArray(value) ? value : [];
export const klineState = (value) => array(
  Array.isArray(value) ? value : value?.items ?? value?.records ?? value?.content ?? value?.data
);
export const historyKlines = (value) => array(value).map((row) => Array.isArray(row) ? ({
  time: row[0], openPrice: row[1], highestPrice: row[2], lowestPrice: row[3],
  closePrice: row[4], volume: row[5], count: 0,
}) : row);
export function normalizeBook(value, side) {
  const rows = array(value).map((item) => ({ ...item }));
  const priority = [...rows].sort((left, right) => side === "asks"
    ? Number(left.price) - Number(right.price) : Number(right.price) - Number(left.price));
  const total = priority.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  let running = 0; const depths = new Map();
  for (const item of priority) {
    running += Number(item.amount || 0);
    depths.set(String(item.price), total > 0 ? running * 100 / total : 0);
  }
  // Both sides display high-to-low; asks therefore place the best ask nearest the bids.
  return rows.sort((left, right) => Number(right.price) - Number(left.price))
    .map((item) => ({ ...item, depthPercent: depths.get(String(item.price)) ?? 0 }));
}
export const bootstrapState = (data) => ({
  member: data?.member ?? null, symbols: array(data?.symbols), wallets: array(data?.wallets),
  periods: periodsOf(data?.klinePeriods),
  selectedSymbol: data?.defaultSymbol ?? data?.symbols?.[0]?.symbol ?? "",
});
export const marketState = (data) => ({
  ticker: data?.ticker ?? {}, bids: normalizeBook(data?.bids, "bids"), asks: normalizeBook(data?.asks, "asks"), trades: array(data?.trades),
});
export const ordersState = (data) => array(data).map((order) => {
  const [tradingUnit = "", settlementUnit = ""] = String(order.symbol ?? "").split("/");
  const marketBuy = order.type === "MARKET_PRICE" && order.direction === "BUY";
  return { ...order, amountUnit: marketBuy ? settlementUnit : tradingUnit,
    amountLabel: marketBuy ? "结算金额" : "委托数量", tradedUnit: tradingUnit };
});
export const mergeTicker = (current = {}, thumb = {}) => ({
  ...current, ...thumb,
  lastPrice: thumb.lastPrice ?? thumb.close ?? current.lastPrice ?? current.close,
  high: thumb.high ?? current.high,
  low: thumb.low ?? current.low,
  // The current All-in contract exposes `change` as an absolute delta and
  // `chg` as an already-calculated percentage in both REST and STOMP.
  change: thumb.changePercent ?? thumb.chg ?? thumb.change ?? current.change,
});
const currentBucket = (time, durationMs, now = Date.now()) => {
  const open = Math.floor(now / durationMs) * durationMs;
  // INTERNAL uses bucket close while Binance uses bucket open.
  return Number(time) === open || Number(time) === open + durationMs;
};
export function mergeKlines(current, updates, durationMs = 60000, now = Date.now()) {
  const rows = new Map(array(current).map((row) => [Number(row.time), row]));
  for (const update of array(updates)) {
    const key = Number(update?.time); if (!Number.isFinite(key)) continue;
    const existing = rows.get(key), oldCount = Number(existing?.count ?? 0), newCount = Number(update?.count ?? 0);
    if (!existing || newCount >= oldCount) rows.set(key, currentBucket(key, durationMs, now) && existing
      ? monotonicOpenKline(existing, update) : { ...existing, ...update });
  }
  return [...rows.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-200);
}
export function mergeSnapshotKlines(previous, incoming, now = Date.now(), durationMs = 60000) {
  const rows = new Map(array(incoming).map((row) => [Number(row.time), { ...row }]));
  const oldCurrent = array(previous).find((row) => currentBucket(row.time, durationMs, now));
  if (oldCurrent) {
    const key = Number(oldCurrent.time), fresh = rows.get(key);
    rows.set(key, fresh ? monotonicOpenKline(oldCurrent, fresh) : { ...oldCurrent });
  }
  return [...rows.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-200);
}
function monotonicOpenKline(previous, incoming) {
  const oldCount = Number(previous.count ?? 0), newCount = Number(incoming.count ?? 0);
  const freshest = newCount > oldCount ? incoming : previous;
  return { ...previous, ...incoming,
    openPrice: oldCount > 0 ? previous.openPrice : incoming.openPrice,
    highestPrice: Math.max(Number(previous.highestPrice), Number(incoming.highestPrice)),
    lowestPrice: Math.min(Number(previous.lowestPrice), Number(incoming.lowestPrice)),
    closePrice: freshest.closePrice,
    volume: Math.max(Number(previous.volume ?? 0), Number(incoming.volume ?? 0)),
    turnover: Math.max(Number(previous.turnover ?? 0), Number(incoming.turnover ?? 0)),
    count: Math.max(oldCount, newCount),
  };
}
export function mergeProvisionalKline(current, provisional) {
  if (!provisional) return current;
  const rows = new Map(array(current).map((row) => [Number(row.time), { ...row }]));
  const existing = rows.get(Number(provisional.time));
  // The live overlay replaces an empty server placeholder and otherwise only
  // extends its price range; this makes repeated HTTP refreshes idempotent.
  rows.set(Number(provisional.time), !existing || Number(existing.count ?? 0) === 0
    ? { ...provisional } : { ...existing,
      highestPrice: Math.max(Number(existing.highestPrice), Number(provisional.highestPrice)),
      lowestPrice: Math.min(Number(existing.lowestPrice), Number(provisional.lowestPrice)),
      closePrice: provisional.closePrice,
    });
  return [...rows.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-200);
}
export const mergeLive = (state, live) => ({
  ...state,
  ticker: live.thumb ? mergeTicker(state.ticker, live.thumb) : state.ticker,
  trades: live.trades?.length ? live.trades.slice(-80).reverse() : state.trades,
  bids: live.bids ? normalizeBook(live.bids, "bids") : state.bids,
  asks: live.asks ? normalizeBook(live.asks, "asks") : state.asks,
  klines: mergeProvisionalKline(
    live.klines?.length ? mergeKlines(state.klines, live.klines, live.durationMs) : state.klines,
    live.provisionalKline
  ),
});
