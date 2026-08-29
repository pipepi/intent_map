const stores = new Map(), clients = new Map();
const frame = (command, headers = {}) => `${command}\n${Object.entries(headers).map(([key, value]) => `${key}:${value}`).join("\n")}\n\n\0`;
const topic = (kind, symbol, memberId) => kind.startsWith("order-")
  ? `/topic/market/${kind}/${symbol}/${memberId}` : kind === "thumb" ? "/topic/market/thumb" : `/topic/market/${kind}/${symbol}`;

export function liveFor(id) { return stores.get(id) ?? {}; }
// The backend multiplexes every K-line period on one symbol topic. A missing
// period is treated as 1min only for compatibility with older servers.
export function acceptsKlinePeriod(value, period = "1min") {
  return canonicalPeriod(value?.period) === canonicalPeriod(period);
}
// Keep versioned corrections until HTTP has acknowledged the same minute and
// version. This prevents an older in-flight snapshot from erasing fresh bars.
export function acknowledgeKlines(live, snapshot) {
  const rows = new Map((snapshot ?? []).map((row) => [Number(row.time), row]));
  live.klines = (live.klines ?? []).filter((row) => {
    const snapshotRow = rows.get(Number(row.time));
    if (!snapshotRow) return true;
    if (row.sourceStateVersion != null) return Number(snapshotRow.sourceStateVersion ?? -1) < Number(row.sourceStateVersion);
    return Number(snapshotRow.count ?? 0) < Number(row.count ?? 0);
  });
  return live;
}
export function disconnect(id) { clients.get(id)?.close(); clients.delete(id); stores.delete(id); }
export function connect(id, apiBase, symbol, memberId, marketSource = "INTERNAL", period = "1min") {
  disconnect(id);
  const url = apiBase.replace(/^http/, "ws") + "/market-native-ws", socket = new WebSocket(url), live = {
    symbol, marketSource, period: canonicalPeriod(period), durationMs: durationOf(period),
    connection: "connecting", trades: [], klines: [],
  };
  stores.set(id, live); clients.set(id, socket);
  socket.onopen = () => socket.send(frame("CONNECT", { "accept-version": "1.2", "heart-beat": "10000,10000" }));
  socket.onmessage = (event) => {
    const chunks = String(event.data).split("\0").filter(Boolean);
    for (const chunk of chunks) {
      const split = chunk.indexOf("\n\n"), head = chunk.slice(0, split), payload = chunk.slice(split + 2);
      if (head.startsWith("CONNECTED")) {
        live.connection = "online";
        ["trade", "trade-plate", "trade-depth", "kline", "thumb", "order-trade", "order-completed", "order-canceled"].forEach((kind, index) => socket.send(frame("SUBSCRIBE", { id: `${id}-${index}`, destination: topic(kind, symbol, memberId), ack: "auto" })));
      } else if (head.startsWith("MESSAGE")) mergeMessage(live, head, payload);
    }
  };
  socket.onerror = () => { live.connection = "error"; };
  socket.onclose = () => { live.connection = "offline"; };
}

export function mergeMessage(live, head, payload) {
  const destination = head.split("\n").find((line) => line.startsWith("destination:"))?.slice(12) ?? "";
  let value; try { value = JSON.parse(payload); } catch { return; }
  if (destination.includes("trade-depth")) mergeDepth(live, value);
  else if (destination.includes("/trade/")) {
    const updates = [].concat(value ?? []);
    live.trades = [...live.trades, ...updates].slice(-80);
    // New All-in publishes authoritative 1min K-lines for both market sources.
    // Trades update the tape only; synthesizing a second candle causes races.
  }
  else if (destination.includes("/kline/")) {
    if (!acceptsKlinePeriod(value, live.period)) return;
    const rows = new Map(live.klines.map((row) => [Number(row.time), row]));
    const previous = rows.get(Number(value?.time));
    if (!previous || Number(value?.sourceStateVersion ?? 0) >= Number(previous?.sourceStateVersion ?? 0)) rows.set(Number(value?.time), value);
    live.klines = [...rows.values()].sort((a, b) => Number(a.time) - Number(b.time)).slice(-4);
    if (Number(value?.time) === Number(live.provisionalKline?.time) &&
      Number(value?.count ?? 0) >= Number(live.provisionalKline?.count ?? 0)) live.provisionalKline = undefined;
  }
  else if (destination.endsWith("/thumb")) {
    const thumb = Array.isArray(value) ? value.find((item) => item?.symbol === live.symbol) : value;
    // The shared topic emits both snapshots and single-symbol increments.
    // Never let another pair's scalar increment overwrite this terminal.
    if (thumb?.symbol === live.symbol) live.thumb = thumb;
  }
  else if (destination.includes("/order-")) live.ordersDirty = true;
}

// The matching service publishes one changed side per frame. Preserve the
// opposite side; combined snapshots from compatible servers remain supported.
export function mergeDepth(live, value) {
  const direction = String(value?.direction ?? "").toUpperCase();
  if (direction === "BUY") live.bids = value?.items ?? [];
  else if (direction === "SELL") live.asks = value?.items ?? [];
  else {
    if (value?.bid?.items || value?.bids) live.bids = value?.bid?.items ?? value.bids;
    if (value?.ask?.items || value?.asks) live.asks = value?.ask?.items ?? value.asks;
  }
  return live;
}
import { canonicalPeriod, durationOf } from "./periods.js";
