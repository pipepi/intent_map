use crate::{
    CatalogSource, Package, PackageOrigin, RuntimeProfile, parse_pip_filename, sha256_hex,
    validate_package_filename, validate_runtime_profile,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub fn user_data_root() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("PIP_USER_DATA_DIR") {
        return Ok(PathBuf::from(path));
    }
    #[cfg(target_os = "windows")]
    let base = env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = env::var_os("HOME")
        .map(PathBuf::from)
        .map(|path| path.join("Library/Application Support"));
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let base = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    base.map(|path| path.join("Intent Map"))
        .ok_or("cannot resolve Intent Map user data directory".into())
}

pub fn catalog_sources(system_directory: &Path, user_root: &Path) -> Vec<CatalogSource> {
    let mut sources = vec![CatalogSource {
        origin: PackageOrigin::System,
        directory: system_directory.to_path_buf(),
        read_only: true,
    }];
    for layer in ["a0", "a1", "a2", "a3", "a4", "a5"] {
        sources.push(CatalogSource {
            origin: PackageOrigin::User,
            directory: user_root.join("registry").join(layer),
            read_only: false,
        });
    }
    sources
}

pub fn load_runtime_profile(user_root: &Path, profile_id: &str) -> Result<RuntimeProfile, String> {
    if profile_id.is_empty()
        || !profile_id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
    {
        return Err("unsafe runtime profile id".into());
    }
    let path = user_root.join("profiles").join(format!("{profile_id}.json"));
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect runtime profile {}: {error}", path.display()))?;
    if !metadata.file_type().is_file() {
        return Err("runtime profile must be a regular, non-symlink file".into());
    }
    let profile: RuntimeProfile = serde_json::from_slice(
        &fs::read(&path).map_err(|error| format!("cannot read runtime profile: {error}"))?,
    )
    .map_err(|error| format!("invalid runtime profile JSON: {error}"))?;
    if profile.profile_id != profile_id {
        return Err("runtime profile filename and profileId do not match".into());
    }
    Ok(profile)
}

pub fn save_runtime_profile(
    user_root: &Path,
    profile: &RuntimeProfile,
    sources: &[CatalogSource],
) -> Result<PathBuf, String> {
    validate_runtime_profile(profile, sources)?;
    validate_profile_trust(profile, &trusted_hashes(user_root)?)?;
    if profile.profile_id.is_empty()
        || !profile.profile_id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
    {
        return Err("unsafe runtime profile id".into());
    }
    let directory = user_root.join("profiles");
    fs::create_dir_all(&directory).map_err(|error| format!("cannot create profile directory: {error}"))?;
    let destination = directory.join(format!("{}.json", profile.profile_id));
    let temporary = directory.join(format!("{}.json.tmp", profile.profile_id));
    fs::write(&temporary, serde_json::to_vec_pretty(profile).map_err(|error| error.to_string())?)
        .map_err(|error| format!("cannot write runtime profile: {error}"))?;
    fs::rename(temporary, &destination).map_err(|error| format!("cannot commit runtime profile: {error}"))?;
    Ok(destination)
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrustFile {
    hashes: BTreeSet<String>,
}

pub fn trusted_hashes(user_root: &Path) -> Result<BTreeSet<String>, String> {
    let path = user_root.join("trusted.json");
    if !path.exists() {
        return Ok(BTreeSet::new());
    }
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect trust store: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("trust store must be a regular, non-symlink file".into());
    }
    serde_json::from_slice::<TrustFile>(
        &fs::read(path).map_err(|error| format!("cannot read trust store: {error}"))?,
    )
    .map(|file| file.hashes)
    .map_err(|error| format!("invalid trust store: {error}"))
}

pub fn validate_profile_trust(profile: &RuntimeProfile, trusted: &BTreeSet<String>) -> Result<(), String> {
    let references = profile.seed.iter()
        .chain(std::iter::once(&profile.loader))
        .chain(std::iter::once(&profile.editor))
        .chain(profile.capabilities.values());
    for reference in references {
        if reference.origin == PackageOrigin::User && !trusted.contains(&reference.sha256) {
            return Err(format!(
                "user package is not trusted for execution: {}@{}",
                reference.package_id, reference.version
            ));
        }
    }
    Ok(())
}

pub fn trust_hash(user_root: &Path, hash: &str) -> Result<(), String> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) {
        return Err("invalid lowercase SHA-256 hash".into());
    }
    let mut hashes = trusted_hashes(user_root)?;
    hashes.insert(hash.to_string());
    fs::create_dir_all(user_root).map_err(|error| format!("cannot create user data directory: {error}"))?;
    let path = user_root.join("trusted.json");
    let temporary = user_root.join("trusted.json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(&TrustFile { hashes }).map_err(|error| error.to_string())?)
        .map_err(|error| format!("cannot write trust store: {error}"))?;
    fs::rename(temporary, path).map_err(|error| format!("cannot commit trust store: {error}"))
}

pub fn install_user_package(user_root: &Path, file: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if file.is_empty() || file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("unsafe user package filename".into());
    }
    let artifact = parse_pip_filename(Path::new(file))?;
    let package = Package::parse(bytes.to_vec())?;
    validate_package_filename(Path::new(file), &package)?;
    let directory = user_root.join("registry").join(artifact.layer.key());
    fs::create_dir_all(&directory).map_err(|error| format!("cannot create user registry: {error}"))?;
    let destination = directory.join(file);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    use std::io::Write;
    options
        .open(&destination)
        .and_then(|mut output| output.write_all(bytes))
        .map_err(|error| format!("cannot install user package without overwriting: {error}"))?;
    let installed = fs::read(&destination).map_err(|error| format!("cannot verify installed package: {error}"))?;
    if sha256_hex(&installed) != sha256_hex(bytes) {
        return Err("installed package hash mismatch".into());
    }
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(label: &str) -> PathBuf {
        let path = env::temp_dir().join(format!("pip-runtime-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn installs_user_packages_without_overwriting_versions() {
        let directory = temporary_directory("install");
        let bytes = include_bytes!("../../tests/fixtures/minimal-valid.pip");
        let file = "a5_intent_map_test_0_1_0_20260726.pip";
        let destination = install_user_package(&directory, file, bytes).unwrap();
        assert_eq!(destination, directory.join("registry/a5").join(file));
        assert!(install_user_package(&directory, file, bytes).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn stores_execution_trust_by_content_hash() {
        let directory = temporary_directory("trust");
        let hash = "a".repeat(64);
        trust_hash(&directory, &hash).unwrap();
        assert!(trusted_hashes(&directory).unwrap().contains(&hash));
        assert!(trust_hash(&directory, "not-a-hash").is_err());
        fs::remove_dir_all(directory).unwrap();
    }
}
