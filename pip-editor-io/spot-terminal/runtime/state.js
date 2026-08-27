import { scalar } from "./selectors.js";

export const STATE = "spot.terminal.predicate.state";
export const CONFIG = "spot.terminal.predicate.config";
export const initialState = () => ({
  authenticated: false, loading: false, connection: "offline", symbols: [], wallets: [],
  botEnabled: false, botFast: false, botSide: "AUTO", botType: "AUTO",
  orders: [], trades: [], asks: [], bids: [], klines: [], ticker: {},
  selectedPeriod: "1min", periods: [],
  draft: { direction: "BUY", type: "LIMIT_PRICE", price: "", amount: "" },
});
export const stateOf = (node) => ({ ...initialState(), ...scalar(node, STATE, {}) });
export const configOf = (node) => ({ apiBase: "http://127.0.0.1:8080", ...scalar(node, CONFIG, {}) });
export const stateRelation = (value) => ({
  id: "state", predicate: { nodeId: STATE, relationId: "identity" }, object: { kind: "const", value }, relations: [],
});
export const patchState = (graph, terminalId, value) => ({
  schemaVersion: 1, baseRevision: graph.revision,
  operations: [{ op: "put-relation", nodeId: terminalId, relation: stateRelation(value) }],
});
export const terminalNode = (input, graph) => {
  if (!input || typeof input.terminalId !== "string" || !graph.nodes[input.terminalId]) throw new Error("交易终端上下文已失效");
  return graph.nodes[input.terminalId];
};
