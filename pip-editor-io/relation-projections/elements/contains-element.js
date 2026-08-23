import { contains } from "./styles.js";
import { flow } from "./flow-styles.js";
import { flowTransformFor, screenToElementLocal } from "./flow-geometry.js";
import { canCancelFlowSession, liveFlowNodeIds } from "./flow-runtime-state.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const request = (host, detail) => host.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail }));

export class RelationContainsElement extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: "open" }); this.start = null; this.flowSource = null; this.childDrag = null; this.previewFrames = new Map(); this.activeChild = null;
    this.addEventListener("pointerdown", () => this.focus());
    this.addEventListener("keydown", (event) => { if (event.code === "Space" && !event.repeat) { event.preventDefault(); event.stopPropagation(); this.openAt(180, 90); } });
    this.addEventListener("relation-flow-drag-start", (event) => { this.flowSource = event.detail; });
    this.addEventListener("relation-flow-port-drop", (event) => this.connect(event.detail));
  }
  set context(value) { this._context = value; this.render(); }
  get context() { return this._context; }
  connectedCallback() { this.tabIndex = 0; this.render(); }

  frameContext(data) {
    const views = this._context?.workspaceView, projections = views?.projections ?? {};
    const found = Object.entries(projections).find(([, frame]) => frame?.navigation?.entries?.[frame.navigation.index]?.projectionNodeId === data.projectionNodeId);
    const windowId = found?.[0] ?? views?.activeWindowId, frame = projections[windowId];
    const sessions = this._context?.execution?.sessions ?? [], sessionId = frame?.execution?.sessionId ?? this._context?.execution?.activeSessionId;
    return { windowId, frame, session: sessions.find((item) => item.id === sessionId) ?? sessions.at(-1) };
  }

  render() {
    this.scrollTop = 0; this.scrollLeft = 0;
    const data = this._context?.projection?.data;
    if (!data || data.kind !== "children") return void (this.shadowRoot.innerHTML = "<p>等待直接子级投影</p>");
    // Contains is the structural 1+n view; Flow is its execution-semantic sibling, never a zoom depth.
    const state = this.frameContext(data), visible = data.flowOnly === true;
    const boundary = data.flow?.boundary ?? { inputs: [], outputs: [] };
    const ports = (items, direction) => items.map((item) => `<button class="port" data-flow-${direction} data-node="${esc(item.nodeId)}" data-relation="${esc(item.id)}">${esc(item.label)}</button>`).join("");
    const triggers = (data.flow?.triggers ?? []).map((item) => `<button data-trigger="${esc(item.id)}">${esc(item.kind)}</button>`).join("");
    const executionTools = data.flowOnly ? `<span class="flow-state">${esc(state.session?.status ?? "idle")}</span><div class="flow-tools"><button data-run>运行</button>${canCancelFlowSession(state.session) ? '<button data-cancel>停止</button>' : ""}${state.session ? '<button data-save>保存</button>' : ""}</div>` : "";
    this.shadowRoot.innerHTML = `<style>${contains}${flow}</style><header class="bar"><strong>${esc(data.label)}</strong><span class="muted">${data.flowOnly ? "执行流" : "观察直接子级"}</span>${executionTools}</header>
      <div class="surface ${visible ? "" : "flow-off"}" data-projection-surface><div class="rail in">${ports(boundary.inputs, "output")}</div><div class="rail out">${ports(boundary.outputs, "input")}</div>
        <div class="world"><svg class="flow-svg"></svg><slot></slot></div><div class="trigger-row">${triggers}</div></div>`;
    this.raiseChild(this.activeChild); this.bindSurface(data, state);
    if (data.flowOnly) { this.bindFlow(data, state); this.renderEdges(data, state.session); }
  }

  bindSurface(data, state) {
    const surface = this.shadowRoot.querySelector(".surface");
    surface.addEventListener("pointerdown", (event) => {
      const path = event.composedPath(), handle = path.find((item) => item?.dataset?.childDrag !== undefined), article = path.find((item) => item?.dataset?.embeddedProjection);
      if (article) this.raiseChild(article.dataset.embeddedProjection);
      if (handle && article && !path.some((item) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(item?.tagName))) return this.beginChildDrag(event, data, article, surface);
      if (!event.altKey || event.button !== 0) return; event.preventDefault(); this.start = { x: event.offsetX, y: event.offsetY, pointerId: event.pointerId }; surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener("pointermove", (event) => this.moveChildDrag(event, data, state));
    surface.addEventListener("pointerup", (event) => {
      if (this.childDrag && event.pointerId === this.childDrag.pointerId) return this.endChildDrag(event, data);
      if (!this.start || event.pointerId !== this.start.pointerId) return; const moved = Math.hypot(event.offsetX - this.start.x, event.offsetY - this.start.y); this.start = null; if (moved >= 4) this.openAt(event.offsetX, event.offsetY);
    });
    surface.addEventListener("pointercancel", () => { this.childDrag = null; this.previewFrames.clear(); this.render(); });
  }

  beginChildDrag(event, data, article, surface) {
    const item = data.items.find((candidate) => candidate.projectionNodeId === article.dataset.embeddedProjection), world = this.shadowRoot.querySelector(".world");
    if (!item || !world || event.button !== 0) return;
    const rect = world.getBoundingClientRect(), scaleX = rect.width / world.offsetWidth, scaleY = rect.height / world.offsetHeight;
    event.preventDefault(); event.stopPropagation(); surface.setPointerCapture(event.pointerId);
    this.childDrag = { pointerId: event.pointerId, projectionNodeId: item.projectionNodeId, startX: event.clientX, startY: event.clientY, frame: { ...item.frame }, scaleX, scaleY, article, moved: false };
  }

  raiseChild(projectionNodeId) {
    if (!projectionNodeId) return; this.activeChild = projectionNodeId;
    this.querySelectorAll("[data-embedded-projection]").forEach((article) => { article.style.zIndex = article.dataset.embeddedProjection === projectionNodeId ? "2" : "1"; });
  }

  moveChildDrag(event, data, state) {
    const drag = this.childDrag; if (!drag || event.pointerId !== drag.pointerId) return;
    const frame = { ...drag.frame, x: drag.frame.x + (event.clientX - drag.startX) / drag.scaleX, y: drag.frame.y + (event.clientY - drag.startY) / drag.scaleY };
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 3;
    drag.article.style.left = `${frame.x}px`; drag.article.style.top = `${frame.y}px`; this.previewFrames.set(drag.projectionNodeId, frame); this.renderEdges(data, state.session);
  }

  endChildDrag(event, data) {
    const drag = this.childDrag, frame = this.previewFrames.get(drag.projectionNodeId); this.childDrag = null; this.previewFrames.clear();
    if (!drag.moved || !frame) return this.render();
    request(this, { kind: "command", commandId: "relation.move-child-projection", input: { parentProjectionId: data.projectionNodeId, childProjectionId: drag.projectionNodeId, frame } });
  }

  bindFlow(data, state) {
    this.shadowRoot.querySelector("[data-run]")?.addEventListener("click", () => request(this, { kind: "start-execution", targetNodeId: data.observedNodeId, input: {} }));
    this.shadowRoot.querySelector("[data-cancel]")?.addEventListener("click", () => request(this, { kind: "cancel-execution", sessionId: state.session.id }));
    this.shadowRoot.querySelector("[data-save]")?.addEventListener("click", () => request(this, { kind: "persist-execution-result", sessionId: state.session.id }));
    this.shadowRoot.querySelectorAll("[data-trigger]").forEach((button) => button.addEventListener("click", () => request(this, { kind: "start-execution", targetNodeId: data.observedNodeId, triggerNodeId: button.dataset.trigger, input: {} })));
    this.shadowRoot.querySelectorAll("[data-flow-output]").forEach((button) => button.addEventListener("pointerdown", (event) => { event.stopPropagation(); this.flowSource = { nodeId: button.dataset.node, relationId: button.dataset.relation }; }));
    this.shadowRoot.querySelectorAll("[data-flow-input]").forEach((button) => {
      button.addEventListener("pointerup", (event) => { event.stopPropagation(); this.connect({ nodeId: button.dataset.node, relationId: button.dataset.relation }); });
      button.addEventListener("dblclick", () => request(this, { kind: "command", commandId: "relation.flow.disconnect", input: { targetNodeId: button.dataset.node, targetRelationId: button.dataset.relation } }));
    });
  }

  renderEdges(data, session) {
    const svg = this.shadowRoot.querySelector(".flow-svg"), world = this.shadowRoot.querySelector(".world");
    const items = new Map((data.flow?.children ?? []).map((item) => [item.observedNodeId, item]));
    // Boundary ports stay fixed in the viewport while the SVG lives in the transformed world.
    const boundary = (ref, output) => {
      const selector = output ? "[data-flow-output]" : "[data-flow-input]";
      const button = [...this.shadowRoot.querySelectorAll(selector)].find((item) => item.dataset.node === ref.nodeId && item.dataset.relation === ref.relationId);
      if (!button || !world) return { x: output ? 4 : this.clientWidth - 4, y: 54 };
      const outer = world.getBoundingClientRect(), inner = button.getBoundingClientRect();
      return screenToElementLocal(
        { x: inner.left + inner.width / 2, y: inner.top + inner.height / 2 },
        outer,
        { width: world.offsetWidth, height: world.offsetHeight },
      );
    };
    const position = (ref, output) => {
      const item = items.get(ref.nodeId); if (!item) return boundary(ref, output);
      const frame = this.previewFrames.get(item.projectionNodeId) ?? item.frame;
      const list = output ? item.outputs : item.inputs, index = Math.max(0, list.findIndex((port) => port.id === ref.relationId));
      return { x: frame.x + (output ? frame.width : 0), y: frame.y + 48 + index * 20 };
    };
    const liveNodes = liveFlowNodeIds(session);
    svg.innerHTML = (data.flow?.edges ?? []).map((edge) => {
      const from = position(edge.source, true), to = position(edge.target, false), bend = (from.x + to.x) / 2, live = liveNodes.has(edge.source.nodeId) || liveNodes.has(edge.target.nodeId);
      return `<path class="${live ? "live" : ""}" d="M${from.x},${from.y} C${bend},${from.y} ${bend},${to.y} ${to.x},${to.y}"/>`;
    }).join("");
  }

  connect(target) {
    if (!this.flowSource) return; const source = this.flowSource; this.flowSource = null;
    request(this, { kind: "command", commandId: "relation.flow.connect", input: { sourceNodeId: source.nodeId, sourceRelationId: source.relationId, targetNodeId: target.nodeId, targetRelationId: target.relationId } });
  }

  openAt(x, y) {
    const data = this._context?.projection?.data; if (!data) return;
    this.shadowRoot.querySelector(".menu")?.remove(); const menu = document.createElement("div"); menu.className = "menu"; menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    menu.innerHTML = data.candidates.length ? data.candidates.map((item) => `<button data-id="${esc(item.projectionNodeId)}">${esc(item.label)}</button>`).join("") : '<p class="muted">没有可加入的无父级节点</p>';
    menu.addEventListener("click", (event) => { const button = event.target.closest("[data-id]"); if (!button) return; this.attach(button.dataset.id, x, y); menu.remove(); }); this.shadowRoot.querySelector(".surface")?.append(menu);
  }

  attach(childProjectionId, x, y) {
    const data = this._context.projection.data, child = data.candidates.find((item) => item.projectionNodeId === childProjectionId);
    const { panX, panY, zoom } = flowTransformFor(this);
    const frame = { x: (x - panX) / zoom - 160, y: (y - panY) / zoom - 110, width: 320, height: 220, resizeMode: "simple" };
    request(this, { kind: "command", commandId: "relation.attach-child-projection", input: { parentProjectionId: data.projectionNodeId, childProjectionId, frame } });
    if (child) request(this, { kind: "select", nodeIds: [child.observedNodeId] });
  }
}
