use pip_seed_runtime::{Package, PipIoPolicy};
use std::env;
use std::fs;
use std::path::Path;

const CAPSULE_MAGIC: &[u8; 16] = b"PIP_NODE_MAP_V1\0";

fn validate_a5(bytes: &[u8], policy: &PipIoPolicy) -> Result<(), String> {
    let package = Package::parse_with_policy(bytes.to_vec(), policy)?;
    if package.manifest_data().layer != "a5" {
        return Err("native export requires an a5 Node Map PIP".into());
    }
    if package.manifest_data().launch_profile.is_none() {
        return Err("native export requires an A5 launchProfile".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn append_capsule(mut launcher: Vec<u8>, payload: &[u8]) -> Vec<u8> {
    launcher.extend_from_slice(payload);
    launcher.extend_from_slice(pip_seed_runtime::sha256_hex(payload).as_bytes());
    launcher.extend_from_slice(&(payload.len() as u64).to_le_bytes());
    launcher.extend_from_slice(CAPSULE_MAGIC);
    launcher
}

pub fn embedded_node_map(
    executable: &Path,
    policy: &PipIoPolicy,
) -> Result<Option<Vec<u8>>, String> {
    #[cfg(target_os = "macos")]
    if let Some(contents) = executable.parent().and_then(Path::parent) {
        let resource = contents.join("Resources").join("launch.pip");
        if resource.is_file() {
            let bytes =
                fs::read(resource).map_err(|error| format!("cannot read embedded A5: {error}"))?;
            validate_a5(&bytes, policy)?;
            return Ok(Some(bytes));
        }
    }
    let bytes = fs::read(executable).map_err(|error| format!("cannot read launcher: {error}"))?;
    if bytes.len() < 88 || &bytes[bytes.len() - 16..] != CAPSULE_MAGIC {
        return Ok(None);
    }
    let length = u64::from_le_bytes(
        bytes[bytes.len() - 24..bytes.len() - 16]
            .try_into()
            .map_err(|_| "invalid capsule trailer")?,
    ) as usize;
    let start = bytes
        .len()
        .checked_sub(88 + length)
        .ok_or("invalid capsule length")?;
    let payload = bytes[start..start + length].to_vec();
    let expected = std::str::from_utf8(&bytes[start + length..start + length + 64])
        .map_err(|_| "invalid capsule SHA")?;
    if pip_seed_runtime::sha256_hex(&payload) != expected {
        return Err("native capsule SHA mismatch".into());
    }
    validate_a5(&payload, policy)?;
    Ok(Some(payload))
}

#[cfg(target_os = "macos")]
fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for item in fs::read_dir(source).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let kind = item.file_type().map_err(|error| error.to_string())?;
        let destination = target.join(item.file_name());
        if kind.is_dir() {
            copy_tree(&item.path(), &destination)?;
        } else if kind.is_file() {
            fs::copy(item.path(), destination).map_err(|error| error.to_string())?;
        } else {
            return Err("native template contains unsupported links".into());
        }
    }
    Ok(())
}

pub fn export_native(
    payload: &[u8],
    seed: &Path,
    policy: &PipIoPolicy,
) -> Result<(Vec<u8>, &'static str), String> {
    validate_a5(payload, policy)?;
    #[cfg(target_os = "macos")]
    {
        let stamp = format!(
            "pip-native-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| error.to_string())?
                .as_nanos()
        );
        let temporary = env::temp_dir().join(stamp);
        let staging = temporary.join("stage");
        let app_name = seed.file_name().ok_or("invalid app template")?;
        let app = staging.join(app_name);
        copy_tree(seed, &app)?;
        let resources = app.join("Contents").join("Resources");
        fs::create_dir_all(&resources).map_err(|error| error.to_string())?;
        fs::write(resources.join("launch.pip"), payload).map_err(|error| error.to_string())?;
        let dmg = temporary.join("node-map.dmg");
        let status = std::process::Command::new("hdiutil")
            .args(["create", "-quiet", "-format", "UDZO", "-srcfolder"])
            .arg(&staging)
            .arg(&dmg)
            .status()
            .map_err(|error| format!("cannot run hdiutil: {error}"))?;
        if !status.success() {
            return Err("hdiutil failed to create DMG".into());
        }
        let bytes = fs::read(&dmg).map_err(|error| error.to_string())?;
        let _ = fs::remove_dir_all(temporary);
        return Ok((bytes, "application/x-apple-diskimage"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let launcher = fs::read(seed)
            .map_err(|error| format!("cannot read native launcher template: {error}"))?;
        Ok((
            append_capsule(launcher, payload),
            "application/octet-stream",
        ))
    }
}
