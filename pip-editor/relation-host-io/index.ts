/** A2 内置系统节点插件的组合入口。 */
import { pluginManagerSystemPlugin } from "./plugin-manager/definition.tsx";
import { SystemPluginRegistry } from "./system-plugin/registry.ts";

export const createBuiltinSystemPluginRegistry = () =>
  new SystemPluginRegistry([
    pluginManagerSystemPlugin,
  ]);

export * from "./plugin-manager/definition.tsx";
export * from "./system-plugin/index.ts";
