import { esc, number } from "./format.js";

export function chart(klines = []) {
  const rows = klines.slice(-80), width = 800, height = 360, pad = 24;
  if (!rows.length) return '<div class="empty">等待 K 线数据</div>';
  const values = rows.flatMap((row) => [Number(row.highestPrice ?? row.high), Number(row.lowestPrice ?? row.low)]).filter(Number.isFinite);
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1, step = (width - pad * 2) / rows.length;
  const y = (value) => pad + (high - Number(value)) / span * (height - pad * 2);
  const candles = rows.map((row, index) => {
    const open = Number(row.openPrice ?? row.open), close = Number(row.closePrice ?? row.close);
    const top = Math.min(y(open), y(close)), bodyHeight = Math.max(1, Math.abs(y(open) - y(close)));
    const color = close >= open ? "#20c997" : "#f05b70", x = pad + index * step + step / 2;
    return `<g><line x1="${x}" y1="${y(row.highestPrice ?? row.high)}" x2="${x}" y2="${y(row.lowestPrice ?? row.low)}" stroke="${color}"/><rect x="${x - Math.max(1, step * .28)}" y="${top}" width="${Math.max(2, step * .56)}" height="${bodyHeight}" fill="${color}"/></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="K线图"><text x="6" y="16" fill="#718096">${esc(number(high, 6))}</text><text x="6" y="${height - 6}" fill="#718096">${esc(number(low, 6))}</text>${candles}</svg>`;
}
