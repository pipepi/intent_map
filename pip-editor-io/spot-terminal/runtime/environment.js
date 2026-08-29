export const ENVIRONMENTS = Object.freeze({
  local: Object.freeze({ environment: "local", label: "本地", host: "127.0.0.1", apiBase: "http://127.0.0.1:8080" }),
  server: Object.freeze({ environment: "server", label: "服务器", host: "47.129.119.217", apiBase: "http://47.129.119.217" }),
});

export function environmentId(config = {}) {
  if (config.environment === "server" || String(config.apiBase ?? "").includes("47.129.119.217")) return "server";
  return "local";
}

export function environmentConfig(config = {}) {
  return ENVIRONMENTS[environmentId(config)];
}

export function requireEnvironment(value) {
  if (value !== "local" && value !== "server") throw new Error("不支持的交易环境");
  return ENVIRONMENTS[value];
}
