export function mountGuardToggle(root, state) {
  const typeModes = root.querySelector('[aria-label="机器人订单类型"]');
  if (!typeModes) return;
  const enabled = Boolean(state.botGuard), button = document.createElement("button");
  button.type = "button";
  button.className = `bot-toggle ${enabled ? "active guard" : ""}`;
  button.dataset.action = "bot-guard";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", String(enabled));
  button.innerHTML = `<span><b>护盘模式</b><small>${enabled ? "补弱侧 · 被动限价" : "关闭 · 随机策略"}</small></span><i></i>`;
  typeModes.after(button);
}
