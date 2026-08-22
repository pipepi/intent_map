/** Activates embedded dependencies in Element-before-Node-Type order and reports isolated failures. */
import type { PortableCollection } from "../packages/collection-package.ts";
import type { ElementPluginPackage, NodeTypePluginPackage, PluginInstallStatus } from "../contracts/package-types.ts";
import type { CapabilityDiagnostic } from "../workspace/workspace-store.ts";

type ActivePackage<T> = T & { active: boolean };

export type CollectionActivationHost = {
  elements(): Array<ActivePackage<ElementPluginPackage>>;
  nodeTypes(): Array<ActivePackage<NodeTypePluginPackage>>;
  installElement(plugin: ElementPluginPackage): Promise<PluginInstallStatus>;
  installNodeType(plugin: NodeTypePluginPackage): Promise<PluginInstallStatus>;
};

export async function activateCollectionDependencies(portable: PortableCollection, host: CollectionActivationHost) {
  const diagnostics: CapabilityDiagnostic[] = [];
  for (const dependency of portable.collection.manifest.dependencies.elements) {
    const current = host.elements().find((item) => item.manifest.id === dependency.id);
    if (current && !current.active) {
      diagnostics.push({ dependencyKind: "element", dependency, stage: "resolve", message: "元素插件已被用户禁用" });
      continue;
    }
    const embedded = portable.elementPlugins.find((item) => item.manifest.id === dependency.id && item.manifest.version === dependency.version);
    if (!embedded && (!current || current.manifest.version !== dependency.version)) {
      diagnostics.push({ dependencyKind: "element", dependency, stage: "resolve", message: "缺少精确版本元素插件" });
      continue;
    }
    if (embedded) try { await host.installElement(embedded); } catch (error) {
      const reason = error instanceof Error ? error.message : "元素插件激活失败";
      diagnostics.push({ dependencyKind: "element", dependency, stage: "activate", message: `${reason}；主窗口代码可能已执行，刷新后才能彻底清除副作用` });
    }
  }
  for (const dependency of portable.collection.manifest.dependencies.nodeTypes) {
    const current = host.nodeTypes().find((item) => item.manifest.id === dependency.id);
    if (current && !current.active) {
      diagnostics.push({ dependencyKind: "node-type", dependency, stage: "resolve", message: "节点类型插件已被用户禁用" });
      continue;
    }
    const embedded = portable.nodeTypes.find((item) => item.manifest.id === dependency.id && item.manifest.version === dependency.version);
    if (!embedded && (!current || current.manifest.version !== dependency.version)) {
      diagnostics.push({ dependencyKind: "node-type", dependency, stage: "resolve", message: "缺少精确版本节点类型插件" });
      continue;
    }
    if (embedded) try { await host.installNodeType(embedded); } catch (error) {
      const reason = error instanceof Error ? error.message : "节点类型插件激活失败";
      diagnostics.push({ dependencyKind: "node-type", dependency, stage: "activate", message: `${reason}；主窗口代码可能已执行，刷新后才能彻底清除副作用` });
    }
  }
  return diagnostics;
}
