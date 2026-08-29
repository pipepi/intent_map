import { esc } from "./format.js";

const styles = `:host{display:block;height:100%;color:#eaecef;font:12px/1.4 system-ui,sans-serif}
.card{box-sizing:border-box;height:100%;display:grid;align-content:center;gap:6px;padding:12px;border:1px solid #35404c;border-radius:8px;background:#10161c;overflow:auto}
.kind{color:#f0b90b;font:9px monospace;text-transform:uppercase}.card strong{font-size:14px}.card small{color:#87909a}.detail{align-content:start}.detail pre{margin:0;white-space:pre-wrap;color:#bac2ca;font:10px/1.5 monospace}`;
const label = (data) => data.label ?? data.value?.symbol ?? data.value?.orderId ?? data.value?.tradeId ?? data.observedNodeId;

export class SpotFactElement extends HTMLElement {
  set context(value) { this._context = value; this.render(); }
  connectedCallback() { this.render(); }
  render() {
    const data = this._context?.projection?.data ?? {}, detail = data.viewKind === "detail";
    this.innerHTML = `<style>${styles}</style><article class="card ${detail ? "detail" : "simple"}"><span class="kind">${esc(data.kind)}</span><strong>${esc(label(data))}</strong>${detail
      ? `<pre>${esc(JSON.stringify(data.value ?? {}, null, 2))}</pre>`
      : `<small>${esc(data.summary ?? "打开查看事实详情")}</small>`}</article>`;
  }
}

