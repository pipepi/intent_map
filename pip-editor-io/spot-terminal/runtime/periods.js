export const DEFAULT_PERIODS = [
  { id: "1min", resolution: "1", label: "1m", durationMs: 60000 },
  { id: "5min", resolution: "5", label: "5m", durationMs: 300000 },
  { id: "15min", resolution: "15", label: "15m", durationMs: 900000 },
  { id: "30min", resolution: "30", label: "30m", durationMs: 1800000 },
  { id: "1hour", resolution: "1h", label: "1h", durationMs: 3600000 },
  { id: "4hour", resolution: "4h", label: "4h", durationMs: 14400000 },
  { id: "1day", resolution: "1d", label: "1D", durationMs: 86400000 },
  { id: "1week", resolution: "1w", label: "1W", durationMs: 604800000 },
  { id: "1mon", resolution: "1mon", label: "1M", durationMs: 2592000000 },
];

export function periodsOf(value) {
  if (!Array.isArray(value) || !value.length) return DEFAULT_PERIODS;
  return value.map((item) => ({ ...item,
    // All-in's history parser accepts `1mon`; `1M` is otherwise consumed by
    // its case-insensitive minute matcher before the month compatibility arm.
    resolution: item.id === "1mon" ? "1mon" : item.resolution,
    durationMs: Number(item.durationMs),
  }))
    .filter((item) => item.id && item.resolution && item.label && item.durationMs > 0);
}

export const periodOf = (periods, id) => periods.find((item) => item.id === id) ?? periods[0] ?? DEFAULT_PERIODS[0];
export const canonicalPeriod = (value) => value === "1month" ? "1mon" : String(value ?? "1min");
export const durationOf = (period) => DEFAULT_PERIODS.find((item) => item.id === canonicalPeriod(period))?.durationMs ?? 60000;
