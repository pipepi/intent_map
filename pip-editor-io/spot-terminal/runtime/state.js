import { PipForkLevel } from "../../../pip-editor/pip/types.ts";
import { graphRevision, graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { scalar } from "./selectors.js";
import { environmentConfig } from "./environment.js";
import { reconcile_facts } from "./facts/reconcile.js";

export const STATE = "spot.terminal.predicate.state";
export const CONFIG = "spot.terminal.predicate.config";
export const initialState = () => ({
  authenticated: false, loading: false, connection: "offline", symbols: [], wallets: [],
  botEnabled: false, botFast: false, botGuard: false, botSide: "AUTO", botType: "AUTO",
  orders: [], trades: [], asks: [], bids: [], klines: [], ticker: {},
  selectedPeriod: "1min", periods: [],
  draft: { direction: "BUY", type: "LIMIT_PRICE", price: "", amount: "" },
});
export const stateOf = (node) => ({ ...initialState(), ...scalar(node, STATE, {}) });
export const configOf = (node) => environmentConfig(scalar(node, CONFIG, {}));
export const configPip = (environment) => ({
  id: "config",
    fork_level: PipForkLevel.PIPE,
    predicate_value: { predicate: { node_id: CONFIG, pip_id: "identity" }, value: { kind: "const", value: { environment } } },
    pips: []
});
export const statePip = (value) => ({
  id: "state",
    fork_level: PipForkLevel.PIPE,
    predicate_value: { predicate: { node_id: STATE, pip_id: "identity" }, value: { kind: "const", value } },
    pips: []
});
export const patchState = (graph, terminal_id, value) => {
  const fact_patch = reconcile_facts(graph, terminal_id, value);
  return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [
    ...fact_patch.operations,
    { op: "put", parent_path: [terminal_id], pip: statePip(value) },
  ] };
};
export const patchEnvironment = (graph, terminal_id, environment, value) => {
  const fact_patch = reconcile_facts(graph, terminal_id, value);
  return { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [
    ...fact_patch.operations,
    { op: "put", parent_path: [terminal_id], pip: configPip(environment) },
    { op: "put", parent_path: [terminal_id], pip: statePip(value) },
  ] };
};
export const terminalNode = (input, graph) => {
  if (!input || typeof input.terminalId !== "string" || !graphNodes(graph)[input.terminalId]) throw new Error("交易终端上下文已失效");
  return graphNodes(graph)[input.terminalId];
};
