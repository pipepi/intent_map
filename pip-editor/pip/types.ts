/** Input/output: stable PIP package, manifest, asset, profile, and I/O option shapes. */
import type { PipIoPolicy, PipIoPolicyField } from "./io-policy.ts";

export type PipLayer = "a0" | "a1" | "a2" | "a3" | "a4" | "a5";
export type PipArtifactRole = "authoring-source" | "runtime" | "source-and-runtime";
export type PipPackageOrigin = "system" | "user" | "workspace";
export type PipPackageRef = { origin: Exclude<PipPackageOrigin, "workspace">; packageId: string; version: string; releaseDate: string; sha256: string };
export type PipRuntimeProfile = { schemaVersion: 1; profileId: string; name: string; seed?: PipPackageRef; loader: PipPackageRef; editor: PipPackageRef; capabilities: Record<string, PipPackageRef> };
export type PipManifest = {
  packageId: string; layer: PipLayer; artifactName: string; name: string; packageVersion: string;
  releaseDate: string; rootNodeId: string; loaderAbi: "pip-loader/1"; artifactRole: PipArtifactRole;
  editorAbi?: "pip-editor/1"; providedEditorKinds: string[]; supportedDocumentKinds: string[];
  preferredEditorKinds: string[]; requiredEditorCapabilities: string[]; providedCapabilities: string[];
  requiredCapabilities: string[]; requiredAuthoringCapabilities: string[]; ioPolicy: PipIoPolicy;
  authoringKind?: string; authoringCompiler?: string; createdAt: string; contentType: "application/vnd.intent-map.pip";
};
export type PipAsset = { path: string; mime: string; bytes: Uint8Array };
export type PipPackage = { manifest: PipManifest; loaderSource: string; rootTreeText: string; assets: PipAsset[] };
export type PipIoConfirmationRequest = { field: PipIoPolicyField; actual: string; operation: "encode" | "decode" };
export type PipIoOptions = { policy?: PipIoPolicy; confirm?: (request: PipIoConfirmationRequest) => boolean | Promise<boolean> };

export class PipIoConfirmationRequiredError extends Error {
  readonly request: PipIoConfirmationRequest;

  constructor(request: PipIoConfirmationRequest) {
    super(`PIP I/O confirmation required for ${request.field}: ${request.actual}`);
    this.name = "PipIoConfirmationRequiredError";
    this.request = request;
  }
}
