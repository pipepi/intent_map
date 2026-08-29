import { fact_node } from "./base.js";

export function kline_facts(terminal_id, state, symbol, pair_id) {
  if (!symbol) return [];
  const links = pair_id ? [{ role: "pair", target: pair_id }] : [];
  return (state.klines ?? []).map((row) => {
    const time = row.time ?? row.openTime ?? row[0];
    return fact_node(terminal_id, "kline", `${symbol}:${state.selectedPeriod ?? "1min"}:${time}`, row, links);
  });
}

export const project_kline = (value) => ({ label: `Kline ${value.time ?? value.openTime ?? value[0] ?? ""}`.trim(), value });
