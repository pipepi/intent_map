const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const truncate = (value, scale) => {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  const [whole, fraction = ""] = text.split(".");
  return scale > 0 && fraction ? `${whole}.${fraction.slice(0, scale)}` : whole;
};
const scaleOf = (value) => Number.isInteger(Number(value)) ? Number(value) : 8;
export function validateOrder(input, pair = {}) {
  if (!["BUY", "SELL"].includes(input.direction)) throw new Error("请选择买卖方向");
  if (!["LIMIT_PRICE", "MARKET_PRICE"].includes(input.type)) throw new Error("请选择订单类型");
  if (!input.symbol) throw new Error("请选择交易对");
  const marketBuy = input.direction === "BUY" && input.type === "MARKET_PRICE";
  const amount = truncate(input.amount, scaleOf(marketBuy ? pair.baseCoinScale : pair.coinScale));
  const price = truncate(input.price, scaleOf(pair.baseCoinScale));
  if (!positive(amount)) throw new Error("数量必须大于 0");
  const minimum = Number(marketBuy ? pair.minTurnover : pair.minVolume);
  if (minimum > 0 && Number(amount) < minimum) throw new Error(`${marketBuy ? "结算金额" : "委托数量"}不能低于 ${minimum}`);
  if (input.type === "LIMIT_PRICE" && !positive(price)) throw new Error("限价单价格必须大于 0");
  return { direction: input.direction, type: input.type, symbol: input.symbol, amount, price: input.type === "MARKET_PRICE" ? "0" : price };
}
