import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PluginPanel } from "./plugin-panel.tsx";

export type SystemPluginManagerModel = Parameters<typeof PluginPanel>[0];

class HostPluginManagerElement extends HTMLElement {
  #root?: Root;
  #model?: SystemPluginManagerModel;
  set model(value: SystemPluginManagerModel) { this.#model = value; this.#render(); }
  connectedCallback() { this.#render(); }
  disconnectedCallback() { queueMicrotask(() => { if (!this.isConnected) { this.#root?.unmount(); this.#root = undefined; } }); }
  #render() {
    if (!this.isConnected || !this.#model) return;
    this.#root ??= createRoot(this); this.#root.render(<PluginPanel {...this.#model} />);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("host-plugin-manager-window")) customElements.define("host-plugin-manager-window", HostPluginManagerElement);

export function SystemPluginManager(model: SystemPluginManagerModel) {
  return createElement("host-plugin-manager-window", { ref: (element: HostPluginManagerElement | null) => { if (element) element.model = model; }, style: { display: "block", width: "100%", height: "100%" } });
}
