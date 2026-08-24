import { loginView, terminalView } from "./render.js";
import { styles } from "./styles.js";

export class SpotTerminalElement extends HTMLElement {
  #context;
  #renderKey;
  #syncTimer;
  #view = "trade";
  #scrollRelease;
  set context(value) {
    this.#context = value;
    // Host keyboard/focus updates may publish an equivalent context before the character lands.
    // Never replace the focused native editor; command results render after focus moves to a button.
    const active = document.activeElement;
    if (active && this.contains(active) && active.matches("input,textarea,select")) return;
    const key = `${value?.observedNode?.id ?? ""}:${JSON.stringify(value?.projection?.data ?? null)}`;
    if (key !== this.#renderKey) { this.#renderKey = key; this.render(); }
  }
  connectedCallback() {
    if (!this.firstChild) this.render();
    this.#syncTimer = setInterval(() => {
      if (this.#context?.projection?.data?.authenticated) this.request("spot.terminal.sync");
    }, 1500);
  }
  disconnectedCallback() { clearInterval(this.#syncTimer); this.#scrollRelease?.abort(); }
  request(commandId, input = {}) {
    const terminalId = this.#context?.observedNode?.id;
    this.dispatchEvent(new CustomEvent("intent-relation-request", {
      bubbles: true, composed: true, detail: { kind: "command", commandId, input: { ...input, terminalId } },
    }));
  }
  #bindSymbolScroller() {
    const strip = this.querySelector(".symbols");
    if (!strip) return;
    let drag, suppressNextClick = false; const pointers = new Set();
    strip.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.button === 0) {
        pointers.add(event.pointerId);
        if (pointers.size > 1) { drag = undefined; return; }
        drag = { id: event.pointerId, x: event.clientX, left: strip.scrollLeft, moved: false, captured: false };
        this.#scrollRelease?.abort(); const controller = new AbortController(); this.#scrollRelease = controller;
        const release = (outside) => { if (outside.pointerId === event.pointerId) finish(outside); };
        globalThis.addEventListener("pointerup", release, { capture: true, signal: controller.signal });
        globalThis.addEventListener("pointercancel", release, { capture: true, signal: controller.signal });
        globalThis.addEventListener("blur", () => finish({ pointerId: event.pointerId }), { signal: controller.signal });
      }
    });
    strip.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) { finish(event); return; }
      const delta = event.clientX - drag.x;
      if (Math.abs(delta) > 4 && !drag.moved) {
        drag.moved = true; drag.captured = true; strip.setPointerCapture(event.pointerId);
      }
      if (drag.moved) { event.preventDefault(); strip.scrollLeft = drag.left - delta; }
    });
    const finish = (event) => {
      pointers.delete(event.pointerId);
      if (drag?.id !== event.pointerId) return;
      if (drag.moved) {
        suppressNextClick = true;
        // Native click follows pointerup in the same task; never swallow a later deliberate tap.
        setTimeout(() => { suppressNextClick = false; }, 0);
      }
      drag = undefined; this.#scrollRelease?.abort(); this.#scrollRelease = undefined;
    };
    strip.addEventListener("pointerup", finish); strip.addEventListener("pointercancel", finish);
    // A completed drag ends over a pair button; suppress that synthetic click once.
    strip.addEventListener("click", (event) => {
      if (!suppressNextClick) return;
      event.preventDefault(); event.stopImmediatePropagation(); suppressNextClick = false;
    }, true);
  }
  #bindOrderUnits() {
    const form = this.querySelector('[data-action="order"]'); if (!form) return;
    const sync = () => {
      const marketBuy = form.elements.type.value === "MARKET_PRICE" && form.elements.direction.value === "BUY";
      const unit = marketBuy ? form.dataset.settlementUnit : form.dataset.tradingUnit;
      form.querySelector("[data-amount-label]").textContent = `${marketBuy ? "结算金额" : "数量"} · ${unit}`;
      form.elements.price.disabled = form.elements.type.value === "MARKET_PRICE";
    };
    form.elements.type.addEventListener("change", sync); sync();
  }
  render() {
    this.#scrollRelease?.abort(); this.#scrollRelease = undefined;
    const state = this.#context?.projection?.data ?? { authenticated: false };
    const active = this.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.name ? { name: active.name, start: active.selectionStart, end: active.selectionEnd } : null;
    const login = this.querySelector('[data-action="login"]');
    const username = login ? new FormData(login).get("username") : null;
    // Live sync may repaint every 1.5s; retain an unfinished order draft across those renders.
    const form = this.querySelector('[data-action="order"]');
    const pending = form && !String(state.notice ?? "").startsWith("下单成功")
      ? Object.fromEntries(new FormData(form)) : null;
    this.innerHTML = `<style>${styles}</style>${state.authenticated ? terminalView(state, this.#view) : loginView(state)}`;
    const usernameInput = this.querySelector('[data-action="login"] [name="username"]');
    if (usernameInput && username !== null) usernameInput.value = String(username);
    if (pending) for (const [name, value] of Object.entries(pending)) {
      const control = this.querySelector(`[data-action="order"] [name="${name}"]`);
      if (control && name !== "direction" && name !== "symbol") control.value = String(value);
    }
    const nextActive = focus && this.querySelector(`[name="${focus.name}"]`);
    if (nextActive) {
      nextActive.focus({ preventScroll: true });
      if (typeof nextActive.setSelectionRange === "function") nextActive.setSelectionRange(focus.start, focus.end);
    }
    this.querySelector('[data-action="login"]')?.addEventListener("submit", (event) => {
      event.preventDefault(); this.request("spot.terminal.login", { username: new FormData(event.currentTarget).get("username") });
    });
    this.querySelector('[data-action="order"]')?.addEventListener("submit", (event) => {
      event.preventDefault(); this.request("spot.terminal.submit", Object.fromEntries(new FormData(event.currentTarget)));
    });
    this.querySelector('[data-action="logout"]')?.addEventListener("click", () => this.request("spot.terminal.logout"));
    this.querySelector('[data-action="bot-toggle"]')?.addEventListener("click", () => this.request("spot.terminal.bot-toggle"));
    this.querySelectorAll("[data-bot-side]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.bot-side", { botSide: button.dataset.botSide })));
    this.querySelectorAll("[data-bot-type]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.bot-type", { botType: button.dataset.botType })));
    this.#bindSymbolScroller();
    this.#bindOrderUnits();
    this.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      this.#view = button.dataset.view; this.render();
    }));
    this.querySelectorAll("[data-symbol]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.select-symbol", { symbol: button.dataset.symbol })));
    this.querySelectorAll("[data-side]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.draft", { direction: button.dataset.side })));
    this.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.cancel", { orderId: button.dataset.cancel })));
  }
}
