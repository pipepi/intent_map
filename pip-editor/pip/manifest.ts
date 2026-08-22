/** Input: decoded manifest data. Output: validated identity metadata and canonical filenames. */
import { assertPipIoPolicy } from "./io-policy.ts";
import { sha256 } from "./format.ts";
import type { PipManifest } from "./types.ts";

const artifactNamePattern = /^[a-z][a-z0-9_]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const capabilityPattern = /^[a-z][a-z0-9.-]*\/[1-9]\d*$/;
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
    (manifest.layer !== "a2" && manifest.editorAbi !== undefined) ||
    (manifest.layer === "a3" && manifest.providedCapabilities.length === 0)
  ) throw new Error("Invalid PIP manifest");
  return manifest;
};
export const pipFilename = (manifest: PipManifest) => {
  assertPipManifest(manifest);
  return `${manifest.layer}_${manifest.artifactName}_${manifest.packageVersion.replaceAll(".", "_")}_${manifest.releaseDate}.pip`;
};
export const pipSha256 = async (bytes: Uint8Array) => [...await sha256(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
