import * as api from "./http.js";
import { loadTerminal } from "./load.js";
import { mergeLive, ordersState } from "./normalize.js";
import { clearSession, sessionFor, setSession } from "./session.js";
import { connect, disconnect, liveFor } from "./stomp.js";
import { configOf, patchState, stateOf, terminalNode } from "./state.js";
import { validateOrder } from "./validation.js";
import { nextBotDelay, randomBotOrder } from "./bot.js";

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const failure = (graph, node, error) => patchState(graph, node.id, { ...stateOf(node), loading: false, requestState: "idle", error: error instanceof Error ? error.message : String(error) });
const requireSession = (node) => {
  const session = sessionFor(node.id); if (!session) throw new Error("登录状态已失效，请重新登录"); return session;
};

export async function login(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node), { apiBase } = configOf(node);
  try {
    const username = String(input.username ?? "").trim(); if (!username) throw new Error("请输入用户名");
    const auth = await api.login(apiBase, username), token = auth?.accessToken; if (!token) throw new Error("登录响应缺少 accessToken");
    const loaded = await loadTerminal(apiBase, token);
    setSession(node.id, { token, apiBase }); connect(node.id, apiBase, loaded.selectedSymbol, loaded.member?.memberId);
    return patchState(graph, node.id, { ...state, ...loaded, authenticated: true, loading: false, connection: "connecting", error: "", notice: "登录成功" });
  } catch (error) { return failure(graph, node, error); }
}

export async function selectSymbol(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  try {
    const session = requireSession(node), symbol = String(input.symbol ?? "");
    const loaded = await loadTerminal(session.apiBase, session.token, symbol);
    connect(node.id, session.apiBase, symbol, loaded.member?.memberId);
    session.botNextAt = undefined;
    return patchState(graph, node.id, { ...state, ...loaded, botEnabled: false, error: "", notice: "" });
  } catch (error) { return failure(graph, node, error); }
}

export async function submitOrder(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  try {
    const session = requireSession(node), order = validateOrder(input);
    const requestKey = session.pendingRequest?.signature === JSON.stringify(order) ? session.pendingRequest.id : id();
    session.pendingRequest = { signature: JSON.stringify(order), id: requestKey };
    const orderId = await api.submit(session.apiBase, session.token, { ...order, uniqueRequestId: requestKey });
    session.pendingRequest = undefined;
    const loaded = await loadTerminal(session.apiBase, session.token, state.selectedSymbol);
    return patchState(graph, node.id, { ...state, ...loaded, requestState: "idle", error: "", notice: `下单成功 · ${orderId}` });
  } catch (error) { return failure(graph, node, error); }
}

export async function cancelOrder(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  try {
    const session = requireSession(node); await api.cancel(session.apiBase, session.token, String(input.orderId ?? ""));
    const loaded = await loadTerminal(session.apiBase, session.token, state.selectedSymbol);
    return patchState(graph, node.id, { ...state, ...loaded, error: "", notice: "撤单请求已提交" });
  } catch (error) { return failure(graph, node, error); }
}

export async function sync(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node), session = sessionFor(node.id);
  if (!session) return patchState(graph, node.id, { ...state, authenticated: false, connection: "offline" });
  const live = liveFor(node.id), next = mergeLive(state, live);
  if (live.ordersDirty) {
    try { next.orders = ordersState(await api.orders(session.apiBase, session.token, state.selectedSymbol)); live.ordersDirty = false; } catch { /* A transient refresh failure must not tear down the live terminal. */ }
  }
  if (state.botEnabled && !session.botBusy && Date.now() >= (session.botNextAt ?? 0)) {
    session.botBusy = true;
    try {
      const order = validateOrder(randomBotOrder(next));
      const orderId = await api.submit(session.apiBase, session.token, { ...order, uniqueRequestId: id() });
      const loaded = await loadTerminal(session.apiBase, session.token, state.selectedSymbol);
      Object.assign(next, loaded, { botEnabled: true, error: "", notice: `机器人下单 · ${order.direction} ${order.type} · ${orderId}` });
    } catch (error) {
      next.error = error instanceof Error ? error.message : String(error);
    } finally {
      session.botBusy = false; session.botNextAt = Date.now() + nextBotDelay();
    }
  }
  return patchState(graph, node.id, { ...next, connection: live.connection ?? state.connection });
}

export function toggleBot(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node), session = requireSession(node);
  const enabled = !state.botEnabled;
  session.botNextAt = enabled ? Date.now() : undefined;
  return patchState(graph, node.id, { ...state, botEnabled: enabled, error: "", notice: enabled ? "随机下单机器人已开启" : "随机下单机器人已关闭" });
}

export function setBotSide(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  const botSide = ["AUTO", "BUY", "SELL"].includes(input.botSide) ? input.botSide : "AUTO";
  return patchState(graph, node.id, { ...state, botSide, error: "", notice: `机器人方向 · ${{ AUTO: "自动", BUY: "只买", SELL: "只卖" }[botSide]}` });
}

export function setBotType(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  const botType = ["AUTO", "LIMIT_PRICE", "MARKET_PRICE"].includes(input.botType) ? input.botType : "AUTO";
  return patchState(graph, node.id, { ...state, botType, error: "", notice: `机器人类型 · ${{ AUTO: "自动", LIMIT_PRICE: "只限价", MARKET_PRICE: "只市价" }[botType]}` });
}

export function draft(input, graph) {
  const node = terminalNode(input, graph), state = stateOf(node);
  return patchState(graph, node.id, { ...state, draft: { ...state.draft, direction: input.direction ?? state.draft.direction }, error: "", notice: "" });
}
export function logout(input, graph) {
  const node = terminalNode(input, graph); disconnect(node.id); clearSession(node.id);
  return patchState(graph, node.id, { ...stateOf(node), authenticated: false, botEnabled: false, member: null, connection: "offline", error: "", notice: "" });
}
