import { fact_node } from "./base.js";

export const order_book_fact = (terminal_id, state, symbol, pair_id) => symbol
  ? fact_node(terminal_id, "order-book", symbol, { bids: state.bids ?? [], asks: state.asks ?? [] }, pair_id ? [{ role: "pair", target: pair_id }] : [])
  : undefined;

export const project_order_book = (value) => ({ label: "Order Book", summary: `${value.bids?.length ?? 0} bids · ${value.asks?.length ?? 0} asks`, value });
