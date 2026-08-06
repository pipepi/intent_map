import type { PipAsset, PipPackage } from "../../app/runtime/pip.ts";
import { pipSha256 } from "../../app/runtime/pip.ts";

export const PIP_WORKSPACE_INDEX_PATH = "a3/workspace/resources.json";
export const PIP_WORKSPACE_INDEX_MIME = "application/vnd.intent-map.workspace-resources+json";

export type WorkspaceResourceEntry = {
  path: string;
  mediaType: string;
  byteLength: string;
  sha256: string;
};

export type WorkspaceResourceIndex = {
  schemaVersion: 1;
  resourcesDirectory: "resources";
  resources: WorkspaceResourceEntry[];
};

export type WorkspaceResource = {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const decimalPattern = /^(0|[1-9]\d*)$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const assertWorkspaceResourcePath = (value: unknown): string => {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) {
    throw new Error("Workspace resource path must be a relative POSIX path");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe workspace resource path: ${value}`);
  }
  if (value === PIP_WORKSPACE_INDEX_PATH) {
    throw new Error(`Reserved workspace resource path: ${value}`);
  }
  return value;
};

const assertWorkspaceResourceEntry = (value: unknown): WorkspaceResourceEntry => {
  if (!value || typeof value !== "object") throw new Error("Invalid workspace resource entry");
  const candidate = value as Partial<WorkspaceResourceEntry>;
  const path = assertWorkspaceResourcePath(candidate.path);
  if (typeof candidate.mediaType !== "string" || !candidate.mediaType.trim()) {
    throw new Error(`${path}: mediaType is required`);
  }
  if (typeof candidate.byteLength !== "string" || !decimalPattern.test(candidate.byteLength)) {
    throw new Error(`${path}: byteLength must be a non-negative decimal string`);
  }
  if (typeof candidate.sha256 !== "string" || !sha256Pattern.test(candidate.sha256)) {
    throw new Error(`${path}: sha256 must be lowercase hexadecimal`);
  }
  return candidate as WorkspaceResourceEntry;
};

export const assertWorkspaceResourceIndex = (value: unknown): WorkspaceResourceIndex => {
  if (!value || typeof value !== "object") throw new Error("Invalid workspace resource index");
  const candidate = value as Partial<WorkspaceResourceIndex>;
  if (candidate.schemaVersion !== 1 || candidate.resourcesDirectory !== "resources") {
    throw new Error("Unsupported workspace resource index");
  }
  if (!Array.isArray(candidate.resources)) throw new Error("Workspace resource list is required");
  const resources = candidate.resources.map(assertWorkspaceResourceEntry);
  const paths = resources.map((resource) => resource.path);
  if (new Set(paths).size !== paths.length) throw new Error("Workspace resource paths must be unique");
  const sorted = [...paths].sort((left, right) => left.localeCompare(right));
  if (paths.some((path, index) => path !== sorted[index])) {
    throw new Error("Workspace resource index must be sorted by path");
  }
  return candidate as WorkspaceResourceIndex;
};

export const createWorkspaceResourceIndex = async (
  resources: WorkspaceResource[],
): Promise<WorkspaceResourceIndex> => {
  const entries = await Promise.all(resources.map(async (resource) => ({
    path: assertWorkspaceResourcePath(resource.path),
    mediaType: resource.mediaType,
    byteLength: resource.bytes.byteLength.toString(),
    sha256: await pipSha256(resource.bytes),
  })));
  return assertWorkspaceResourceIndex({
    schemaVersion: 1,
    resourcesDirectory: "resources",
    resources: entries.sort((left, right) => left.path.localeCompare(right.path)),
  });
};

export const workspaceResourceIndexAsset = (index: WorkspaceResourceIndex): PipAsset => ({
  path: PIP_WORKSPACE_INDEX_PATH,
  mime: PIP_WORKSPACE_INDEX_MIME,
  bytes: textEncoder.encode(JSON.stringify(assertWorkspaceResourceIndex(index))),
});

export const readWorkspaceResourceIndex = (
  pip: Pick<PipPackage, "assets">,
): WorkspaceResourceIndex | null => {
  const matches = pip.assets.filter((asset) => asset.path === PIP_WORKSPACE_INDEX_PATH);
  if (!matches.length) return null;
  if (matches.length !== 1 || matches[0].mime !== PIP_WORKSPACE_INDEX_MIME) {
    throw new Error("Invalid workspace resource index asset");
  }
  return assertWorkspaceResourceIndex(JSON.parse(textDecoder.decode(matches[0].bytes)) as unknown);
};

export const verifyWorkspaceResources = async (
  index: WorkspaceResourceIndex,
  resources: WorkspaceResource[],
): Promise<void> => {
  const expected = assertWorkspaceResourceIndex(index);
  const actual = await createWorkspaceResourceIndex(resources);
  if (JSON.stringify(actual.resources) !== JSON.stringify(expected.resources)) {
    throw new Error("Workspace resources do not match intent.pip resource index");
  }
};
