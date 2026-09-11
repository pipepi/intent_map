import { graphNodes } from "../../../../pip-editor/pip/pip-model.ts";
import { account_fact } from "./account.js";
import { balance_facts } from "./balance.js";
import { constant, projection_id, projection_node, reference } from "./base.js";
import { daily_summary_fact } from "./daily-summary.js";
import { kline_facts } from "./kline.js";
import { order_book_fact } from "./order-book.js";
import { order_event_facts } from "./order-event.js";
import { pair_facts } from "./pair.js";
import { robot_fact } from "./robot.js";
import { trade_event_facts } from "./trade-event.js";

const default_frame = (index, mode) => mode === "world"
  ? { x: 70 + index % 3 * 280, y: 70 + Math.floor(index / 3) * 170, width: 240, height: 130, resizeMode: "simple" }
  : { x: 30 + index % 4 * 250, y: 56 + Math.floor(index / 4) * 150, width: 220, height: 118, resizeMode: "simple" };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const valid_frame = (value) => value && typeof value === "object" && !Array.isArray(value)
  && [value.x, value.y, value.width, value.height].every(Number.isFinite);
const frame_of = (pip) => {
  const nested = pip?.pips.find((item) => item.predicate_value?.predicate.node_id === "pip.projection.predicate.frame");
  return nested?.predicate_value?.value.kind === "const" && valid_frame(nested.predicate_value.value.value) ? nested.predicate_value.value.value : undefined;
};
const overlaps = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x
  && left.y < right.y + right.height && left.y + left.height > right.y;

const projection_by_definition = (graph, terminal_id, definition_id) => Object.values(graphNodes(graph)).find((node) =>
  node.pips.some((item) => item.predicate_value?.predicate.node_id === "pip.projection.predicate.observes" && item.predicate_value.value.kind === "ref" && item.predicate_value.value.target.node_id === terminal_id)
  && node.pips.some((item) => item.predicate_value?.predicate.node_id === "pip.projection.predicate.uses" && item.predicate_value.value.kind === "ref" && item.predicate_value.value.target.node_id === definition_id));
const fact_kind = (node) => node.pips.find((item) => item.predicate_value?.predicate.node_id === "pip.core.type" && item.predicate_value.value.kind === "ref")?.predicate_value?.value.target.node_id.replace("spot.terminal.type.", "");

const composed_projection = (source, facts, mode) => {
  const targets = new Set(facts.map((node) => projection_id(node.id, "simple")));
  const current = new Map(source.pips.flatMap((item) => item.predicate_value?.predicate.node_id === "pip.projection.predicate.presents"
    && item.predicate_value.value.kind === "ref" && targets.has(item.predicate_value.value.target.node_id) ? [[item.predicate_value.value.target.node_id, item]] : []));
  const reserved = [...current.values()].map(frame_of).filter(Boolean);
  let cursor = 0;
  const presentations = facts.map((node) => {
    const target_id = projection_id(node.id, "simple"), existing = current.get(target_id);
    if (frame_of(existing)) return existing;
    let next_frame = default_frame(cursor++, mode);
    while (reserved.some((item) => overlaps(item, next_frame))) next_frame = default_frame(cursor++, mode);
    reserved.push(next_frame);
    return reference(`presents:${target_id}`, "pip.projection.predicate.presents", target_id, [
      constant(`frame:${target_id}`, "pip.projection.predicate.frame", next_frame),
    ]);
  });
    return { ...source, pips: [
            ...source.pips.filter((item) => !["pip.projection.predicate.presents", "pip.projection.predicate.child-predicate"].includes(item.predicate_value?.predicate.node_id)),
            reference("child-predicate", "pip.projection.predicate.child-predicate", "spot.terminal.predicate.contains"), ...presentations,
        ] };
};
const put_changed = (operations, graph, node) => {
    if (!same(graphNodes(graph)[node.id], node))
        operations.push({ op: "put", parent_path: [], pip: node });
};
const ensure_projection = (operations, graph, node) => {
    const current = graphNodes(graph)[node.id];
    if (!current)
        return operations.push({ op: "put", parent_path: [], pip: node });
    const authority = new Set(["pip.core.identity", "pip.core.type", "pip.projection.predicate.observes", "pip.projection.predicate.uses"]);
    const merged = { ...current, pips: [...current.pips.filter((item) => !authority.has(item.predicate_value?.predicate.node_id)), ...node.pips] };
    if (!same(current, merged))
        operations.push({ op: "put", parent_path: [], pip: merged });
};
export function reconcile_facts(graph, terminal_id, state) {
    const account = account_fact(terminal_id, state), pairs = pair_facts(terminal_id, state);
    // 每类 reconciler 使用稳定业务键；快照中消失的节点会在本轮末尾统一淘汰。
    const facts = [account.node, ...balance_facts(terminal_id, state, account.account_id, account.account_key), ...pairs.nodes,
    order_book_fact(terminal_id, state, pairs.symbol, pairs.pair_id), daily_summary_fact(terminal_id, state, pairs.symbol, pairs.pair_id),
    ...kline_facts(terminal_id, state, pairs.symbol, pairs.pair_id), ...order_event_facts(terminal_id, state, account.account_id, pairs.pair_ids),
    ...trade_event_facts(terminal_id, state, account.account_id, pairs.pair_ids), robot_fact(terminal_id, state)].filter(Boolean);
    const desired_ids = new Set(facts.flatMap((node) => [node.id, projection_id(node.id, "simple"), projection_id(node.id, "detail")]));
    const operations = [];
    for (const node of facts) {
        const kind = fact_kind(node);
        put_changed(operations, graph, node);
        ensure_projection(operations, graph, projection_node(node.id, kind, "simple"));
        ensure_projection(operations, graph, projection_node(node.id, kind, "detail"));
    }
    const terminal = graphNodes(graph)[terminal_id];
    const next_terminal = { ...terminal, pips: [
            ...terminal.pips.filter((item) => item.predicate_value?.predicate.node_id !== "spot.terminal.predicate.contains"),
            ...facts.map((node, index) => reference(`contains:${index}`, "spot.terminal.predicate.contains", node.id)),
        ] };
    put_changed(operations, graph, next_terminal);
    const flow = projection_by_definition(graph, terminal_id, "spot.terminal.projection.children");
    const world = projection_by_definition(graph, terminal_id, "spot.terminal.projection.world-events");
    if (flow)
        put_changed(operations, graph, composed_projection(flow, facts, "flow"));
    if (world)
        put_changed(operations, graph, composed_projection(world, facts, "world"));
    const stale_ids = Object.keys(graphNodes(graph)).filter((id) => id.startsWith(`${terminal_id}:fact:`) && !desired_ids.has(id));
    for (const node_id of stale_ids)
        operations.push({ op: "remove", parent_path: [], pip_id: node_id });
    return { operations, facts };
}
