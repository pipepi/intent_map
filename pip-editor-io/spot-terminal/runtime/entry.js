import { terminalCreator } from "./creator.js";
import * as commands from "./commands.js";
import { configOf, stateOf } from "./state.js";
import { scalar, target } from "./selectors.js";
import { withWindowChrome } from "./window-chrome.js";
import { validate_spot_projections } from "./projection-validation.js";
import { project_account } from "./facts/account.js";
import { project_balance } from "./facts/balance.js";
import { project_daily_summary } from "./facts/daily-summary.js";
import { project_kline } from "./facts/kline.js";
import { project_order_book } from "./facts/order-book.js";
import { project_order_event } from "./facts/order-event.js";
import { project_pair } from "./facts/pair.js";
import { project_robot } from "./facts/robot.js";
import { project_trade_event } from "./facts/trade-event.js";

const definitions = {
  detail: "spot.terminal.projection.workspace", simple: "spot.terminal.projection.simple",
  flow: "spot.terminal.projection.children", world: "spot.terminal.projection.world-events",
};
const fact_types = ["account", "balance", "pair", "order-book", "daily-summary", "kline", "robot", "order-event", "trade-event"];
const fact_projectors = { account: project_account, balance: project_balance, pair: project_pair, "order-book": project_order_book,
  "daily-summary": project_daily_summary, kline: project_kline, robot: project_robot, "order-event": project_order_event, "trade-event": project_trade_event };
const element = (element_id) => ({ pluginId: "official.spot-terminal-elements", elementId: element_id });
const definition_of = (node) => target(node, "relation.projection.predicate.uses")?.nodeId;
const type_of = (node) => target(node, "relation.core.type")?.nodeId;
const observed = (projection_node, graph) => graph.nodes[target(projection_node, "relation.projection.predicate.observes")?.nodeId];
const options_for = (graph, observed_node_id, current_projection) => {
  const dive_target = target(current_projection, "relation.projection.predicate.dives-into")?.nodeId;
  return Object.values(graph.nodes).flatMap((node) => {
    if (target(node, "relation.projection.predicate.observes")?.nodeId !== observed_node_id) return [];
    const definition = definition_of(node), labels = {
      [definitions.detail]: ["Detail · 观察自身", "self"], [definitions.simple]: ["Simple · 观察自身", "self"],
      [definitions.flow]: ["Flow · 观察子级", "children"], [definitions.world]: ["World Events · 观察子级", "children"],
    };
    const fact_match = definition?.match(/^spot\.terminal\.projection\.(.+)-(simple|detail)$/);
    const option = labels[definition] ?? (fact_match ? [`${fact_match[2] === "simple" ? "Simple" : "Detail"} · 观察自身`, "self"] : undefined);
    return option ? [{ projectionNodeId: node.id, observedNodeId: observed_node_id, label: option[0], scope: option[1], semanticTarget: dive_target === node.id }] : [];
  });
};
const composition_items = (projection_node, graph) => projection_node.relations.flatMap((relation) => {
  if (relation.predicate.nodeId !== "relation.projection.predicate.presents" || relation.object.kind !== "ref") return [];
  const child_projection = graph.nodes[relation.object.target.nodeId], child = child_projection && observed(child_projection, graph);
  const frame_relation = relation.relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.frame");
  return child && frame_relation?.object.kind === "const" ? [{ projectionNodeId: child_projection.id, observedNodeId: child.id, frame: frame_relation.object.value }] : [];
});

const projection = (id, name, scope, surfaces, element_id, project) => ({
  id, name, icon: ({ [definitions.detail]: "↗", [definitions.simple]: "▣", [definitions.flow]: "⇄", [definitions.world]: "◎" })[id] ?? (id.endsWith("-simple") ? "▣" : "↗"),
  purpose: "workspace", definition: { nodeId: id, relationId: "identity" }, scope, surfaces,
  windowChrome: element_id === "terminal" ? "plugin" : "host", zoomViewport: { top: element_id === "terminal" ? 36 : 0, right: 0, bottom: 0, left: 0 },
  matches(node) { return definition_of(node) === id; }, project, element: element(element_id),
});

export default function register(host) {
  const releases = [];
  releases.push(host.registerType({ type: { nodeId: "spot.terminal.type.workspace", relationId: "identity" }, name: "Spot Terminal",
    matches(node) { return type_of(node) === "spot.terminal.type.workspace"; }, label: () => "AEX Spot Terminal",
    projectionDefaults: { selfEmbedded: definitions.simple, childrenWorkspace: definitions.flow } }));
  for (const kind of fact_types) releases.push(host.registerType({ type: { nodeId: `spot.terminal.type.${kind}`, relationId: "identity" }, name: kind,
    matches(node) { return type_of(node) === `spot.terminal.type.${kind}`; }, label(node) { return String(scalar(node, "spot.terminal.predicate.fact-value", {})?.symbol ?? kind); },
    projectionDefaults: { selfEmbedded: `spot.terminal.projection.${kind}-simple`, childrenWorkspace: definitions.flow } }));
  releases.push(host.registerProjection(projection(definitions.detail, "Spot Detail", "self", ["workspace", "embedded"], "terminal", ({ observedNode, projectionNode, workspaceView, graph, context }) => {
    const state = { ...stateOf(observedNode), ...configOf(observedNode), viewKind: "detail", runtimeActive: context.surface === "workspace" };
    return context.surface === "workspace" ? withWindowChrome(state, workspaceView, projectionNode.id, "Spot Detail", options_for(graph, observedNode.id, projectionNode)) : state;
  })));
  releases.push(host.registerProjection(projection(definitions.simple, "Spot Simple", "self", ["workspace", "embedded"], "terminal-simple", ({ observedNode, projectionNode, workspaceView, graph, context }) => {
    const state = { ...stateOf(observedNode), ...configOf(observedNode), viewKind: "simple" };
    return context.surface === "workspace" ? withWindowChrome(state, workspaceView, projectionNode.id, "Spot Simple", options_for(graph, observedNode.id, projectionNode)) : state;
  })));
  for (const [kind, name] of [["flow", "Spot Flow"], ["world", "Spot World Events"]]) releases.push(host.registerProjection(projection(definitions[kind], name, "children", ["workspace"], "composition", ({ projectionNode, graph }) => ({ viewKind: kind, items: composition_items(projectionNode, graph) }))));
  for (const kind of fact_types) for (const style of ["simple", "detail"]) releases.push(host.registerProjection(projection(
    `spot.terminal.projection.${kind}-${style}`, `${kind} ${style === "simple" ? "Simple" : "Detail"}`, "self", ["workspace", "embedded"], "fact",
    ({ observedNode, context }) => ({ observedNodeId: observedNode.id, kind, ...fact_projectors[kind](scalar(observedNode, "spot.terminal.predicate.fact-value", {})), viewKind: style, surface: context.surface }),
  )));
  const command_names = [["login", "login"], ["select-symbol", "selectSymbol"], ["select-period", "selectPeriod"], ["submit", "submitOrder"], ["cancel", "cancelOrder"], ["sync", "sync"], ["draft", "draft"], ["bot-toggle", "toggleBot"], ["bot-fast", "toggleBotFast"], ["bot-guard", "toggleBotGuard"], ["bot-side", "setBotSide"], ["bot-type", "setBotType"], ["switch-environment", "switchEnvironment"], ["logout", "logout"]];
  for (const [id, key] of command_names) releases.push(host.registerCommand(`spot.terminal.${id}`, commands[key]));
  releases.push(host.registerValidator(validate_spot_projections));
  releases.push(host.registerCreator(terminalCreator));
  return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
