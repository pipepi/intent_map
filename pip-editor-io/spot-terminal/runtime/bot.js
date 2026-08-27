const between = (random, min, max) => min + random() * (max - min);

export function availableBotModes(state) {
  const side = ["BUY", "SELL"].includes(state.botSide) ? state.botSide : "AUTO";
  const orderType = ["LIMIT_PRICE", "MARKET_PRICE"].includes(state.botType) ? state.botType : "AUTO";
  const modes = [];
  if (side !== "SELL") {
    if (orderType !== "MARKET_PRICE") modes.push(["BUY", "LIMIT_PRICE"]);
    if (orderType !== "LIMIT_PRICE" && state.asks?.length) modes.push(["BUY", "MARKET_PRICE"]);
  }
  if (side !== "BUY") {
    if (orderType !== "MARKET_PRICE") modes.push(["SELL", "LIMIT_PRICE"]);
    if (orderType !== "LIMIT_PRICE" && state.bids?.length) modes.push(["SELL", "MARKET_PRICE"]);
  }
  return modes;
}

// Market buys are denominated in settlement currency; every other mode uses
// trading currency. Limit orders cross the best opposite level when available.
export function randomBotOrder(state, random = Math.random) {
  const modes = availableBotModes(state);
  if (!modes.length) throw new Error("机器人等待市价单所需的对手盘");
  const [direction, type] = modes[Math.min(modes.length - 1, Math.floor(random() * modes.length))];
  const marketBuy = direction === "BUY" && type === "MARKET_PRICE";
  const amount = between(random, marketBuy ? 0.1 : 0.01, marketBuy ? 100 : 0.1);
  let price = 0;
  if (type === "LIMIT_PRICE") {
    const prices = (direction === "BUY" ? state.asks : state.bids)?.map((item) => Number(item.price)).filter((price) => price > 0) ?? [];
    const opposite = prices.length ? (direction === "BUY" ? Math.min(...prices) : Math.max(...prices)) : undefined;
    const reference = Number(opposite ?? state.ticker?.lastPrice ?? state.ticker?.close);
    if (!(reference > 0)) throw new Error("机器人等待有效盘口价格");
    price = opposite ? reference : reference * between(random, 0.99, 1.01);
  }
  return {
    symbol: state.selectedSymbol, direction, type,
    amount: amount.toFixed(8), price: type === "MARKET_PRICE" ? "0" : price.toFixed(8),
  };
}

export const nextBotDelay = (fast = false, random = Math.random) => Math.round(
  between(random, fast ? 200 : 2000, fast ? 500 : 5000)
);
