import { loginView, terminalView } from "./render.js";
import { styles } from "./styles.js";
import { captureSellScroll, restoreSellScroll } from "./book-scroll.js";
import { mountGuardToggle } from "./bot-controls.js";
import { windowChromeKey, windowNavigation } from "./window-navigation.js";
import { childrenTerminal, embeddedTerminal, worldTerminal } from "./projection-views.js";

// A2 may recreate the custom element while a native input event is still in flight.
// Keep only the non-sensitive username draft by observed node; auth tokens remain in A4 memory.
const loginDrafts = new Map();

const loginDraft = (terminalId) => loginDrafts.get(terminalId) ?? { username: "", password: "", field: "username" };

export class SpotTerminalElement extends HTMLElement {
  #context;
  #renderKey;
  #syncTimer;
  #lastSync = 0;
  #view = "trade";
  #scrollRelease;
  set context(value) {
    const previous = this.#context?.projection?.data;
    this.#context = value;
    const next = value?.projection?.data;
    const chromeChanged = windowChromeKey(previous) !== windowChromeKey(next);
    const stableLogin = previous && next && !next.authenticated && this.querySelector('[data-action="login"]') &&
      !chromeChanged && ["environment", "authenticated", "loading", "error", "notice"].every((key) => previous[key] === next[key]);
    // Host focus and keyboard updates may republish window state. An unchanged
    // login state must leave the native editor, autocomplete and caret intact.
    if (stableLogin) return;
    // Host keyboard/focus updates may publish an equivalent context before the character lands.
    // Never replace the focused native editor; command results render after focus moves to a button.
    const active = document.activeElement;
    if (!chromeChanged && active && this.contains(active) && active.matches("input,textarea,select")) return;
    const key = `${value?.observedNode?.id ?? ""}:${JSON.stringify(value?.projection?.data ?? null)}`;
    if (key !== this.#renderKey) { this.#renderKey = key; this.render(); }
  }
  connectedCallback() {
    if (!this.firstChild) this.render();
    this.#syncTimer = setInterval(() => {
      const state = this.#context?.projection?.data, interval = state?.botFast && state?.botEnabled ? 200 : 1500;
      // Parent-space cards are passive summaries; only workspace projections drive runtime refresh.
      if (state?.authenticated && state?.runtimeActive !== false && Date.now() - this.#lastSync >= interval) {
        this.#lastSync = Date.now(); this.request("spot.terminal.sync");
      }
    }, 200);
  }
  disconnectedCallback() {
    clearInterval(this.#syncTimer); this.#scrollRelease?.abort();
  }
  request(commandId, input = {}) {
    const terminalId = this.#context?.observedNode?.id;
    this.dispatchEvent(new CustomEvent("intent-relation-request", {
      bubbles: true, composed: true, detail: { kind: "command", commandId, input: { ...input, terminalId } },
    }));
  }
  hostRequest(detail) {
    this.dispatchEvent(new CustomEvent("intent-relation-request", { bubbles: true, composed: true, detail }));
  }
  #updateWindow(delta) {
    const chrome = this.#context?.projection?.data?.windowChrome;
    if (!chrome?.frame?.navigation) return;
    const frame = structuredClone(chrome.frame), navigation = frame.navigation;
    if (delta) navigation.index = Math.max(0, Math.min(navigation.entries.length - 1, navigation.index + delta));
    if (delta) navigation.semanticScale = 1;
    this.hostRequest({ kind: "set-workspace-window", windowId: chrome.windowId, frame });
  }
  #selectProjection(projectionNodeId) {
    const chrome = this.#context?.projection?.data?.windowChrome;
    const option = chrome?.options?.find((item) => item.projectionNodeId === projectionNodeId);
    if (!chrome?.frame?.navigation || !option) return;
    const frame = structuredClone(chrome.frame), navigation = frame.navigation;
    const current = navigation.entries[navigation.index], next = {
      projectionNodeId: option.projectionNodeId,
      observedNodeId: option.observedNodeId,
      scope: option.scope,
    };
    if (current.scope === option.scope) navigation.entries[navigation.index] = next;
    else if (current.scope === "self" && option.scope === "children" && option.semanticTarget) {
      navigation.entries = [...navigation.entries.slice(0, navigation.index + 1), next];
      navigation.index += 1;
    } else if (current.scope === "children" && option.scope === "self" && navigation.index > 0) {
      navigation.index -= 1;
      navigation.entries = [...navigation.entries.slice(0, navigation.index), next];
    } else return;
    navigation.semanticScale = 1;
    frame.contentOffset = { x: 0, y: 0 };
    this.hostRequest({ kind: "set-workspace-window", windowId: chrome.windowId, frame });
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
      form.elements.amount.step = marketBuy ? form.dataset.baseStep : form.dataset.coinStep;
      form.elements.amount.min = (marketBuy ? form.dataset.minTurnover : form.dataset.minVolume) || form.elements.amount.step;
      form.elements.price.disabled = form.elements.type.value === "MARKET_PRICE";
    };
    form.elements.type.addEventListener("change", sync); sync();
  }
  render() {
    this.#scrollRelease?.abort(); this.#scrollRelease = undefined;
    const sellScroll = captureSellScroll(this.querySelector(".sell-side"));
    const state = this.#context?.projection?.data ?? { authenticated: false };
    const active = this.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.name ? { name: active.name, start: active.selectionStart, end: active.selectionEnd } : null;
    const login = this.querySelector('[data-action="login"]');
    const terminalId = this.#context?.observedNode?.id;
    // A beforeinput prediction is newer than the old DOM value when the host
    // refreshes between the native edit event and the browser's value mutation.
    const storedLogin = loginDrafts.get(terminalId);
    const username = storedLogin ? storedLogin.username : login ? new FormData(login).get("username") : null;
    const password = storedLogin ? storedLogin.password : login ? new FormData(login).get("password") : null;
    // Live sync may repaint every 1.5s; retain an unfinished order draft across those renders.
    const form = this.querySelector('[data-action="order"]');
    const pending = form && !String(state.notice ?? "").startsWith("下单成功")
      ? Object.fromEntries(new FormData(form)) : null;
    const content = state.viewKind === "embedded" ? embeddedTerminal(state)
      : state.viewKind === "world" ? worldTerminal(state)
      : state.viewKind === "children" ? childrenTerminal(state)
        : state.authenticated ? terminalView(state, this.#view) : loginView(state);
    this.innerHTML = `<style>${styles}</style>${windowNavigation(state)}${content}`;
    if (state.authenticated) mountGuardToggle(this, state);
    restoreSellScroll(this.querySelector(".sell-side"), sellScroll);
    const usernameInput = this.querySelector('[data-action="login"] [name="username"]');
    if (usernameInput && username !== null) usernameInput.value = String(username);
    const passwordInput = this.querySelector('[data-action="login"] [name="password"]');
    if (passwordInput && password !== null) passwordInput.value = String(password);
    usernameInput?.addEventListener("beforeinput", (event) => {
      const input = event.currentTarget, start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start, data = event.data ?? "";
      const draft = loginDraft(terminalId), value = event.inputType.startsWith("insert")
        ? input.value.slice(0, start) + data + input.value.slice(end)
        : event.inputType === "deleteContentBackward"
          ? input.value.slice(0, start === end ? Math.max(0, start - 1) : start) + input.value.slice(end) : input.value;
      loginDrafts.set(terminalId, { ...draft, username: value });
    });
    usernameInput?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      // Some hosts publish focus state during keydown, before the browser mutates
      // the input. Persist the predicted edit so a replacement element restores it.
      const start = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
      const end = event.currentTarget.selectionEnd ?? start;
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey)
        loginDrafts.set(terminalId, { ...loginDraft(terminalId), username: event.currentTarget.value.slice(0, start) + event.key + event.currentTarget.value.slice(end) });
      else if (event.key === "Backspace")
        loginDrafts.set(terminalId, { ...loginDraft(terminalId), username: event.currentTarget.value.slice(0, start === end ? Math.max(0, start - 1) : start) + event.currentTarget.value.slice(end) });
    });
    usernameInput?.addEventListener("input", (event) => loginDrafts.set(terminalId, { ...loginDraft(terminalId), username: event.currentTarget.value }));
    passwordInput?.addEventListener("input", (event) => loginDrafts.set(terminalId, { ...loginDraft(terminalId), password: event.currentTarget.value }));
    this.querySelectorAll("[data-login-field]").forEach((button) => button.addEventListener("click", () => {
      const field = button.dataset.loginField;
      loginDrafts.set(terminalId, { ...loginDraft(terminalId), field });
      this.querySelector(`[name="${field}"]`)?.focus({ preventScroll: true });
    }));
    this.querySelectorAll("[data-login-key]").forEach((button) => button.addEventListener("click", () => {
      const draft = loginDraft(terminalId), field = draft.field;
      const key = button.dataset.loginKey, current = draft[field] ?? "";
      const value = key === "clear" ? "" : key === "backspace" ? current.slice(0, -1) : current + key;
      loginDrafts.set(terminalId, { ...draft, [field]: value });
      const input = this.querySelector(`[name="${field}"]`); if (input) input.value = value;
    }));
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
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const draft = loginDraft(terminalId);
      const value = fields.get("username") || draft.username || "";
      const password = fields.get("password") || draft.password || "";
      loginDrafts.delete(terminalId); this.request("spot.terminal.login", { username: value, password });
    });
    this.querySelector('[data-action="order"]')?.addEventListener("submit", (event) => {
      event.preventDefault(); this.request("spot.terminal.submit", Object.fromEntries(new FormData(event.currentTarget)));
    });
    this.querySelector('[data-action="logout"]')?.addEventListener("click", () => this.request("spot.terminal.logout"));
    this.querySelector('[data-action="bot-toggle"]')?.addEventListener("click", () => this.request("spot.terminal.bot-toggle"));
    this.querySelector('[data-action="bot-fast"]')?.addEventListener("click", () => this.request("spot.terminal.bot-fast"));
    this.querySelector('[data-action="bot-guard"]')?.addEventListener("click", () => this.request("spot.terminal.bot-guard"));
    this.querySelectorAll("[data-environment]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.environment === state.environment) return;
      this.querySelectorAll("[data-environment]").forEach((item) => { item.disabled = true; });
      const target = this.querySelector("[data-environment-target]");
      if (target) target.textContent = "正在切换环境…";
      this.request("spot.terminal.switch-environment", { environment: button.dataset.environment });
    }));
    this.querySelector('[data-window-back]')?.addEventListener("click", () => this.#updateWindow(-1));
    this.querySelector('[data-window-forward]')?.addEventListener("click", () => this.#updateWindow(1));
    this.querySelector('[data-window-projection]')?.addEventListener("change", (event) => this.#selectProjection(event.currentTarget.value));
    this.querySelectorAll("[data-bot-side]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.bot-side", { botSide: button.dataset.botSide })));
    this.querySelectorAll("[data-bot-type]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.bot-type", { botType: button.dataset.botType })));
    this.#bindSymbolScroller();
    this.#bindOrderUnits();
    this.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      this.#view = button.dataset.view; this.render();
    }));
    this.querySelectorAll("[data-symbol]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.select-symbol", { symbol: button.dataset.symbol })));
    this.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.select-period", { period: button.dataset.period })));
    this.querySelectorAll("[data-side]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.draft", { direction: button.dataset.side })));
    this.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => this.request("spot.terminal.cancel", { orderId: button.dataset.cancel })));
  }
}
