const entries = {
  "pip-seed": [
    "pip-seed/README.md",
    "pip-seed/runtime/Cargo.toml",
    "pip-seed/runtime/src",
    "pip-seed/cli/Cargo.toml",
    "pip-seed/cli/Cargo.lock",
    "pip-seed/cli/src",
    "pip-seed/tauri/Cargo.toml",
    "pip-seed/tauri/Cargo.lock",
    "pip-seed/tauri/build.rs",
    "pip-seed/tauri/src",
    "pip-seed/tauri/tauri.conf.json",
  ],
  "pip-loader": ["pip-seed/loader"],
  "intent-map": [
    "pip-editor",
    "pip-editor-plugins",
    "scripts",
    "tests",
    "package.json",
    "package-lock.json",
    "pip.release.json",
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
