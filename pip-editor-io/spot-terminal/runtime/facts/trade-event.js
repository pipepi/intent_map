import { fact_node } from "./base.js";

export function trade_event_facts(terminal_id, state, account_id, pair_ids) {
  return (state.trades ?? []).map((trade) => {
    const symbol = trade.symbol ?? state.selectedSymbol;
    const event_key = trade.tradeId ?? trade.id ?? `${symbol}:${trade.time}:${trade.price}:${trade.amount}`;
    const links = [], pair_id = pair_ids.get(symbol);
    if (account_id) links.push({ role: "subject", target: account_id });
    if (pair_id) links.push({ role: "object", target: pair_id });
    return fact_node(terminal_id, "trade-event", event_key, trade, links);
  });
}

export const project_trade_event = (value) => ({ label: value.tradeId ?? value.id ?? "Trade Event", summary: `${value.price ?? "—"} × ${value.amount ?? "—"}`, value });
