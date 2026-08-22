/** Activates a prevalidated A5 closure in dependency order: every A3 before any A4. */
import type { PortableNodeMap } from "../packages/node-map-package.ts";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus } from "../contracts/package-types.ts";

type ActivePackage<T> = T & { active: boolean };
export type NodeMapActivationHost = {
  elements(): Array<ActivePackage<ElementPluginPackage>>;
  nodeTypes(): Array<ActivePackage<NodeTypePluginPackage>>;
  installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus>;
  installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus>;
};

/** Package decoding already proved the complete exact closure, so activation never performs partial resolution. */
export async function activateNodeMapDependencies(portable: PortableNodeMap, host: NodeMapActivationHost) {
  for (const plugin of portable.elementPlugins) {
    const current = host.elements().find((item) => item.manifest.packageId === plugin.manifest.packageId);
    if (current && !current.active) throw new Error(`Node Element ${plugin.manifest.packageId} 已被用户禁用`);
  }
  for (const plugin of portable.nodeTypes) {
    const current = host.nodeTypes().find((item) => item.manifest.packageId === plugin.manifest.packageId);
    if (current && !current.active) throw new Error(`Node Type ${plugin.manifest.packageId} 已被用户禁用`);
  }
  for (const plugin of portable.elementPlugins) await host.installElement(plugin);
  for (const plugin of portable.nodeTypes) await host.installNodeType(plugin);
}
