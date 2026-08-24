const array = (value) => Array.isArray(value) ? value : [];
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
});
export function mergeKlines(current, updates) {
  const rows = new Map(array(current).map((row) => [Number(row.time), row]));
  for (const update of array(updates)) {
    const key = Number(update?.time); if (!Number.isFinite(key)) continue;
    const existing = rows.get(key), oldCount = Number(existing?.count ?? 0), newCount = Number(update?.count ?? 0);
    if (!existing || newCount >= oldCount) rows.set(key, { ...existing, ...update });
  }
  return [...rows.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-200);
}
export const mergeLive = (state, live) => ({
  ...state,
  ticker: live.thumb ? mergeTicker(state.ticker, live.thumb) : state.ticker,
  trades: live.trades?.length ? live.trades.slice(-80).reverse() : state.trades,
  bids: live.bids ? normalizeBook(live.bids, "bids") : state.bids,
  asks: live.asks ? normalizeBook(live.asks, "asks") : state.asks,
  klines: live.klines?.length ? mergeKlines(state.klines, live.klines) : state.klines,
});
