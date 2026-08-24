const stores = new Map(), clients = new Map();
const frame = (command, headers = {}) => `${command}\n${Object.entries(headers).map(([key, value]) => `${key}:${value}`).join("\n")}\n\n\0`;
const topic = (kind, symbol, memberId) => kind.startsWith("order-")
  ? `/topic/market/${kind}/${symbol}/${memberId}` : kind === "thumb" ? "/topic/market/thumb" : `/topic/market/${kind}/${symbol}`;

export function liveFor(id) { return stores.get(id) ?? {}; }
export function disconnect(id) { clients.get(id)?.close(); clients.delete(id); stores.delete(id); }
export function connect(id, apiBase, symbol, memberId) {
  disconnect(id);
  const url = apiBase.replace(/^http/, "ws") + "/market-native-ws", socket = new WebSocket(url), live = { symbol, connection: "connecting", trades: [], klines: [] };
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

function mergeMessage(live, head, payload) {
  const destination = head.split("\n").find((line) => line.startsWith("destination:"))?.slice(12) ?? "";
  let value; try { value = JSON.parse(payload); } catch { return; }
  if (destination.includes("trade-depth")) mergeDepth(live, value);
  else if (destination.includes("/trade/")) live.trades = [...live.trades, ...([].concat(value ?? []))].slice(-80);
  else if (destination.includes("/kline/")) live.klines = [...live.klines, value].slice(-2);
  else if (destination.endsWith("/thumb")) live.thumb = Array.isArray(value)
    ? value.find((item) => item?.symbol === live.symbol) ?? live.thumb : value;
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
