import * as api from "./http.js";
import { bootstrapState, marketState, ordersState } from "./normalize.js";

export async function loadTerminal(base, token, selectedSymbol) {
  const bootstrap = await api.bootstrap(base, token), baseState = bootstrapState(bootstrap);
  const symbol = selectedSymbol || baseState.selectedSymbol;
  if (!symbol) return { ...baseState, selectedSymbol: "", orders: [], klines: [], bids: [], asks: [], trades: [], ticker: {} };
  const [market, klines, orders] = await Promise.all([
    api.market(base, token, symbol), api.klines(base, token, symbol), api.orders(base, token, symbol),
  ]);
  return { ...baseState, selectedSymbol: symbol, ...marketState(market), klines: klines ?? [], orders: ordersState(orders) };
}
