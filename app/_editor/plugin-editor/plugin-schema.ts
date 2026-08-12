import type { IntentPlugin, NodeTypeDefinition, PluginElement, PluginField } from "./types";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value;
}

function parseField(value: unknown, index: number): PluginField {
  const field = object(value, `fields[${index}]`);
  const control = field.control;
  if (control !== "input" && control !== "textarea") throw new Error(`fields[${index}].control 不受支持`);
  if (typeof field.defaultValue !== "string") throw new Error(`fields[${index}].defaultValue 必须是字符串`);
  return { key: text(field.key, `fields[${index}].key`), label: text(field.label, `fields[${index}].label`), control, defaultValue: field.defaultValue };
}

function parseElement(value: unknown, index: number): PluginElement {
  const element = object(value, `elements[${index}]`);
  if (element.kind !== "text" && element.kind !== "image") throw new Error(`elements[${index}].kind 不受支持`);
  return { kind: element.kind, sourceField: text(element.sourceField, `elements[${index}].sourceField`) };
}

function parseNodeType(value: unknown, index: number): NodeTypeDefinition {
  const node = object(value, `nodeTypes[${index}]`);
  if (!Array.isArray(node.fields) || !node.fields.length) throw new Error(`nodeTypes[${index}].fields 不能为空`);
  const fields = node.fields.map(parseField);
  if (new Set(fields.map((field) => field.key)).size !== fields.length) throw new Error(`nodeTypes[${index}] 包含重复字段`);
  const ui = object(node.ui, `nodeTypes[${index}].ui`);
  if (ui.kind !== "card" || !Array.isArray(ui.elements) || !ui.elements.length) throw new Error(`nodeTypes[${index}].ui 无效`);
  const elements = ui.elements.map(parseElement);
  const keys = new Set(fields.map((field) => field.key));
  if (elements.some((element) => !keys.has(element.sourceField))) throw new Error(`nodeTypes[${index}] 的 UI 引用了不存在的字段`);
  return {
    type: text(node.type, `nodeTypes[${index}].type`), displayName: text(node.displayName, `nodeTypes[${index}].displayName`),
    defaultName: text(node.defaultName, `nodeTypes[${index}].defaultName`), fields, ui: { kind: "card", elements },
  };
}

export function parsePlugin(value: unknown): IntentPlugin {
  const plugin = object(value, "插件");
  if (plugin.schemaVersion !== 1) throw new Error("仅支持 schemaVersion 1");
  if (!Array.isArray(plugin.nodeTypes) || !plugin.nodeTypes.length) throw new Error("nodeTypes 不能为空");
  const nodeTypes = plugin.nodeTypes.map(parseNodeType);
  if (new Set(nodeTypes.map((node) => node.type)).size !== nodeTypes.length) throw new Error("插件包含重复节点类型");
  return { schemaVersion: 1, name: text(plugin.name, "name"), nodeTypes };
}
