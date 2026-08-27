import * as api from "./http.js";
import { bootstrapState, historyKlines, marketState, ordersState } from "./normalize.js";
import { periodOf } from "./periods.js";

export async function loadTerminal(base, token, selectedSymbol, selectedPeriod = "1min") {
  const bootstrap = await api.bootstrap(base, token), baseState = bootstrapState(bootstrap);
  // The public history endpoint owns INTERNAL/BINANCE routing. Keeping that
  // decision behind the backend avoids browser CORS access to monitor APIs.
  baseState.symbols = baseState.symbols.map((pair) => ({ ...pair, marketSource: "ROUTED" }));
  const symbol = selectedSymbol || baseState.selectedSymbol;
  if (!symbol) return { ...baseState, selectedSymbol: "", orders: [], klines: [], bids: [], asks: [], trades: [], ticker: {} };
  const period = periodOf(baseState.periods, selectedPeriod), marketSource = "ROUTED", now = Date.now();
  const klineRequest = api.marketHistory(base, symbol, now - 200 * period.durationMs, now + period.durationMs, period.resolution);
  const [market, klines, orders] = await Promise.all([
    api.market(base, token, symbol), klineRequest, api.orders(base, token, symbol),
  ]);
  return { ...baseState, selectedSymbol: symbol, selectedPeriod: period.id, selectedMarketSource: marketSource,
    ...marketState(market), klines: historyKlines(klines), orders: ordersState(orders) };
}
