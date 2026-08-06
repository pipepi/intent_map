use crate::{Package, PipLayer, parse_pip_filename, validate_package_filename};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub file: String,
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
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoaderConfig {
    default_package_id: String,
}

fn invalid(file: String, error: impl Into<String>) -> CatalogEntry {
    CatalogEntry {
        file,
        valid: false,
        package_id: None,
        layer: None,
        artifact_name: None,
        name: None,
        package_version: None,
        release_date: None,
        error: Some(error.into()),
    }
}

pub fn load_catalog_package(directory: &Path, file: &str) -> Result<(PathBuf, Package), String> {
    if file.is_empty()
        || file.contains('/')
        || file.contains('\\')
        || file.contains("..")
        || Path::new(file).is_absolute()
    {
        return Err("unsafe PIP catalog filename".into());
    }
    let path = directory.join(file);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect application PIP: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("application PIP must be a regular, non-symlink file".into());
    }
    let artifact = parse_pip_filename(&path)?;
    if artifact.layer == PipLayer::Loader {
        return Err("a1 Loader PIP is not allowed in the application directory".into());
    }
    let package = Package::parse(
        fs::read(&path).map_err(|error| format!("cannot read application PIP: {error}"))?,
    )?;
    validate_package_filename(&path, &package)?;
    Ok((path, package))
}

pub fn catalog_entries(directory: &Path) -> Result<Vec<CatalogEntry>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("cannot scan PIP application directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("cannot read application entry: {error}"))?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pip"))
        {
            files.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    files.sort();
    Ok(files
        .into_iter()
        .map(|file| match load_catalog_package(directory, &file) {
            Ok((_, package)) => {
                let manifest = package.manifest_data();
                CatalogEntry {
                    file,
                    valid: true,
                    package_id: Some(manifest.package_id.clone()),
                    layer: Some(manifest.layer.clone()),
                    artifact_name: Some(manifest.artifact_name.clone()),
                    name: Some(manifest.name.clone()),
                    package_version: Some(manifest.package_version.clone()),
                    release_date: Some(manifest.release_date.clone()),
                    error: None,
                }
            }
            Err(error) => invalid(file, error),
        })
        .collect())
}

pub fn load_default_catalog_package(
    loader: &Package,
    directory: &Path,
    force_selection: bool,
) -> Result<Option<Package>, String> {
    if force_selection {
        return Ok(None);
    }
    let Some(asset) = loader
        .assets()
        .iter()
        .find(|asset| asset.path == "config.json")
    else {
        return Ok(None);
    };
    let Ok(config) = serde_json::from_slice::<LoaderConfig>(loader.asset_bytes(asset)) else {
        return Ok(None);
    };
    let matches: Vec<_> = catalog_entries(directory)?
        .into_iter()
        .filter(|entry| {
            entry.valid && entry.package_id.as_deref() == Some(&config.default_package_id)
        })
        .collect();
    if matches.len() != 1 {
        return Ok(None);
    }
    load_catalog_package(directory, &matches[0].file).map(|(_, package)| Some(package))
}

#[cfg(test)]
mod tests {
    use super::{catalog_entries, load_catalog_package, load_default_catalog_package};
    use crate::Package;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures")
            .join(name)
    }

    #[test]
    fn catalogs_valid_apps_and_rejects_loader_or_unsafe_names() {
        let directory = std::env::temp_dir().join(format!("pip-catalog-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        fs::copy(
            fixture("minimal-valid.pip"),
            directory.join("a5_intent_map_test_0_1_0_20260726.pip"),
        )
        .unwrap();
        fs::copy(
            fixture("a1_loader_1_0_0_20260726.pip"),
            directory.join("a1_loader_1_0_0_20260726.pip"),
        )
        .unwrap();
        let entries = catalog_entries(&directory).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries.iter().filter(|entry| entry.valid).count(), 1);
        assert!(load_catalog_package(&directory, "../secret.pip").is_err());
        let loader =
            Package::parse(fs::read(fixture("a1_loader_1_0_0_20260726.pip")).unwrap()).unwrap();
        assert_eq!(
            load_default_catalog_package(&loader, &directory, false)
                .unwrap()
                .unwrap()
                .manifest_data()
                .package_id,
            "intent-map.test"
        );
        assert!(
            load_default_catalog_package(&loader, &directory, true)
                .unwrap()
                .is_none()
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
