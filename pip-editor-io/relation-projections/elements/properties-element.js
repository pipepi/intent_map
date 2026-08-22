import { properties } from "./styles.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const valueText = (value) => typeof value === "object" ? JSON.stringify(value) : String(value);

export class RelationPropertiesElement extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  set context(value) { this._context = value; this.render(); }
  get context() { return this._context; }
  connectedCallback() { this.render(); }
  render() {
    const data = this._context?.projection?.data;
    if (!data || data.kind !== "properties") return void (this.shadowRoot.innerHTML = "<p>等待属性投影</p>");
    const compact = this._context.projectionContext?.kind === "self-embedded";
    const rows = data.relations.map((relation) => `<div class="row"><code>${esc(relation.predicate)}</code><span class="value">${esc(valueText(relation.value))}</span></div>`).join("");
    this.shadowRoot.innerHTML = `<style>${properties}</style><section class="${compact ? "compact" : "full"}">
      <header class="bar"><strong>${esc(data.label)}</strong><span class="muted">${compact ? "缩略" : "观察自身"}</span>${compact ? '<button data-detach title="移出当前容器">×</button><button class="enter" data-enter>进入</button>' : ""}</header>
      <div class="panel"><h3>${esc(data.label)}</h3><div class="details">${rows || '<p class="muted">没有可显示关系</p>'}</div></div></section>`;
    this.shadowRoot.querySelector("[data-enter]")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail: { kind: "navigate-projection", projectionNodeId: data.projectionNodeId } })));
    this.shadowRoot.querySelector("[data-detach]")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail: {
      kind: "command", commandId: "relation.detach-child-projection", input: { parentProjectionId: this._context.projectionContext.parentProjectionNodeId, childProjectionId: data.projectionNodeId },
    } })));
  }
}
