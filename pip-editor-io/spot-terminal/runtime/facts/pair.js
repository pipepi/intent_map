import { fact_id, fact_node } from "./base.js";

export function pair_facts(terminal_id, state) {
  const nodes = [], pair_ids = new Map();
  for (const pair of state.symbols ?? []) {
    const symbol = pair.symbol ?? "unknown", node = fact_node(terminal_id, "pair", symbol, pair);
    nodes.push(node); pair_ids.set(symbol, node.id);
  }
  const symbol = state.selectedSymbol ?? state.symbol;
  const pair_id = symbol ? pair_ids.get(symbol) ?? fact_id(terminal_id, "pair", symbol) : undefined;
  if (symbol && !pair_ids.has(symbol)) {
    nodes.push(fact_node(terminal_id, "pair", symbol, { symbol })); pair_ids.set(symbol, pair_id);
  }
  return { nodes, pair_ids, pair_id, symbol };
}

export const project_pair = (value) => ({ label: value.symbol ?? "Pair", value });
