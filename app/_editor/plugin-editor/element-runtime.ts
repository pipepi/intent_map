import { assertSameImmutablePlugin } from "./package-identity.ts";
import type { ElementDeclaration, ElementPluginPackage, PluginInstallStatus } from "./package-types.ts";

export type CustomElementLookup = { get(tag: string): unknown };
export type ElementRuntimeAdapter = {
  registry: CustomElementLookup;
  load(source: string): Promise<void>;
};

export type InstalledElementPlugin = ElementPluginPackage & { active: boolean };

export class ElementPluginRegistry {
  readonly #plugins = new Map<string, InstalledElementPlugin>();
  readonly #installing = new Map<string, Promise<PluginInstallStatus>>();
  readonly #runtime: ElementRuntimeAdapter;
  constructor(runtime: ElementRuntimeAdapter) { this.#runtime = runtime; }

  list() { return [...this.#plugins.values()]; }
  get(id: string) { const plugin = this.#plugins.get(id); return plugin?.active ? plugin : undefined; }
  resolve(pluginId: string, elementId: string): ElementDeclaration | undefined {
    return this.get(pluginId)?.manifest.elements.find((element) => element.id === elementId);
  }

  install(plugin: ElementPluginPackage): Promise<PluginInstallStatus> {
    const pending = this.#installing.get(plugin.manifest.id);
    if (pending) return pending.then(() => this.#installOnce(plugin));
    const task = this.#installOnce(plugin).finally(() => {
      if (this.#installing.get(plugin.manifest.id) === task) this.#installing.delete(plugin.manifest.id);
    });
    this.#installing.set(plugin.manifest.id, task);
    return task;
  }

  async #installOnce(plugin: ElementPluginPackage): Promise<PluginInstallStatus> {
    const current = this.#plugins.get(plugin.manifest.id);
    if (current) {
      assertSameImmutablePlugin(current.manifest, plugin.manifest);
      if (current.active) return "already-active";
      this.#plugins.set(plugin.manifest.id, { ...current, active: true });
      return "reactivated";
    }
    for (const element of plugin.manifest.elements) {
      const occupied = this.#runtime.registry.get(element.tag);
      if (occupied) throw new Error(`Custom element tag ${element.tag} is already registered`);
    }
    await this.#runtime.load(plugin.entrySource);
    const missing = plugin.manifest.elements.find((element) => !this.#runtime.registry.get(element.tag));
    if (missing) throw new Error(`Element module did not register ${missing.tag}`);
    this.#plugins.set(plugin.manifest.id, { ...plugin, active: true });
    return "installed";
  }

  disable(id: string) {
    const plugin = this.#plugins.get(id);
    if (!plugin) return;
    this.#plugins.set(id, { ...plugin, active: false });
  }
  enable(id: string) {
    const plugin = this.#plugins.get(id);
    if (plugin) this.#plugins.set(id, { ...plugin, active: true });
  }
  uninstall(id: string) { this.#plugins.delete(id); }
}

export function browserElementRuntime(): ElementRuntimeAdapter {
  return {
    registry: { get: (tag) => typeof customElements === "undefined" ? undefined : customElements.get(tag) },
    async load(source) {
      if (typeof window === "undefined") throw new Error("Element plugins can only run in a browser");
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try { await import(/* webpackIgnore: true */ /* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
    },
  };
}
