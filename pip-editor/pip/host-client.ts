import type { PipCatalogEntry } from "./profile.ts";
import type { PipRuntimeProfile } from "./index.ts";

export type PipHostCatalog = {
  forceSelection: boolean;
  loader: {
    layer: "a1";
    artifactName: string;
    packageVersion: string;
    releaseDate: string;
  };
  profile?: import("./index.ts").PipRuntimeProfile;
  seedSourceSha256?: string;
  seedIdentityMatchesProfile?: boolean;
  packages: PipCatalogEntry[];
};

const responseError = async (response: Response) => {
  throw new Error(await response.text() || `PIP host returned ${response.status}`);
};

export const readHostCatalog = async () => {
  const response = await fetch("/__pip/catalog");
  if (!response.ok) return responseError(response);
  return response.json() as Promise<PipHostCatalog>;
};

export const readHostPackage = async (entry: Pick<PipCatalogEntry, "origin" | "file">) => {
  const response = await fetch(`/__pip/packages/${entry.origin}/${entry.file}`);
  if (!response.ok) return responseError(response);
  return response.arrayBuffer();
};

export const installUserPackage = async (file: string, bytes: ArrayBuffer | Uint8Array) => {
  if (!/^a[0-5]_[a-z0-9_]+_[0-9]+_[0-9]+_[0-9]+_[0-9]{8}\.pip$/.test(file)) {
    throw new Error("Invalid PIP filename");
  }
  const response = await fetch(`/__pip/install/${file}`, {
    method: "POST",
    headers: { "content-type": "application/vnd.intent-map.pip" },
    body: bytes instanceof Uint8Array ? Uint8Array.from(bytes).buffer : bytes,
  });
  if (!response.ok) return responseError(response);
};

export const trustPackageHash = async (sha256: string) => {
  const response = await fetch("/__pip/trust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sha256 }),
  });
  if (!response.ok) return responseError(response);
};

export const saveHostRuntimeProfile = async (profile: PipRuntimeProfile) => {
  const response = await fetch("/__pip/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) return responseError(response);
};
