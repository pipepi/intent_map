/** Turns a Node Type module into registered types, commands, validators, projections, and language providers. */
import type {
  Disposable,
  NodeTypePluginHost,
  NodeTypePluginPackage,
  RelationCommandHandler,
  RelationExecutor,
  RelationLanguageProvider,
  RelationProjection,
  RelationCreator,
  RelationValidator,
  ResolvedNodeType,
  PluginInstallStatus,
} from "../contracts/package-types.ts";
import { assertSameImmutablePlugin } from "../packages/package-identity.ts";
import { assertProjectionRegistration } from "../projection/projection-context.ts";

type LoadedNodeTypeModule = { default?: (host: NodeTypePluginHost) => void | Disposable };
export type NodeTypeRuntimeAdapter = { load(source: string): Promise<LoadedNodeTypeModule> };
type InstalledNodeTypePlugin = NodeTypePluginPackage & { active: boolean; disposables: Array<() => void> };
const typeKey = (type: ResolvedNodeType["type"]) => `${type.nodeId}\u0000${type.relationId}`;
const dispose = (value: Disposable | void) => {
  if (typeof value === "function") value();
  else value?.dispose();
};
const releaseAll = (releases: Array<() => void>) => {
  const errors: unknown[] = [];
  for (const release of [...releases].reverse()) {
    try { release(); } catch (error) { errors.push(error); }
  }
  return errors;
};

export class NodeTypePluginRegistry {
  readonly runtime: NodeTypeRuntimeAdapter;
  readonly #plugins = new Map<string, InstalledNodeTypePlugin>();
  readonly #types = new Map<string, { pluginId: string; value: ResolvedNodeType }>();
  readonly #validators = new Set<RelationValidator>();
  readonly #commands = new Map<string, { pluginId: string; value: RelationCommandHandler }>();
  readonly #executors = new Map<string, { pluginId: string; value: RelationExecutor }>();
  readonly #projections = new Map<string, { pluginId: string; value: RelationProjection }>();
  readonly #languages = new Map<string, { pluginId: string; value: RelationLanguageProvider }>();
  readonly #creators = new Map<string, { pluginId: string; value: RelationCreator }>();
  readonly #installing = new Map<string, Promise<PluginInstallStatus>>();

  constructor(runtime: NodeTypeRuntimeAdapter) { this.runtime = runtime; }
  list() { return [...this.#plugins.values()]; }
  types() { return [...this.#types.values()].map(({ value }) => value); }
  validators() { return [...this.#validators]; }
  commands() { return new Map([...this.#commands].map(([id, item]) => [id, item.value])); }
  executors() { return new Map([...this.#executors].map(([id, item]) => [id, item.value])); }
  projections() { return [...this.#projections.values()].map(({ value }) => value); }
  languageProviders() { return [...this.#languages.values()].map(({ value }) => value); }
  creators() { return [...this.#creators.values()].map(({ value }) => value); }
  resolveType(type: ResolvedNodeType["type"]) { return this.#types.get(typeKey(type))?.value; }

  install(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus> {
    const pending = this.#installing.get(plugin.manifest.packageId);
    if (pending) return pending.then(() => this.#installOnce(plugin));
    const task = this.#installOnce(plugin).finally(() => {
      if (this.#installing.get(plugin.manifest.packageId) === task) this.#installing.delete(plugin.manifest.packageId);
    });
    this.#installing.set(plugin.manifest.packageId, task);
    return task;
  }

  async #installOnce(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus> {
    const current = this.#plugins.get(plugin.manifest.packageId);
    if (current) {
      assertSameImmutablePlugin(current.manifest, plugin.manifest);
      if (current.active) return "already-active";
    }
    const disposables: Array<() => void> = [];
    const registeredTypes = new Set<string>();
    const own = <T>(map: Map<string, { pluginId: string; value: T }>, id: string, value: T, label: string): Disposable => {
      if (map.has(id)) throw new Error(`${label} ${id} is already registered`);
      map.set(id, { pluginId: plugin.manifest.packageId, value });
      const release = () => { if (map.get(id)?.pluginId === plugin.manifest.packageId) map.delete(id); };
      disposables.push(release);
      return release;
    };
    const host: NodeTypePluginHost = {
      registerType: (descriptor) => {
        const key = typeKey(descriptor.type);
        registeredTypes.add(key);
        return own(this.#types, key, descriptor, "Node type");
      },
      registerValidator: (validator) => {
        this.#validators.add(validator);
        const release = () => this.#validators.delete(validator);
        disposables.push(release); return release;
      },
      registerCommand: (id, command) => own(this.#commands, id, command, "Command"),
      registerExecutor: (id, executor) => own(this.#executors, id, executor, "Executor"),
      registerProjection: (projection) => {
        assertProjectionRegistration(projection);
        return own(this.#projections, projection.id, projection, "Projection");
      },
      registerCreator: (creator) => own(this.#creators, creator.id, creator, "Creator"),
      registerLanguageProvider: (provider) => own(this.#languages, provider.id, provider, "Language provider"),
    };
    try {
      const loaded = await this.runtime.load(plugin.entrySource);
      if (typeof loaded.default !== "function") throw new Error("Node type entry must default-export a register function");
      const pluginDisposable = loaded.default(host);
      if (pluginDisposable) disposables.push(() => dispose(pluginDisposable));
      const expectedTypes = new Set(plugin.manifest.typeNodeIds.map((nodeId) => typeKey({ nodeId, relationId: "identity" })));
      const missing = [...expectedTypes].filter((key) => !registeredTypes.has(key));
      const extra = [...registeredTypes].filter((key) => !expectedTypes.has(key));
      if (missing.length || extra.length) {
        const show = (key: string) => key.replace("\u0000", "/");
        throw new Error(`Node type registrations do not match manifest; missing [${missing.map(show).join(", ")}], extra [${extra.map(show).join(", ")}]`);
      }
      this.#plugins.set(plugin.manifest.packageId, { ...plugin, active: true, disposables });
      return current ? "reactivated" : "installed";
    } catch (error) {
      const cleanupErrors = releaseAll(disposables);
      if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], `Node type plugin ${plugin.manifest.packageId} failed and cleanup reported errors`);
      throw error;
    }
  }

  disable(id: string) {
    const plugin = this.#plugins.get(id);
    if (!plugin?.active) return;
    const errors = releaseAll(plugin.disposables);
    this.#plugins.set(id, { ...plugin, active: false, disposables: [] });
    if (errors.length) throw new AggregateError(errors, `Node type plugin ${id} was disabled but cleanup reported errors`);
  }
  uninstall(id: string) {
    let cleanupError: unknown;
    try { this.disable(id); } catch (error) { cleanupError = error; }
    this.#plugins.delete(id);
    if (cleanupError) throw cleanupError;
  }
}

export function browserNodeTypeRuntime(): NodeTypeRuntimeAdapter {
  return {
    async load(source) {
      if (typeof window === "undefined") throw new Error("Node type plugins can only run in a browser");
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try { return await import(/* webpackIgnore: true */ /* @vite-ignore */ url) as LoadedNodeTypeModule; }
      finally { URL.revokeObjectURL(url); }
    },
  };
}
