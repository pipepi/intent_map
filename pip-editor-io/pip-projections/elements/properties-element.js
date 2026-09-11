import { properties } from "./styles.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const valueText = (value) => typeof value === "object" ? JSON.stringify(value) : String(value);

export class PipPropertiesElement extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  set context(value) { this._context = value; this.render(); }
  get context() { return this._context; }
  connectedCallback() { this.render(); }
  render() {
    const data = this._context?.projection?.data;
    if (!data || data.kind !== "properties") return void (this.shadowRoot.innerHTML = "<p>等待属性投影</p>");
    const compact = this._context.projectionContext?.kind === "self-embedded";
    const rows = data.pips.map((pip) => `<div class="row"><code>${esc(pip.predicate)}</code><span class="value">${esc(valueText(pip.value))}</span></div>`).join("");
        const sessions = this._context.execution?.sessions ?? [], active = sessions.find((item) => item.id === this._context.execution?.activeSessionId) ?? sessions.at(-1);
        const last = active?.trace?.findLast((item) => item.nodeId === data.observedNodeId);
        const portSide = (ports, direction) => `<div class="side">${ports.map((port) => `<button data-flow-${direction} data-node="${esc(port.nodeId)}" data-pip="${esc(port.id)}">${esc(port.label)}</button>`).join("")}</div>`;
    const compactPorts = `<div class="compact-ports">${portSide(data.flow?.inputs ?? [], "input")}${portSide(data.flow?.outputs ?? [], "output")}</div>`;
        this.shadowRoot.innerHTML = `<style>${properties}</style><section class="${compact ? "compact" : "full"}">
      <header class="bar" ${compact ? "data-child-drag" : ""}><strong>${esc(data.label)}</strong><span class="muted">${last?.kind ?? (compact ? "缩略" : "观察自身")}</span>${compact ? '<button data-detach title="移出当前容器">×</button><button class="enter" data-enter>进入</button>' : ""}</header>
      ${compactPorts}<div class="panel"><h3>${esc(data.label)}</h3><div class="details">${rows || '<p class="muted">没有可显示关系</p>'}</div></div></section>`;
        this.shadowRoot.querySelector("[data-enter]")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("intent-pip-request", { bubbles: true, composed: true, detail: { kind: "navigate-projection", projectionNodeId: data.projectionNodeId } })));
        this.shadowRoot.querySelector("[data-detach]")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("intent-pip-request", { bubbles: true, composed: true, detail: {
      kind: "command", commandId: "pip.detach-child-projection", input: { parentProjectionId: this._context.projectionContext.parentProjectionNodeId, childProjectionId: data.projectionNodeId },
    } })));
        this.shadowRoot.querySelectorAll("[data-flow-output]").forEach((button) => button.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            this.dispatchEvent(new CustomEvent("pip-flow-drag-start", { bubbles: true, composed: true, detail: { node_id: button.dataset.node, pip_id: button.dataset.pip } }));
        }));
        this.shadowRoot.querySelectorAll("[data-flow-input]").forEach((button) => {
            button.addEventListener("pointerup", (event) => { event.stopPropagation(); this.dispatchEvent(new CustomEvent("pip-flow-port-drop", { bubbles: true, composed: true, detail: { node_id: button.dataset.node, pip_id: button.dataset.pip } })); });
            button.addEventListener("dblclick", () => this.dispatchEvent(new CustomEvent("intent-pip-request", { bubbles: true, composed: true, detail: { kind: "command", commandId: "pip.flow.disconnect", input: { targetNodeId: button.dataset.node, target_pip_id: button.dataset.pip } } })));
        });
    }
}
