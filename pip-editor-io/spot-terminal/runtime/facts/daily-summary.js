import { fact_node } from "./base.js";

export const daily_summary_fact = (terminal_id, state, symbol, pair_id) => symbol
  ? fact_node(terminal_id, "daily-summary", symbol, state.ticker ?? {}, pair_id ? [{ role: "pair", target: pair_id }] : [])
  : undefined;

export const project_daily_summary = (value) => ({ label: "Daily Summary", summary: String(value.lastPrice ?? value.close ?? "—"), value });
