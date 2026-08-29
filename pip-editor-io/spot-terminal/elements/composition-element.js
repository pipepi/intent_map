const styles = `:host{display:block;height:100%;color:#eaecef;font:12px/1.4 system-ui,sans-serif}.surface{position:relative;height:100%;min-height:620px;overflow:hidden;background:#0b0f14}.head{position:absolute;z-index:3;top:10px;left:14px}.head b{display:block}.head small{color:#8b949e}.world{position:absolute;inset:0;transform:translate(var(--projection-pan-x,0),var(--projection-pan-y,0)) scale(var(--projection-zoom,1));transform-origin:top left}::slotted(article){position:absolute!important;display:block;overflow:hidden;border-radius:9px;box-shadow:0 8px 24px #0008}.world-events{background:radial-gradient(circle at center,#1c1a0d,#090d11 62%)}.flow{background-image:linear-gradient(#26303a44 1px,transparent 1px),linear-gradient(90deg,#26303a44 1px,transparent 1px);background-size:28px 28px}`;

export class SpotCompositionElement extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  set context(value) { this._context = value; this.render(); }
  connectedCallback() { this.render(); }
  render() {
    const data = this._context?.projection?.data ?? {}, mode = data.viewKind === "world" ? "world-events" : "flow";
    this.shadowRoot.innerHTML = `<style>${styles}</style><section class="surface ${mode}" data-projection-surface><header class="head"><b>${mode === "flow" ? "Spot Flow" : "Spot World Events"}</b><small>${data.items?.length ?? 0} 个真实子节点外象</small></header><div class="world"><slot></slot></div></section>`;
  }
}

