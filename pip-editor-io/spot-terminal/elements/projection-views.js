import { esc, number } from "./format.js";

const status = (state) => state.authenticated ? "已登录" : "未登录";

export function embeddedTerminal(state) {
  const ticker = state.ticker ?? {}, symbol = state.symbol ?? "AEX Spot";
  return `<article class="terminal-embedded" aria-label="${esc(symbol)} 交易节点">
    <span class="brand">AEX</span><strong>${esc(symbol)}</strong>
    <b class="${Number(ticker.changePercent ?? 0) >= 0 ? "positive" : "negative"}">${number(ticker.lastPrice)}</b>
    <small>${esc(status(state))} · ${state.connected ? "online" : "offline"}</small>
  </article>`;
}

export function childrenTerminal(state) {
  const blocks = [
    ["行情", `${state.symbols?.length ?? 0} 个交易对`, state.connected ? "实时连接" : "等待连接"],
    ["账户", status(state), `${state.assets?.length ?? 0} 项资产`],
    ["订单", `${state.orders?.length ?? 0} 条记录`, state.symbol ?? "未选择交易对"],
    ["机器人", state.botEnabled ? "运行中" : "已停止", state.botGuard ? "护盘模式" : "随机策略"],
  ];
  return `<section class="terminal-children" aria-label="交易节点内部工作区">
    <header><span class="brand">AEX</span><div><strong>Spot Terminal</strong><small>直接子级内部视角</small></div></header>
    <div class="capability-grid">${blocks.map(([title, primary, secondary]) => `<article><small>${esc(title)}</small><strong>${esc(primary)}</strong><span>${esc(secondary)}</span></article>`).join("")}</div>
  </section>`;
}

export function worldTerminal(state) {
  const symbol = state.symbol ?? state.selectedSymbol ?? "未选择交易对";
  const completed = state.orders?.filter((item) => item.status === "COMPLETED").length ?? 0;
  const active = state.orders?.filter((item) => item.status === "TRADING").length ?? 0;
  const nodes = [
    ["event", "市场事件", symbol, state.connected ? "行情流在线" : "等待行情"],
    ["entity", "账户实体", status(state), `${state.assets?.length ?? state.wallets?.length ?? 0} 项资产`],
    ["task", "交易任务", `${active} 个活动订单`, `${completed} 个已完成`],
    ["virtual", "虚拟执行体", state.botEnabled ? "机器人运行中" : "机器人已停止", state.botGuard ? "护盘策略" : "随机策略"],
  ];
  return `<section class="terminal-world" aria-label="交易所世界事件观察模型">
    <header><span class="brand">AEX</span><div><strong>World Events</strong><small>观察子级 · 世界事件模型</small></div></header>
    <div class="world-scene"><article class="world-center"><span>world</span><strong>Spot Exchange</strong><small>${esc(symbol)}</small></article>
    ${nodes.map(([kind, title, primary, secondary], index) => `<article class="world-node world-${kind} world-node-${index}"><span>${esc(kind)}</span><strong>${esc(title)}</strong><b>${esc(primary)}</b><small>${esc(secondary)}</small></article>`).join("")}
    </div>
  </section>`;
}
