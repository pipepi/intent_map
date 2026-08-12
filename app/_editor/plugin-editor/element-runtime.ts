import type { ElementDeclaration, ElementPluginPackage } from "./package-types.ts";

export type CustomElementLookup = { get(tag: string): unknown };
export type ElementRuntimeAdapter = {
  registry: CustomElementLookup;
  load(source: string): Promise<void>;
};

export type InstalledElementPlugin = ElementPluginPackage & { active: boolean };

export class ElementPluginRegistry {
  readonly #plugins = new Map<string, InstalledElementPlugin>();
  readonly #runtime: ElementRuntimeAdapter;
  constructor(runtime: ElementRuntimeAdapter) { this.#runtime = runtime; }

  list() { return [...this.#plugins.values()]; }
  get(id: string) { const plugin = this.#plugins.get(id); return plugin?.active ? plugin : undefined; }
  resolve(pluginId: string, elementId: string): ElementDeclaration | undefined {
    return this.get(pluginId)?.manifest.elements.find((element) => element.id === elementId);
  }

  async install(plugin: ElementPluginPackage) {
    const current = this.#plugins.get(plugin.manifest.id);
    if (current?.active) throw new Error(`Element plugin ${plugin.manifest.id} is already installed`);
    for (const element of plugin.manifest.elements) {
      const occupied = this.#runtime.registry.get(element.tag);
      const previouslyOwned = current?.manifest.elements.some((item) => item.tag === element.tag);
      if (occupied && !previouslyOwned) throw new Error(`Custom element tag ${element.tag} is already registered`);
    }
    await this.#runtime.load(plugin.entrySource);
    const missing = plugin.manifest.elements.find((element) => !this.#runtime.registry.get(element.tag));
    if (missing) throw new Error(`Element module did not register ${missing.tag}`);
    this.#plugins.set(plugin.manifest.id, { ...plugin, active: true });
  }

  disable(id: string) {
    const plugin = this.#plugins.get(id);
    if (!plugin) return;
    this.#plugins.set(id, { ...plugin, active: false });
  }
}

export function browserElementRuntime(): ElementRuntimeAdapter {
  return {
    registry: customElements,
    async load(source) {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try { await import(/* webpackIgnore: true */ url); } finally { URL.revokeObjectURL(url); }
    },
  };
}
