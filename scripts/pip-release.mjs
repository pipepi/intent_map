import { readFile } from "node:fs/promises";
import path from "node:path";

export const projectRoot = path.resolve(import.meta.dirname, "..");
export const runtimeDirectory = path.join(projectRoot, "dist", "pip-runtime");
export const applicationDirectory = path.join(runtimeDirectory, "pip");
export const systemPackagesDirectory = process.env.PIP_SYSTEM_PACKAGES_DIR
  ? path.resolve(process.env.PIP_SYSTEM_PACKAGES_DIR)
  : path.join(projectRoot, "packages", "system");

const artifactPattern = /^[a-z][a-z0-9_]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const validDate = (value) => {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const readReleaseConfig = async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, "pip.release.json"), "utf8"));
  Object.entries(config).filter(([, value]) => value?.layer).forEach(([key, value]) => {
    if (!/^a[0-5]$/.test(value.layer)) throw new Error(`${key}: invalid layer`);
    if (!artifactPattern.test(value.artifactName)) throw new Error(`${key}: invalid artifactName`);
    if (!versionPattern.test(value.version)) throw new Error(`${key}: invalid version`);
    if (!validDate(value.releaseDate)) throw new Error(`${key}: invalid releaseDate`);
    if (!value.nativeOnly && (!value.packageId || !value.name)) {
      throw new Error(`${key}: PIP metadata requires packageId and name`);
    }
  });
  return config;
};

export const systemPackagePath = (release) => path.join(
  systemPackagesDirectory,
  release.layer,
  release.packageId,
  artifactFilename(release),
);

export const artifactFilename = (release, extension = "pip") => {
  const version = release.version.replaceAll(".", "_");
  const suffix = extension ? `.${extension}` : "";
  return `${release.layer}_${release.artifactName}_${version}_${release.releaseDate}${suffix}`;
};

export const createdAtFor = (release) => {
  const value = release.releaseDate;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
};
