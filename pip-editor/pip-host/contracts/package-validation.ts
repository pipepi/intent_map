/** Runtime narrowing for A3/A4 manifests and the non-executable A5 workspace asset. */
import { assertPipManifest } from "../../pip-package/index.ts";
import { assertPipGraph } from "../../pip/index.ts";
import type { ElementPluginManifest, NodeMapWorkspace, NodeTypePluginManifest } from "./package-types.ts";

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};

export function assertElementManifest(value: unknown): asserts value is ElementPluginManifest {
  const manifest = assertPipManifest(value as ElementPluginManifest);
  if (manifest.layer !== "a3") throw new Error("manifest is not an a3 Node Element PIP");
}

export function assertNodeTypeManifest(value: unknown): asserts value is NodeTypePluginManifest {
  const manifest = assertPipManifest(value as NodeTypePluginManifest);
  if (manifest.layer !== "a4") throw new Error("manifest is not an a4 Node Type PIP");
}

export function assertNodeMapWorkspace(value: unknown): asserts value is NodeMapWorkspace {
  const item = record(value, "workspace");
  const unsupported = Object.keys(item).find((key) => !["views", "initialSelection"].includes(key));
  if (unsupported) throw new Error(`workspace contains unsupported key ${unsupported}`);
  if (!("views" in item)) throw new Error("workspace.views is missing");
  if (item.initialSelection !== undefined && (!Array.isArray(item.initialSelection) || item.initialSelection.some((id) => typeof id !== "string" || !id))) throw new Error("initialSelection is invalid");
}

export function assertOntologyGraph(value: unknown): asserts value is import("../../pip/index.ts").Pip {
  assertPipGraph(value);
}
