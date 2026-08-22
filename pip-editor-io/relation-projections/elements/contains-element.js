import { contains } from "./styles.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export class RelationContainsElement extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: "open" }); this.start = null;
    this.addEventListener("pointerdown", () => this.focus());
    this.addEventListener("keydown", (event) => { if (event.code === "Space" && !event.repeat) { event.preventDefault(); event.stopPropagation(); this.openAt(180, 90); } });
  }
  set context(value) { this._context = value; this.render(); }
  get context() { return this._context; }
  connectedCallback() { this.tabIndex = 0; this.render(); }
  render() {
    const data = this._context?.projection?.data;
    if (!data || data.kind !== "children") return void (this.shadowRoot.innerHTML = "<p>等待直接子级投影</p>");
    this.shadowRoot.innerHTML = `<style>${contains}</style><header class="bar"><strong>${esc(data.label)}</strong><span class="muted">观察直接子级</span><span class="hint">Alt+拖拽或空格添加</span></header><div class="surface" data-projection-surface><div class="world"><slot></slot></div></div>`;
    const surface = this.shadowRoot.querySelector(".surface");
    surface.addEventListener("pointerdown", (event) => { if (!event.altKey || event.button !== 0) return; event.preventDefault(); this.start = { x: event.offsetX, y: event.offsetY, pointerId: event.pointerId }; surface.setPointerCapture(event.pointerId); });
    surface.addEventListener("pointerup", (event) => { if (!this.start || event.pointerId !== this.start.pointerId) return; const moved = Math.hypot(event.offsetX - this.start.x, event.offsetY - this.start.y); this.start = null; if (moved >= 4) this.openAt(event.offsetX, event.offsetY); });
  }
  openAt(x, y) {
    const data = this._context?.projection?.data; if (!data) return;
    this.shadowRoot.querySelector(".menu")?.remove();
    const menu = document.createElement("div"); menu.className = "menu"; menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    menu.innerHTML = data.candidates.length ? data.candidates.map((item) => `<button data-id="${esc(item.projectionNodeId)}">${esc(item.label)}</button>`).join("") : '<p class="muted">没有可加入的无父级节点</p>';
    menu.addEventListener("click", (event) => { const button = event.target.closest("[data-id]"); if (!button) return; this.attach(button.dataset.id, x, y); menu.remove(); });
    this.shadowRoot.querySelector(".surface")?.append(menu);
  }
  attach(childProjectionId, x, y) {
    const data = this._context.projection.data, child = data.candidates.find((item) => item.projectionNodeId === childProjectionId);
    const style = getComputedStyle(this), panX = Number.parseFloat(style.getPropertyValue("--projection-pan-x")) || 0, panY = Number.parseFloat(style.getPropertyValue("--projection-pan-y")) || 0;
    const zoom = Number.parseFloat(style.getPropertyValue("--projection-zoom")) || 1;
    const frame = { x: (x - panX) / zoom - 160, y: (y - panY) / zoom - 110, width: 320, height: 220, resizeMode: "simple" };
    this.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail: { kind: "command", commandId: "relation.attach-child-projection", input: { parentProjectionId: data.projectionNodeId, childProjectionId, frame } } }));
    if (child) this.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail: { kind: "select", nodeIds: [child.observedNodeId] } }));
  }
}
