const entries = {
  "pip-seed": [
    "pip-core/Cargo.toml",
    "pip-core/src",
    "pip-seed/Cargo.toml",
    "pip-seed/Cargo.lock",
    "pip-seed/src",
    "pip-seed-tauri/Cargo.toml",
    "pip-seed-tauri/Cargo.lock",
    "pip-seed-tauri/build.rs",
    "pip-seed-tauri/src",
    "pip-seed-tauri/tauri.conf.json",
  ],
  "pip-loader": ["loader-n"],
  "intent-map": [
    "app",
    "plugins",
    "public",
    "scripts",
    "tests",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "pip.release.json",
    "postcss.config.mjs",
    "tsconfig.json",
  ],
};

export const SYSTEM_SOURCE_ENTRIES = Object.freeze(
  Object.fromEntries(Object.entries(entries).map(([packageId, paths]) => [
    packageId,
    Object.freeze([...paths]),
  ])),
);

export const systemSourceEntriesFor = (packageId) => {
  const paths = SYSTEM_SOURCE_ENTRIES[packageId];
  if (!paths) throw new Error(`No maintained source boundary for ${packageId}`);
  return paths;
};
