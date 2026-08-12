import { assertNodeTypePackage } from "./package-validation.ts";
import type { ElementPluginPackage, NodeTypePackage } from "./package-types.ts";

export function parseNodeTypePackage(text: string) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("节点类型文件不是有效 JSON"); }
  assertNodeTypePackage(value);
  return value;
}

export function validateNodeTypeDependencies(plugin: NodeTypePackage, elements: ElementPluginPackage[]) {
  for (const dependency of plugin.dependencies) {
    const installed = elements.find((item) => item.manifest.id === dependency.id);
    if (!installed) throw new Error(`缺少元素插件 ${dependency.id}@${dependency.version}`);
    if (installed.manifest.version !== dependency.version) throw new Error(`元素插件 ${dependency.id} 需要精确版本 ${dependency.version}`);
  }
  const declarations = new Map(elements.flatMap((item) => item.manifest.elements.map((element) => [`${item.manifest.id}/${element.id}`, element] as const)));
  for (const type of plugin.nodeTypes) {
    for (const ref of [...type.fields.map((field) => field.control), ...type.view]) {
      if (!declarations.has(`${ref.pluginId}/${ref.elementId}`)) throw new Error(`未知节点元素 ${ref.pluginId}/${ref.elementId}`);
    }
  }
}
