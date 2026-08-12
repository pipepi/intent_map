import type { ElementPluginManifest, NodeCollection, NodeTypePackage } from "./package-types";

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[a-f0-9]{64}$/;
const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, pattern?: RegExp) {
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) throw new Error(`${label} is invalid`);
  return value;
}
function strings(value: unknown, label: string, allowEmpty = true) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some((item) => typeof item !== "string")) throw new Error(`${label} is invalid`);
  return value as string[];
}
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported keys`);
}

export function assertElementManifest(value: unknown): asserts value is ElementPluginManifest {
  const item = record(value, "manifest");
  exactKeys(item, ["format", "schemaVersion", "id", "name", "version", "entry", "elements", "permissions", "sourcePaths", "sourceSha256", "entrySha256", "communityTags", "redistributable"], "manifest");
  if (item.format !== "intent-element-plugin" || item.schemaVersion !== 1 || item.entry !== "entry.mjs") throw new Error("manifest format is invalid");
  string(item.id, "id", ID); string(item.name, "name"); string(item.version, "version", VERSION);
  string(item.sourceSha256, "sourceSha256", SHA); string(item.entrySha256, "entrySha256", SHA);
  strings(item.permissions, "permissions"); strings(item.sourcePaths, "sourcePaths", false); strings(item.communityTags, "communityTags");
  if (typeof item.redistributable !== "boolean" || !Array.isArray(item.elements) || !item.elements.length) throw new Error("elements or redistributable is invalid");
  const seen = new Set<string>();
  for (const raw of item.elements) { const element = record(raw, "element"); const id = string(element.id, "element.id"); string(element.tag, "element.tag", TAG); if (!['control', 'preview'].includes(String(element.purpose)) || seen.has(id)) throw new Error("element is invalid or duplicate"); seen.add(id); }
}

function assertReference(value: unknown) { const ref = record(value, "element reference"); string(ref.pluginId, "pluginId", ID); string(ref.elementId, "elementId"); string(ref.sourceField, "sourceField"); if (ref.properties !== undefined) record(ref.properties, "properties"); }
export function assertNodeTypePackage(value: unknown): asserts value is NodeTypePackage {
  const item = record(value, "node type package"); exactKeys(item, ["format", "schemaVersion", "id", "name", "version", "dependencies", "nodeTypes"], "node type package");
  if (item.format !== "intent-node-type-plugin" || item.schemaVersion !== 1) throw new Error("node type format is invalid");
  string(item.id, "id", ID); string(item.name, "name"); string(item.version, "version", VERSION);
  if (!Array.isArray(item.dependencies) || !Array.isArray(item.nodeTypes) || !item.nodeTypes.length) throw new Error("dependencies or nodeTypes is invalid");
  item.dependencies.forEach((raw) => { const dep = record(raw, "dependency"); string(dep.id, "dependency.id", ID); string(dep.version, "dependency.version", VERSION); });
  item.nodeTypes.forEach((raw) => { const node = record(raw, "nodeType"); string(node.type, "nodeType.type"); string(node.displayName, "displayName"); string(node.defaultName, "defaultName"); if (!Array.isArray(node.fields) || !Array.isArray(node.view)) throw new Error("node fields/view invalid"); node.fields.forEach((fieldRaw) => { const field = record(fieldRaw, "field"); string(field.key, "field.key"); if (typeof field.defaultValue !== "string") throw new Error("defaultValue invalid"); assertReference(field.control); }); node.view.forEach(assertReference); });
}
export function assertNodeCollection(value: unknown): asserts value is NodeCollection {
  const item = record(value, "collection"); if (item.format !== "intent-node-collection" || item.schemaVersion !== 1) throw new Error("collection format invalid");
  string(item.id, "collection.id"); string(item.name, "collection.name"); if (!Array.isArray(item.dependencies) || !Array.isArray(item.nodes) || !Array.isArray(item.edges)) throw new Error("collection arrays invalid");
  item.nodes.forEach((raw) => { const node = record(raw, "node"); string(node.id, "node.id"); string(node.type, "node.type"); string(node.name, "node.name"); record(node.values, "node.values"); if (![node.x, node.y].every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("node position invalid"); });
  item.edges.forEach((raw) => { const edge = record(raw, "edge"); string(edge.id, "edge.id"); string(edge.sourceId, "edge.sourceId"); string(edge.targetId, "edge.targetId"); });
}
