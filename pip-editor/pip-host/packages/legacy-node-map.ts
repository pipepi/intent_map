import type { NodeMapManifest } from "../contracts/package-types.ts";
import { migrate_identifier } from "../../pip/legacy-identifiers.ts";

const legacy_capabilities = new Map([
  ["relation-element/2", "pip-element/2"],
  ["relation-node-type/2", "pip-node-type/2"],
  ["relation-node-map/1", "pip-node-map/1"],
  ["relation-graph/1", "pip-graph/1"],
  ["relation-host/1", "pip-host/1"],
  ["relation-workspace/1", "pip-workspace/1"],
  ["relation-workspace/2", "pip-workspace/2"],
  ["relation-workspace/3", "pip-workspace/3"],
]);

function migrate_capability(value: string): string {
  return legacy_capabilities.get(value) ?? value;
}

/** 原包校验后派生运行时清单；依赖身份及哈希始终保留，不能替换为近似版本。 */
export function migrate_node_map_manifest(manifest: NodeMapManifest): NodeMapManifest {
  if (manifest.nodeMapAbi !== "relation-node-map/1") {
    return manifest;
  }
  return {
    ...manifest,
    nodeMapAbi: "pip-node-map/1",
    rootNodeId: migrate_identifier(manifest.rootNodeId),
    rootNodeIds: manifest.rootNodeIds.map(migrate_identifier),
    providedEditorKinds: manifest.providedEditorKinds.map(migrate_capability),
    supportedDocumentKinds: manifest.supportedDocumentKinds.map(migrate_capability),
    preferredEditorKinds: manifest.preferredEditorKinds.map(migrate_capability),
    requiredEditorCapabilities: manifest.requiredEditorCapabilities.map(migrate_capability),
    providedCapabilities: manifest.providedCapabilities.map(migrate_capability),
    requiredCapabilities: manifest.requiredCapabilities.map(migrate_capability),
    requiredAuthoringCapabilities: manifest.requiredAuthoringCapabilities.map(migrate_capability),
    ...(manifest.authoringKind ? { authoringKind: migrate_capability(manifest.authoringKind) } : {}),
    ...(manifest.authoringCompiler ? { authoringCompiler: migrate_capability(manifest.authoringCompiler) } : {}),
  };
}
