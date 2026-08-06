pub mod artifact;
pub mod catalog;
pub mod pip;
pub mod runtime;
mod sha256;

pub use artifact::{
    PipArtifactName, PipDiscovery, PipLayer, ReleaseDate, Version, discover_loader_pip,
    parse_pip_filename, validate_package_filename,
};
pub use catalog::{
    CatalogEntry, CatalogSource, PackageOrigin, PackageRef, RuntimeProfile, catalog_entries,
    catalog_entries_from_sources, catalog_entries_from_sources_with_trust, load_catalog_package,
    load_catalog_package_from_source, load_default_catalog_package, load_default_editor_package,
    resolve_package_ref, validate_runtime_profile,
};
pub use pip::{Asset, Manifest, Package, PipIoPolicy, PipLimit};
pub use runtime::{
    catalog_sources as runtime_catalog_sources, install_user_package, load_runtime_profile,
    save_runtime_profile, trust_hash, trusted_hashes, user_data_root, validate_profile_trust,
};

pub fn sha256_hex(bytes: &[u8]) -> String {
    sha256::hex(bytes)
}
