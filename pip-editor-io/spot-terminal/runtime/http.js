const body = (values) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "")).toString();

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json().catch(() => ({ code: response.status, message: response.statusText }));
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || `HTTP ${response.status}`);
  return payload.data;
}

// Public market endpoints intentionally do not use the SpotResponse envelope.
async function publicRequest(base, path) {
  const response = await fetch(`${base}${path}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload == null) throw new Error(`HTTP ${response.status}`);
  return payload;
}

export const login = (base, username, password) => request(base, base.includes("47.129.119.217") ? "/uc/login" : "/terminal/login", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body({ username, password }),
});
const authenticated = (token, options = {}) => ({ ...options, headers: { ...options.headers, "access-auth-token": token } });
export const bootstrap = (base, token) => request(base, "/terminal/bootstrap", authenticated(token));
export const market = (base, token, symbol) => request(base, `/terminal/market?symbol=${encodeURIComponent(symbol)}`, authenticated(token));
export const klines = (base, token, symbol) => request(base, `/terminal/klines?symbol=${encodeURIComponent(symbol)}&period=1min&limit=200`, authenticated(token));
export const marketHistory = (base, symbol, from, to, resolution) => publicRequest(base, `/market/history?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&resolution=${encodeURIComponent(resolution)}`);
export const orders = (base, token, symbol) => request(base, `/terminal/orders?symbol=${encodeURIComponent(symbol)}&limit=50`, authenticated(token));
export const submit = (base, token, order) => request(base, "/exchange/order/add", authenticated(token, {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body(order),
}));
export const cancel = (base, token, orderId) => request(base, `/exchange/order/cancel/${encodeURIComponent(orderId)}`, authenticated(token, { method: "POST" }));
