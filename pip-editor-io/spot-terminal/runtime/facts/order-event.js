import { fact_node } from "./base.js";

export function order_event_facts(terminal_id, state, account_id, pair_ids) {
  return (state.orders ?? []).map((order) => {
    const event_key = order.orderId ?? order.id ?? `${order.symbol}:${order.time}:${order.direction}:${order.price}`;
    const links = [], pair_id = pair_ids.get(order.symbol);
    if (account_id) links.push({ role: "subject", target: account_id });
    if (pair_id) links.push({ role: "object", target: pair_id });
    return fact_node(terminal_id, "order-event", event_key, order, links);
  });
}

export const project_order_event = (value) => ({ label: value.orderId ?? value.id ?? "Order Event", summary: value.status ?? value.direction, value });
