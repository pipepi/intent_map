import { fact_node, projection_node, reference, constant } from "./facts/base.js";
import { initialState, stateRelation } from "./state.js";

const ensure_identity = (graph, id) => graph.nodes[id] ? [] : [{ op: "put-node", node: { id, relations: [constant("identity", "relation.core.identity", id)] } }];
const projection = (id, observed_id, definition_id, dives_into, extras = []) => ({ id, relations: [
  constant("identity", "relation.core.identity", id), reference("type", "relation.core.type", "relation.projection.type.instance"),
  reference("observes", "relation.projection.predicate.observes", observed_id), reference("uses", "relation.projection.predicate.uses", definition_id),
  ...(dives_into ? [reference("dives-into", "relation.projection.predicate.dives-into", dives_into)] : []), ...extras,
] });

export const terminalCreator = {
  id: "spot.terminal.create", label: "现货交易终端", description: "打开可独立切换本地或服务器环境的专业交易终端", category: "交易", icon: "↗",
  // 每个终端拥有独立内存认证会话，持久化图只保存非敏感事实。
  accepts() { return true; },
  create({ graph }) {
    const suffix = globalThis.crypto?.randomUUID?.() ?? Date.now(), terminal_id = `spot.terminal:${suffix}`;
    const detail_id = `spot.terminal.view:${suffix}`, simple_id = `spot.terminal.simple:${suffix}`;
    const flow_id = `spot.terminal.children:${suffix}`, world_id = `spot.terminal.world:${suffix}`, state = initialState();
    const robot = fact_node(terminal_id, "robot", "default", { enabled: false, fast: false, guard: false, side: "AUTO", orderType: "AUTO" });
    const robot_simple = projection_node(robot.id, "robot", "simple"), robot_detail = projection_node(robot.id, "robot", "detail");
    const presented = (mode) => [reference("child-predicate", "relation.projection.predicate.child-predicate", "spot.terminal.predicate.contains"),
      reference("presents:0", "relation.projection.predicate.presents", robot_simple.id, [constant("frame:0", "relation.projection.predicate.frame",
        mode === "flow" ? { x: 40, y: 70, width: 220, height: 118, resizeMode: "simple" } : { x: 320, y: 230, width: 240, height: 130, resizeMode: "simple" })])];
    const identities = ["workspace", "account", "balance", "pair", "order-book", "daily-summary", "kline", "robot", "order-event", "trade-event"].map((name) => `spot.terminal.type.${name}`).concat(
      ["workspace", "simple", "children", "world-events", ...["account", "balance", "pair", "order-book", "daily-summary", "kline", "robot", "order-event", "trade-event"].flatMap((kind) => [`${kind}-simple`, `${kind}-detail`])].map((name) => `spot.terminal.projection.${name}`),
      ["config", "state", "contains", "fact-value", "account", "pair", "subject", "object"].map((name) => `spot.terminal.predicate.${name}`),
      ["type.instance", "predicate.observes", "predicate.uses", "predicate.dives-into", "predicate.presents", "predicate.child-predicate", "predicate.frame"].map((name) => `relation.projection.${name}`));
    return { patch: { schemaVersion: 1, baseRevision: graph.revision, operations: [
      ...identities.flatMap((id) => ensure_identity(graph, id)),
      { op: "put-node", node: { id: terminal_id, relations: [constant("identity", "relation.core.identity", terminal_id), reference("type", "relation.core.type", "spot.terminal.type.workspace"), constant("config", "spot.terminal.predicate.config", { environment: "local" }), stateRelation(state), reference("contains:0", "spot.terminal.predicate.contains", robot.id)] } },
      { op: "put-node", node: robot }, { op: "put-node", node: robot_simple }, { op: "put-node", node: robot_detail },
      { op: "put-node", node: projection(detail_id, terminal_id, "spot.terminal.projection.workspace", flow_id) },
      { op: "put-node", node: projection(simple_id, terminal_id, "spot.terminal.projection.simple", flow_id) },
      { op: "put-node", node: projection(flow_id, terminal_id, "spot.terminal.projection.children", undefined, presented("flow")) },
      { op: "put-node", node: projection(world_id, terminal_id, "spot.terminal.projection.world-events", undefined, presented("world")) },
    ] }, addRootNodeIds: [detail_id], preferredProjection: { projectionId: detail_id, width: 390, height: 720 } };
  },
};
