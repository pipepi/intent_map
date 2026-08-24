export const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
}[character]));

export const number = (value, digits = 4) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
};

export const money = (value) => number(value, 8);
export const sideClass = (side) => String(side).toUpperCase() === "BUY" ? "buy" : "sell";
export const time = (value) => value ? new Date(Number(value)).toLocaleTimeString([], { hour12: false }) : "—";
