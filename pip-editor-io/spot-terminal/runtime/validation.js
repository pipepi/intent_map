const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
export function validateOrder(input) {
  if (!["BUY", "SELL"].includes(input.direction)) throw new Error("请选择买卖方向");
  if (!["LIMIT_PRICE", "MARKET_PRICE"].includes(input.type)) throw new Error("请选择订单类型");
  if (!input.symbol) throw new Error("请选择交易对");
  if (!positive(input.amount)) throw new Error("数量必须大于 0");
  if (input.type === "LIMIT_PRICE" && !positive(input.price)) throw new Error("限价单价格必须大于 0");
  return { direction: input.direction, type: input.type, symbol: input.symbol, amount: String(input.amount), price: input.type === "MARKET_PRICE" ? "0" : String(input.price) };
}
