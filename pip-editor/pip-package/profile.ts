import type {
  PipLayer,
  PipPackageOrigin,
  PipPackageRef,
  PipRuntimeProfile,
} from "./index.ts";

export type PipCatalogEntry = {
  file: string;
  origin: PipPackageOrigin;
  readOnly: boolean;
  installed: boolean;
  trustedForExecution: boolean;
  valid: boolean;
  packageId?: string;
  layer?: PipLayer;
  packageVersion?: string;
  releaseDate?: string;
  sha256?: string;
  providedEditorKinds: string[];
  supportedDocumentKinds: string[];
  providedCapabilities: string[];
  error?: string;
};

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const datePattern = /^\d{8}$/;
const hashPattern = /^[a-f0-9]{64}$/;

export const assertPackageRef = (reference: PipPackageRef) => {
  if (
    !reference ||
    !["system", "user"].includes(reference.origin) ||
    !reference.packageId ||
    !versionPattern.test(reference.version) ||
    !datePattern.test(reference.releaseDate) ||
    !hashPattern.test(reference.sha256)
  ) throw new Error("Invalid PIP package reference");
  return reference;
};

export const assertRuntimeProfile = (profile: PipRuntimeProfile) => {
  if (
    !profile || profile.schemaVersion !== 1 || !profile.profileId || !profile.name ||
    !profile.capabilities || Array.isArray(profile.capabilities)
  ) throw new Error("Invalid PIP runtime profile");
  if (profile.seed) assertPackageRef(profile.seed);
  assertPackageRef(profile.loader);
  assertPackageRef(profile.editor);
  Object.entries(profile.capabilities).forEach(([capability, reference]) => {
    if (!capability.includes("/")) throw new Error(`Invalid capability ABI: ${capability}`);
    assertPackageRef(reference);
  });
  return profile;
};

export const entryMatchesRef = (entry: PipCatalogEntry, reference: PipPackageRef) =>
  entry.valid &&
  entry.origin === reference.origin &&
  entry.packageId === reference.packageId &&
  entry.packageVersion === reference.version &&
  entry.releaseDate === reference.releaseDate &&
  entry.sha256 === reference.sha256;

export const resolveExactEditor = (
  catalog: PipCatalogEntry[],
  reference: PipPackageRef,
) => {
  const matches = catalog.filter((entry) => entry.layer === "a2" && entryMatchesRef(entry, reference));
  if (matches.length !== 1) {
    throw new Error(`Editor reference must resolve exactly once: ${reference.packageId}@${reference.version}`);
  }
  return matches[0];
};

export const compatibleEditors = (
  catalog: PipCatalogEntry[],
  documentKinds: string[],
  preferredEditorKinds: string[] = [],
) => catalog
  .filter((entry) => entry.valid && entry.layer === "a2")
  .filter((entry) => documentKinds.every((kind) => entry.supportedDocumentKinds.includes(kind)))
  .sort((left, right) => {
    const score = (entry: PipCatalogEntry) => preferredEditorKinds
      .filter((kind) => entry.providedEditorKinds.includes(kind)).length;
    return score(right) - score(left) || left.file.localeCompare(right.file);
  });
