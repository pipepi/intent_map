import { assertRelationGraph } from "../../relation/model.ts";
import type { ElementPluginManifest, NodeCollectionManifest, NodeCollectionWorkspace, NodeTypePluginManifest } from "./package-types.ts";

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[a-f0-9]{64}$/;
const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const PURPOSES = new Set(["control", "preview", "node", "projection", "panel"]);
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string, pattern?: RegExp) => {
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) throw new Error(`${label} is invalid`);
  return value;
};
const strings = (value: unknown, label: string, allowEmpty = true) => {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} is invalid`);
  return value as string[];
};
const exactKeys = (value: Record<string, unknown>, allowed: string[], label: string) => {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`${label} contains unsupported key ${unsupported}`);
};
const refs = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new Error(`${label} is invalid`);
  const seen = new Set<string>();
  value.forEach((raw, index) => {
    const item = record(raw, `${label}[${index}]`);
    exactKeys(item, ["id", "version"], `${label}[${index}]`);
    const id = string(item.id, `${label}[${index}].id`, ID);
    string(item.version, `${label}[${index}].version`, VERSION);
    if (seen.has(id)) throw new Error(`${label} contains duplicate ${id}`);
    seen.add(id);
  });
};

export function assertElementManifest(value: unknown): asserts value is ElementPluginManifest {
  const item = record(value, "manifest");
  exactKeys(item, ["format", "schemaVersion", "runtimeAbi", "id", "name", "version", "entry", "elements", "permissions", "sourcePaths", "sourceSha256", "entrySha256", "communityTags", "redistributable"], "manifest");
  if (item.format !== "intent-element-plugin" || item.schemaVersion !== 2 || item.runtimeAbi !== "relation-element/2" || item.entry !== "entry.mjs") throw new Error("element manifest format is invalid or obsolete");
  string(item.id, "id", ID); string(item.name, "name"); string(item.version, "version", VERSION);
  string(item.sourceSha256, "sourceSha256", SHA); string(item.entrySha256, "entrySha256", SHA);
  strings(item.permissions, "permissions"); strings(item.sourcePaths, "sourcePaths", false); strings(item.communityTags, "communityTags");
  if (typeof item.redistributable !== "boolean" || !Array.isArray(item.elements) || !item.elements.length) throw new Error("elements or redistributable is invalid");
  const ids = new Set<string>(), tags = new Set<string>();
  for (const raw of item.elements) {
    const element = record(raw, "element"); exactKeys(element, ["id", "tag", "purpose"], "element");
    const id = string(element.id, "element.id"), tag = string(element.tag, "element.tag", TAG);
    if (!PURPOSES.has(String(element.purpose)) || ids.has(id) || tags.has(tag)) throw new Error("element is invalid or duplicate");
    ids.add(id); tags.add(tag);
  }
}

export function assertNodeTypeManifest(value: unknown): asserts value is NodeTypePluginManifest {
  const item = record(value, "node type manifest");
  exactKeys(item, ["format", "schemaVersion", "runtimeAbi", "id", "name", "version", "entry", "ontology", "elementDependencies", "permissions", "typeNodeIds", "sourcePaths", "sourceSha256", "entrySha256", "redistributable"], "node type manifest");
  if (item.format !== "intent-node-type-plugin" || item.schemaVersion !== 2 || item.runtimeAbi !== "relation-node-type/2" || item.entry !== "entry.mjs" || item.ontology !== "ontology.json") throw new Error("node type manifest format is invalid or obsolete");
  string(item.id, "id", ID); string(item.name, "name"); string(item.version, "version", VERSION);
  string(item.sourceSha256, "sourceSha256", SHA); string(item.entrySha256, "entrySha256", SHA);
  refs(item.elementDependencies, "elementDependencies"); strings(item.permissions, "permissions");
  const ids = strings(item.typeNodeIds, "typeNodeIds", false); if (new Set(ids).size !== ids.length) throw new Error("typeNodeIds contains duplicates");
  strings(item.sourcePaths, "sourcePaths", false); if (typeof item.redistributable !== "boolean") throw new Error("redistributable is invalid");
}

export function assertNodeCollectionManifest(value: unknown): asserts value is NodeCollectionManifest {
  const item = record(value, "collection manifest");
  exactKeys(item, ["format", "schemaVersion", "id", "name", "version", "rootNodeIds", "dependencies"], "collection manifest");
  if (item.format !== "intent-node-collection" || item.schemaVersion !== 2) throw new Error("collection manifest format is invalid or obsolete");
  string(item.id, "id", ID); string(item.name, "name"); string(item.version, "version", VERSION);
  const roots = strings(item.rootNodeIds, "rootNodeIds", false); if (new Set(roots).size !== roots.length) throw new Error("rootNodeIds contains duplicates");
  const dependencies = record(item.dependencies, "dependencies"); exactKeys(dependencies, ["nodeTypes", "elements"], "dependencies");
  refs(dependencies.nodeTypes, "dependencies.nodeTypes"); refs(dependencies.elements, "dependencies.elements");
}

export function assertNodeCollectionWorkspace(value: unknown): asserts value is NodeCollectionWorkspace {
  const item = record(value, "workspace"); exactKeys(item, ["views", "initialSelection"], "workspace");
  if (!("views" in item)) throw new Error("workspace.views is missing");
  if (item.initialSelection !== undefined) strings(item.initialSelection, "initialSelection");
}

export function assertOntologyGraph(value: unknown): asserts value is import("../../relation/model.ts").RelationGraph {
  assertRelationGraph(value);
}
