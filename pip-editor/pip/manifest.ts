/** Input: decoded manifest data. Output: validated identity metadata and canonical filenames. */
import { assertPipIoPolicy } from "./io-policy.ts";
import { sha256 } from "./format.ts";
import type { PipManifest } from "./types.ts";

const artifactNamePattern = /^[a-z][a-z0-9_]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const capabilityPattern = /^[a-z][a-z0-9.-]*\/[1-9]\d*$/;
const shaPattern = /^[a-f0-9]{64}$/;
const validReleaseDate = (value: string) => {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(4, 6)), day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
export const assertPipManifest = (manifest: PipManifest): PipManifest => {
  if (!manifest) throw new Error("Invalid PIP manifest");
  try { assertPipIoPolicy(manifest.ioPolicy); } catch { throw new Error("Invalid PIP manifest"); }
  const stringArrays = [manifest.providedEditorKinds, manifest.supportedDocumentKinds, manifest.preferredEditorKinds, manifest.requiredEditorCapabilities, manifest.providedCapabilities, manifest.requiredCapabilities, manifest.requiredAuthoringCapabilities];
  if (
    !["a0", "a1", "a2", "a3", "a4", "a5"].includes(manifest.layer) ||
    !artifactNamePattern.test(manifest.artifactName) || !versionPattern.test(manifest.packageVersion) ||
    !validReleaseDate(manifest.releaseDate) || !manifest.packageId || !manifest.name || !manifest.rootNodeId ||
    manifest.loaderAbi !== "pip-loader/1" || !["authoring-source", "runtime", "source-and-runtime"].includes(manifest.artifactRole) ||
    manifest.contentType !== "application/vnd.intent-map.pip" ||
    stringArrays.some((values) => !Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) ||
    [...manifest.providedCapabilities, ...manifest.requiredAuthoringCapabilities].some((capability) => !capabilityPattern.test(capability)) ||
    (manifest.layer === "a2" && (manifest.editorAbi !== "pip-editor/1" || manifest.providedEditorKinds.length === 0)) ||
    (manifest.layer !== "a2" && "editorAbi" in manifest && manifest.editorAbi !== undefined) ||
    (manifest.layer === "a3" && !validElementManifest(manifest)) ||
    (manifest.layer === "a4" && !validNodeTypeManifest(manifest)) ||
    (manifest.layer === "a5" && !validNodeMapManifest(manifest)) ||
    (manifest.layer !== "a3" && ("elementAbi" in manifest || "elements" in manifest)) ||
    (manifest.layer !== "a4" && ("nodeTypeAbi" in manifest || "typeNodeIds" in manifest)) ||
    (manifest.layer !== "a5" && ("nodeMapAbi" in manifest || "rootNodeIds" in manifest || "launchProfile" in manifest))
  ) throw new Error("Invalid PIP manifest");
  return manifest;
};
const validRef = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return ["system", "user"].includes(String(ref.origin)) && typeof ref.packageId === "string" && !!ref.packageId &&
    typeof ref.version === "string" && versionPattern.test(ref.version) && typeof ref.releaseDate === "string" &&
    validReleaseDate(ref.releaseDate) && typeof ref.sha256 === "string" && shaPattern.test(ref.sha256);
};
const validElementManifest = (manifest: Extract<PipManifest, { layer: "a3" }>) =>
  manifest.elementAbi === "relation-element/2" && manifest.entry === "entry.mjs" && manifest.providedCapabilities.length > 0 &&
  Array.isArray(manifest.elements) && manifest.elements.length > 0 && manifest.elements.every((item) => item && !!item.id &&
    /^[a-z][a-z0-9._-]*$/.test(item.id) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(item.tag) &&
    ["control", "preview", "node", "projection", "panel", "creator", "workspace-window"].includes(item.purpose)) && validExecutableFields(manifest);
const validExecutableFields = (manifest: { permissions: string[]; sourcePaths: string[]; sourceSha256: string; entrySha256: string; redistributable: boolean }) =>
  Array.isArray(manifest.permissions) && manifest.permissions.every(Boolean) && Array.isArray(manifest.sourcePaths) &&
  manifest.sourcePaths.length > 0 && manifest.sourcePaths.every((path) => typeof path === "string" && path.startsWith("source/") && !path.includes("..")) &&
  shaPattern.test(manifest.sourceSha256) && shaPattern.test(manifest.entrySha256) && typeof manifest.redistributable === "boolean";
const validNodeTypeManifest = (manifest: Extract<PipManifest, { layer: "a4" }>) =>
  manifest.nodeTypeAbi === "relation-node-type/2" && manifest.entry === "entry.mjs" && manifest.typeNodeIds.length > 0 &&
  manifest.typeNodeIds.every(Boolean) && manifest.dependencies.length > 0 && manifest.dependencies.every(validRef) && validExecutableFields(manifest);
const validNodeMapManifest = (manifest: Extract<PipManifest, { layer: "a5" }>) =>
  manifest.nodeMapAbi === "relation-node-map/1" && Array.isArray(manifest.rootNodeIds) && manifest.rootNodeIds.every(Boolean) &&
  manifest.dependencies.length > 0 && manifest.dependencies.every(validRef) && (!manifest.launchProfile ||
    (manifest.launchProfile.schemaVersion === 1 && validRef(manifest.launchProfile.loader) && validRef(manifest.launchProfile.editor)));
export const pipFilename = (manifest: PipManifest) => {
  assertPipManifest(manifest);
  return `${manifest.layer}_${manifest.artifactName}_${manifest.packageVersion.replaceAll(".", "_")}_${manifest.releaseDate}.pip`;
};
export const pipSha256 = async (bytes: Uint8Array) => [...await sha256(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
