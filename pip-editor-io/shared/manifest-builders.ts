/** Deterministic A3–A5 manifest construction for official external PIP packages. */
import { UNLIMITED_PIP_IO_POLICY, type PipPackageRef } from "../../pip-editor/pip/index.ts";
import type { ElementPluginManifest, NodeMapManifest, NodeTypePluginManifest } from "../../pip-editor/relation-host/contracts/package-types.ts";

const VERSION = "2.0.0", RELEASE_DATE = "20260822", CREATED_AT = "2026-08-22T00:00:00.000Z";
const artifact = (id: string) => id.replaceAll(".", "_").replaceAll("-", "_").replace(/_(elements|types|workspace)$/, "");
const common = (packageId: string, artifactName: string, name: string, rootNodeId: string) => ({
  packageId, artifactName, name, packageVersion: VERSION, releaseDate: RELEASE_DATE, rootNodeId,
  loaderAbi: "pip-loader/1" as const, artifactRole: "source-and-runtime" as const,
  providedEditorKinds: [], supportedDocumentKinds: ["relation-graph/1"], preferredEditorKinds: ["relation-graph/1"],
  requiredEditorCapabilities: [], providedCapabilities: [], requiredCapabilities: [], requiredAuthoringCapabilities: [],
  ioPolicy: UNLIMITED_PIP_IO_POLICY, createdAt: CREATED_AT, contentType: "application/vnd.intent-map.pip" as const,
});

export const baseElementManifest = (id: string, name: string, sourcePaths = ["source/index.js"]): ElementPluginManifest => ({
  ...common(id, `${artifact(id)}_element`, name, id), layer: "a3", elementAbi: "relation-element/2",
  entry: "entry.mjs", elements: [], permissions: [], sourcePaths, sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64),
  redistributable: true, providedCapabilities: ["relation-element/2"],
});

export const baseNodeTypeManifest = (id: string, name: string, typeNodeIds: string[], dependencies: PipPackageRef[], sourcePaths = ["source/index.js"]): NodeTypePluginManifest => ({
  ...common(id, `${artifact(id)}_node_type`, name, typeNodeIds[0]), layer: "a4", nodeTypeAbi: "relation-node-type/2",
  entry: "entry.mjs", typeNodeIds, dependencies, permissions: [], sourcePaths, sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64),
  redistributable: true, providedCapabilities: ["relation-node-type/2"], requiredCapabilities: ["relation-element/2"],
});

export const baseNodeMapManifest = (id: string, name: string, rootNodeIds: string[], dependencies: PipPackageRef[], packageRootNodeId = rootNodeIds[0] ?? id): NodeMapManifest => ({
  ...common(id, `${artifact(id)}_map`, name, packageRootNodeId), layer: "a5", nodeMapAbi: "relation-node-map/1",
  rootNodeIds, dependencies, requiredCapabilities: ["relation-node-type/2"],
});
