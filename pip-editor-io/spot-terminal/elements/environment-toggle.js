import { esc } from "./format.js";

export function environmentToggle(state) {
  const selected = state.environment === "server" ? "server" : "local";
  const option = (id, label) => `<button type="button" data-environment="${id}" class="${selected === id ? "active" : ""}" aria-pressed="${selected === id}" ${state.switching ? "disabled" : ""}>${label}</button>`;
  const fallback = selected === "server" ? "47.129.119.217" : "127.0.0.1";
  const target = state.switching ? "正在切换环境…" : state.host ?? fallback;
  return `<div class="environment"><div class="environment-options" aria-label="交易环境">${option("local", "本地")}${option("server", "服务器")}</div><small data-environment-target>${esc(target)}</small></div>`;
}
