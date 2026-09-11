import { renderView } from "./render.js";

export class SceneViewElement extends HTMLElement {
  constructor(expectedMode) {
    super();
    this.expectedMode = expectedMode;
    this.attachShadow({ mode: "open" });
    this.drag = null;
    this.suppressClick = false;
    this.shadowRoot.addEventListener("click", (event) => this.selectFrom(event));
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") this.selectFrom(event);
    });
    this.shadowRoot.addEventListener("change", (event) => this.changeCamera(event));
    this.shadowRoot.addEventListener("pointerdown", (event) => this.beginDrag(event));
    this.shadowRoot.addEventListener("pointermove", (event) => this.moveDrag(event));
    this.shadowRoot.addEventListener("pointerup", (event) => this.endDrag(event));
    this.shadowRoot.addEventListener("pointercancel", () => { this.drag = null; });
  }
  set context(next) { this._context = next; this.render(); }
  get context() { return this._context; }
  connectedCallback() { this.render(); }
  data() { return this._context?.projection?.data; }
  render() {
    const data = this.data();
    if (!data || data.mode !== this.expectedMode) {
      this.shadowRoot.innerHTML = `<p>等待 ${this.expectedMode} Scene projection</p>`;
      return;
    }
    this.shadowRoot.innerHTML = renderView(data);
  }
  command(commandId, input) {
    this.dispatchEvent(new CustomEvent("intent-pip-request", {
      bubbles: true, composed: true, detail: { kind: "command", commandId, input },
    }));
  }
  selectFrom(event) {
    if (event.type === "click" && this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const target = event.target.closest?.("[data-select]");
    if (!target || this.drag) return;
    this.dispatchEvent(new CustomEvent("intent-pip-request", {
      bubbles: true, composed: true,
      detail: { kind: "select", nodeIds: [target.dataset.select], scopeId: this.data().viewId },
    }));
  }
  changeCamera(event) {
    const input = event.target.closest?.("[data-camera]");
    if (!input) return;
    this.command("scene.update-camera", { viewId: this.data().viewId, camera: { [input.dataset.camera]: Number(input.value) } });
  }
  svgPoint(event) {
    const svg = this.shadowRoot.querySelector("svg"), bounds = svg.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * 960, y: (event.clientY - bounds.top) / bounds.height * 540 };
  }
  beginDrag(event) {
    const target = event.target.closest?.("[data-drag]");
    if (!target || !this.data().editable) return;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    this.drag = { pointerId: event.pointerId, nodeId: target.dataset.drag, target };
  }
  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const point = this.svgPoint(event), circle = this.drag.target.querySelector("circle"), label = this.drag.target.querySelector("text");
    circle?.setAttribute("cx", point.x); circle?.setAttribute("cy", point.y);
    label?.setAttribute("x", point.x + 10); label?.setAttribute("y", point.y + 4);
  }
  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const point = this.svgPoint(event), { nodeId } = this.drag;
    this.drag = null;
    this.suppressClick = true;
    this.command("scene.move-entity", { viewId: this.data().viewId, nodeId, screenX: point.x, screenY: point.y });
  }
}
