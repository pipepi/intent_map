use crate::{Package, PipLayer, parse_pip_filename, sha256_hex, validate_package_filename};
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
) -> Result<(PathBuf, Package), String> {
    safe_file(file)?;
    let path = source.directory.join(file);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect PIP package: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("PIP package must be a regular, non-symlink file".into());
    }
    parse_pip_filename(&path)?;
    let package = Package::parse(
        fs::read(&path).map_err(|error| format!("cannot read PIP package: {error}"))?,
    )?;
    validate_package_filename(&path, &package)?;
    Ok((path, package))
}

pub fn load_catalog_package(directory: &Path, file: &str) -> Result<(PathBuf, Package), String> {
    load_catalog_package_from_source(
        &CatalogSource {
            origin: PackageOrigin::System,
            directory: directory.to_path_buf(),
            read_only: true,
        },
        file,
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
) -> Result<Vec<CatalogEntry>, String> {
    let mut entries = Vec::new();
    for source in sources {
        for file in files_in(source)? {
            let entry = match load_catalog_package_from_source(source, &file) {
                Ok((_, package)) => {
                    let manifest = package.manifest_data();
                    let hash = sha256_hex(package.bytes());
                    CatalogEntry {
                        file,
                        origin: source.origin,
                        read_only: source.read_only,
                        installed: source.origin != PackageOrigin::Workspace,
                        trusted_for_execution: source.origin == PackageOrigin::System || trusted.contains(&hash),
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

pub fn catalog_entries_from_sources(sources: &[CatalogSource]) -> Result<Vec<CatalogEntry>, String> {
    catalog_entries_from_sources_with_trust(sources, &BTreeSet::new())
}

pub fn catalog_entries(directory: &Path) -> Result<Vec<CatalogEntry>, String> {
    catalog_entries_from_sources(&[CatalogSource {
        origin: PackageOrigin::System,
        directory: directory.to_path_buf(),
        read_only: true,
    }])
}

pub fn resolve_package_ref(
    sources: &[CatalogSource],
    reference: &PackageRef,
    expected_layer: Option<PipLayer>,
) -> Result<(PathBuf, Package), String> {
    if reference.origin == PackageOrigin::Workspace {
        return Err("runtime profiles cannot execute uninstalled workspace packages".into());
    }
    let matching_sources: Vec<_> = sources
        .iter()
        .filter(|source| source.origin == reference.origin)
        .collect();
    if matching_sources.is_empty() {
        return Err("package origin is not available".into());
    }
    let mut matches = Vec::new();
    for source in matching_sources {
        for file in files_in(source)? {
            let Ok(loaded) = load_catalog_package_from_source(source, &file) else {
                continue;
            };
            let manifest = loaded.1.manifest_data();
            if manifest.package_id == reference.package_id
                && manifest.package_version == reference.version
                && manifest.release_date == reference.release_date
                && sha256_hex(loaded.1.bytes()) == reference.sha256
            {
                matches.push(loaded);
            }
        }
    }
    if matches.len() != 1 {
        return Err(format!(
            "profile reference must resolve exactly once: {}@{}",
            reference.package_id, reference.version
        ));
    }
    let (path, package) = matches.into_iter().next().expect("one match");
    if expected_layer.is_some_and(|layer| package.manifest_data().layer != layer.key()) {
        return Err(format!("package {} has the wrong layer", reference.package_id));
    }
    Ok((path, package))
}

pub fn validate_runtime_profile(profile: &RuntimeProfile, sources: &[CatalogSource]) -> Result<(), String> {
    if profile.schema_version != 1 || profile.profile_id.is_empty() || profile.name.is_empty() {
        return Err("invalid runtime profile identity".into());
    }
    resolve_package_ref(sources, &profile.loader, Some(PipLayer::Loader))?;
    resolve_package_ref(sources, &profile.editor, Some(PipLayer::Editor))?;
    if let Some(seed) = &profile.seed {
        resolve_package_ref(sources, seed, Some(PipLayer::Seed))?;
    }
    let mut providers = HashSet::new();
    for (capability, reference) in &profile.capabilities {
        if !providers.insert(capability) {
            return Err(format!("duplicate capability provider: {capability}"));
        }
        let (_, package) = resolve_package_ref(sources, reference, Some(PipLayer::Functional))?;
        if !package
            .manifest_data()
            .provided_capabilities
            .iter()
            .any(|provided| provided == capability)
        {
            return Err(format!("{} does not provide {capability}", reference.package_id));
        }
    }
    Ok(())
}

pub fn load_default_editor_package(
    loader: &Package,
    sources: &[CatalogSource],
    force_selection: bool,
) -> Result<Option<Package>, String> {
    if force_selection {
        return Ok(None);
    }
    let Some(asset) = loader.assets().iter().find(|asset| asset.path == "config.json") else {
        return Ok(None);
    };
    let Ok(config) = serde_json::from_slice::<LoaderConfig>(loader.asset_bytes(asset)) else {
        return Ok(None);
    };
    let matches: Vec<_> = catalog_entries_from_sources(sources)?
        .into_iter()
        .filter(|entry| {
            entry.valid
                && entry.origin == PackageOrigin::System
                && entry.layer.as_deref() == Some("a2")
                && entry.package_id.as_deref() == Some(&config.default_editor_package_id)
        })
        .collect();
    if matches.len() != 1 {
        return Ok(None);
    }
    let selected = &matches[0];
    let source = sources
        .iter()
        .find(|source| source.origin == selected.origin)
        .ok_or("selected editor source disappeared")?;
    load_catalog_package_from_source(source, &selected.file).map(|(_, package)| Some(package))
}

pub fn load_default_catalog_package(
    loader: &Package,
    directory: &Path,
    force_selection: bool,
) -> Result<Option<Package>, String> {
    load_default_editor_package(
        loader,
        &[CatalogSource {
            origin: PackageOrigin::System,
            directory: directory.to_path_buf(),
            read_only: true,
        }],
        force_selection,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system_source(layer: &str, package: &str) -> CatalogSource {
        CatalogSource {
            origin: PackageOrigin::System,
            directory: Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../packages/system")
                .join(layer)
                .join(package),
            read_only: true,
        }
    }

    fn reference(source: &CatalogSource, file: &str) -> PackageRef {
        let (_, package) = load_catalog_package_from_source(source, file).unwrap();
        let manifest = package.manifest_data();
        PackageRef {
            origin: source.origin,
            package_id: manifest.package_id.clone(),
            version: manifest.package_version.clone(),
            release_date: manifest.release_date.clone(),
            sha256: sha256_hex(package.bytes()),
        }
    }

    #[test]
    fn validates_exact_editor_and_capability_profile_references() {
        let loader = system_source("a1", "pip-loader");
        let editor = system_source("a2", "intent-map");
        let capability = system_source("a3", "software-authoring");
        let sources = vec![loader.clone(), editor.clone(), capability.clone()];
        let profile = RuntimeProfile {
            schema_version: 1,
            profile_id: "system".into(),
            name: "System".into(),
            seed: None,
            loader: reference(&loader, "a1_loader_1_0_0_20260806.pip"),
            editor: reference(&editor, "a2_intent_map_1_0_0_20260806.pip"),
            capabilities: BTreeMap::from([(
                "software-authoring/1".into(),
                reference(&capability, "a3_software_authoring_1_0_0_20260806.pip"),
            )]),
        };
        validate_runtime_profile(&profile, &sources).unwrap();
        let mut changed = profile.clone();
        changed.editor.sha256 = "0".repeat(64);
        assert!(validate_runtime_profile(&changed, &sources).is_err());
    }
}
