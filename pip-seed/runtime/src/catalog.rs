use crate::{
    Package, PipIoPolicy, PipLayer, parse_pip_filename, sha256_hex, validate_package_filename,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageOrigin {
    System,
    User,
    Workspace,
}

#[derive(Clone, Debug)]
pub struct CatalogSource {
    pub origin: PackageOrigin,
    pub directory: PathBuf,
    pub read_only: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageRef {
    pub origin: PackageOrigin,
    pub package_id: String,
    pub version: String,
    pub release_date: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProfile {
    pub schema_version: u32,
    pub profile_id: String,
    pub name: String,
    pub seed: Option<PackageRef>,
    pub loader: PackageRef,
    pub editor: PackageRef,
    pub capabilities: BTreeMap<String, PackageRef>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub file: String,
    pub origin: PackageOrigin,
    pub read_only: bool,
    pub installed: bool,
    pub trusted_for_execution: bool,
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    pub provided_editor_kinds: Vec<String>,
    pub supported_document_kinds: Vec<String>,
    pub provided_capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoaderConfig {
    default_editor_package_id: String,
}

fn invalid(source: &CatalogSource, file: String, error: impl Into<String>) -> CatalogEntry {
    CatalogEntry {
        file,
        origin: source.origin,
        read_only: source.read_only,
        installed: source.origin != PackageOrigin::Workspace,
        trusted_for_execution: source.origin == PackageOrigin::System,
        valid: false,
        package_id: None,
        layer: None,
        artifact_name: None,
        name: None,
        package_version: None,
        release_date: None,
        sha256: None,
        provided_editor_kinds: Vec::new(),
        supported_document_kinds: Vec::new(),
        provided_capabilities: Vec::new(),
        error: Some(error.into()),
    }
}

fn safe_file(file: &str) -> Result<(), String> {
    if file.is_empty()
        || file.contains('/')
        || file.contains('\\')
        || file.contains("..")
        || Path::new(file).is_absolute()
    {
        return Err("unsafe PIP catalog filename".into());
    }
    Ok(())
}

pub fn load_catalog_package_from_source(
    source: &CatalogSource,
    file: &str,
    policy: &PipIoPolicy,
) -> Result<(PathBuf, Package), String> {
    safe_file(file)?;
    let path = source.directory.join(file);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect PIP package: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("PIP package must be a regular, non-symlink file".into());
    }
    parse_pip_filename(&path)?;
    let package = Package::parse_with_policy(
        fs::read(&path).map_err(|error| format!("cannot read PIP package: {error}"))?,
        policy,
    )?;
    validate_package_filename(&path, &package)?;
    Ok((path, package))
}

pub fn load_catalog_package(
    directory: &Path,
    file: &str,
    policy: &PipIoPolicy,
) -> Result<(PathBuf, Package), String> {
    load_catalog_package_from_source(
        &CatalogSource {
            origin: PackageOrigin::System,
            directory: directory.to_path_buf(),
            read_only: true,
        },
        file,
        policy,
    )
}

fn files_in(source: &CatalogSource) -> Result<Vec<String>, String> {
    if !source.directory.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(&source.directory)
        .map_err(|error| format!("cannot scan PIP directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("cannot read PIP entry: {error}"))?;
        if entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pip"))
        {
            files.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    files.sort();
    Ok(files)
}

pub fn catalog_entries_from_sources_with_trust(
    sources: &[CatalogSource],
    trusted: &BTreeSet<String>,
    policy: &PipIoPolicy,
) -> Result<Vec<CatalogEntry>, String> {
    let mut entries = Vec::new();
    for source in sources {
        for file in files_in(source)? {
            let entry = match load_catalog_package_from_source(source, &file, policy) {
                Ok((_, package)) => {
                    let manifest = package.manifest_data();
                    let hash = sha256_hex(package.bytes());
                    CatalogEntry {
                        file,
                        origin: source.origin,
                        read_only: source.read_only,
                        installed: source.origin != PackageOrigin::Workspace,
                        trusted_for_execution: source.origin == PackageOrigin::System
                            || trusted.contains(&hash),
                        valid: true,
                        package_id: Some(manifest.package_id.clone()),
                        layer: Some(manifest.layer.clone()),
                        artifact_name: Some(manifest.artifact_name.clone()),
                        name: Some(manifest.name.clone()),
                        package_version: Some(manifest.package_version.clone()),
                        release_date: Some(manifest.release_date.clone()),
                        sha256: Some(hash),
                        provided_editor_kinds: manifest.provided_editor_kinds.clone(),
                        supported_document_kinds: manifest.supported_document_kinds.clone(),
                        provided_capabilities: manifest.provided_capabilities.clone(),
                        error: None,
                    }
                }
                Err(error) => invalid(source, file, error),
            };
            entries.push(entry);
        }
    }
    Ok(entries)
}

pub fn catalog_entries_from_sources(
    sources: &[CatalogSource],
    policy: &PipIoPolicy,
) -> Result<Vec<CatalogEntry>, String> {
    catalog_entries_from_sources_with_trust(sources, &BTreeSet::new(), policy)
}

pub fn catalog_entries(
    directory: &Path,
    policy: &PipIoPolicy,
) -> Result<Vec<CatalogEntry>, String> {
    catalog_entries_from_sources(
        &[CatalogSource {
            origin: PackageOrigin::System,
            directory: directory.to_path_buf(),
            read_only: true,
        }],
        policy,
    )
}

mod profile;
pub use profile::{
    load_default_catalog_package, load_default_editor_package, resolve_package_ref,
    validate_runtime_profile,
};

#[cfg(test)]
#[path = "tests/catalog_tests.rs"]
mod tests;
