use crate::Package;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum PipLayer {
    #[serde(rename = "a1")]
    Loader,
    #[serde(rename = "a2")]
    Editor,
    #[serde(rename = "a3")]
    Functional,
    #[serde(rename = "a4")]
    Business,
    #[serde(rename = "a5")]
    Other,
}

impl PipLayer {
    pub fn key(self) -> &'static str {
        match self {
            Self::Loader => "a1",
            Self::Editor => "a2",
            Self::Functional => "a3",
            Self::Business => "a4",
            Self::Other => "a5",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "a1" => Ok(Self::Loader),
            "a2" => Ok(Self::Editor),
            "a3" => Ok(Self::Functional),
            "a4" => Ok(Self::Business),
            "a5" => Ok(Self::Other),
            _ => Err(format!("unsupported PIP layer: {value}")),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

impl Version {
    pub fn parse(value: &str) -> Result<Self, String> {
        let items: Vec<_> = value.split('.').collect();
        if items.len() != 3 || items.iter().any(|item| item.is_empty()) {
            return Err(format!("invalid three-part version: {value}"));
        }
        let parse = |item: &str| {
            if item.len() > 1 && item.starts_with('0') {
                return Err(format!("version component has a leading zero: {item}"));
            }
            item.parse::<u64>()
                .map_err(|_| format!("invalid version component: {item}"))
        };
        Ok(Self {
            major: parse(items[0])?,
            minor: parse(items[1])?,
            patch: parse(items[2])?,
        })
    }

    pub fn dotted(&self) -> String {
        format!("{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ReleaseDate(pub String);

impl ReleaseDate {
    pub fn parse(value: &str) -> Result<Self, String> {
        if value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(format!("invalid release date: {value}"));
        }
        let year: u32 = value[0..4].parse().map_err(|_| "invalid release year")?;
        let month: u32 = value[4..6].parse().map_err(|_| "invalid release month")?;
        let day: u32 = value[6..8].parse().map_err(|_| "invalid release day")?;
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let max_day = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if leap => 29,
            2 => 28,
            _ => return Err(format!("invalid release month: {month}")),
        };
        if day == 0 || day > max_day {
            return Err(format!("invalid release day: {day}"));
        }
        Ok(Self(value.to_string()))
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PipArtifactName {
    pub layer: PipLayer,
    pub artifact_name: String,
    pub version: Version,
    pub release_date: ReleaseDate,
}

fn valid_artifact_name(value: &str) -> bool {
    value
        .bytes()
        .next()
        .is_some_and(|byte| byte.is_ascii_lowercase())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

pub fn parse_pip_filename(path: &Path) -> Result<PipArtifactName, String> {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("PIP filename is not valid UTF-8")?;
    let stem = filename
        .strip_suffix(".pip")
        .ok_or_else(|| format!("PIP filename must end in .pip: {filename}"))?;
    let items: Vec<_> = stem.split('_').collect();
    if items.len() < 6 {
        return Err(format!("invalid layered PIP filename: {filename}"));
    }
    let layer = PipLayer::parse(items[0])?;
    let release_date = ReleaseDate::parse(items[items.len() - 1])?;
    let patch = items[items.len() - 2];
    let minor = items[items.len() - 3];
    let major = items[items.len() - 4];
    let version = Version::parse(&format!("{major}.{minor}.{patch}"))?;
    let artifact_name = items[1..items.len() - 4].join("_");
    if !valid_artifact_name(&artifact_name) {
        return Err(format!("invalid PIP artifact name: {artifact_name}"));
    }
    Ok(PipArtifactName {
        layer,
        artifact_name,
        version,
        release_date,
    })
}

pub fn validate_package_filename(path: &Path, package: &Package) -> Result<(), String> {
    let artifact = parse_pip_filename(path)?;
    let manifest = package.manifest_data();
    if artifact.layer.key() != manifest.layer
        || artifact.artifact_name != manifest.artifact_name
        || artifact.version.dotted() != manifest.package_version
        || artifact.release_date.0 != manifest.release_date
    {
        return Err(format!(
            "PIP filename does not match manifest: {}",
            path.display()
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PipDiscovery {
    Selected(PathBuf),
    NeedsSelection(Vec<PathBuf>),
}

fn validate_loader(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("cannot inspect PIP {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("PIP is not a regular file: {}", path.display()));
    }
    let artifact = parse_pip_filename(path)?;
    if artifact.layer != PipLayer::Loader {
        return Err(format!("Loader 0 requires an a1 PIP: {}", path.display()));
    }
    let package = Package::parse(
        fs::read(path).map_err(|error| format!("cannot read PIP {}: {error}", path.display()))?,
    )?;
    validate_package_filename(path, &package)
}

pub fn discover_loader_pip(
    explicit: Option<&Path>,
    executable: &Path,
) -> Result<PipDiscovery, String> {
    if let Some(path) = explicit {
        validate_loader(path)?;
        return Ok(PipDiscovery::Selected(path.to_path_buf()));
    }
    let directory = executable.parent().ok_or_else(|| {
        format!(
            "executable has no parent directory: {}",
            executable.display()
        )
    })?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| {
        format!(
            "cannot scan Seed directory {}: {error}",
            directory.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("cannot read Seed directory entry: {error}"))?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pip"))
            && parse_pip_filename(&path).is_ok_and(|value| value.layer == PipLayer::Loader)
            && validate_loader(&path).is_ok()
        {
            candidates.push(path);
        }
    }
    candidates.sort();
    if candidates.len() == 1 {
        validate_loader(&candidates[0])?;
        Ok(PipDiscovery::Selected(candidates.remove(0)))
    } else {
        Ok(PipDiscovery::NeedsSelection(candidates))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        PipDiscovery, PipLayer, ReleaseDate, Version, discover_loader_pip, parse_pip_filename,
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn parses_layered_names_from_the_right() {
        let value =
            parse_pip_filename(Path::new("a3_software_authoring_2_10_4_20260918.pip")).unwrap();
        assert_eq!(value.layer, PipLayer::Functional);
        assert_eq!(value.artifact_name, "software_authoring");
        assert_eq!(
            value.version,
            Version {
                major: 2,
                minor: 10,
                patch: 4
            }
        );
        assert_eq!(value.release_date, ReleaseDate("20260918".into()));
    }

    #[test]
    fn rejects_bad_layers_names_versions_and_dates() {
        for name in [
            "intent_map_1_0_0_20260806.pip",
            "a6_app_1_0_0_20260806.pip",
            "a2_Intent_Map_1_0_0_20260806.pip",
            "a2_intent-map_1_0_0_20260806.pip",
            "a2_app_01_0_0_20260806.pip",
            "a2_app_1_0_0_20260230.pip",
        ] {
            assert!(
                parse_pip_filename(Path::new(name)).is_err(),
                "accepted {name}"
            );
        }
    }

    fn temporary_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("pip-core-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures")
            .join(name)
    }

    #[test]
    fn discovers_only_a1_pips_beside_seed() {
        let directory = temporary_directory("discover-one");
        let executable = directory.join("a0_seed.exe");
        fs::write(&executable, b"seed").unwrap();
        let loader = directory.join("a1_loader_1_0_0_20260726.pip");
        fs::copy(fixture("a1_loader_1_0_0_20260726.pip"), &loader).unwrap();
        fs::create_dir(directory.join("pip")).unwrap();
        fs::copy(
            fixture("minimal-valid.pip"),
            directory.join("pip/a5_app_0_1_0_20260726.pip"),
        )
        .unwrap();
        assert_eq!(
            discover_loader_pip(None, &executable).unwrap(),
            PipDiscovery::Selected(loader)
        );
        assert!(
            discover_loader_pip(
                Some(&directory.join("pip/a5_app_0_1_0_20260726.pip")),
                &executable,
            )
            .is_err()
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_zero_or_multiple_loader_candidates() {
        let directory = temporary_directory("discover-many");
        let executable = directory.join("a0_seed.exe");
        fs::write(&executable, b"seed").unwrap();
        assert_eq!(
            discover_loader_pip(None, &executable).unwrap(),
            PipDiscovery::NeedsSelection(Vec::new())
        );
        for name in [
            "a1_loader_1_0_0_20260726.pip",
            "a1_loader_next_1_0_0_20260726.pip",
        ] {
            fs::copy(fixture(name), directory.join(name)).unwrap();
        }
        assert!(
            matches!(discover_loader_pip(None, &executable).unwrap(), PipDiscovery::NeedsSelection(items) if items.len() == 2)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn ignores_invalid_loader_candidates_and_rejects_manifest_mismatches() {
        let directory = temporary_directory("discover-invalid");
        let executable = directory.join("a0_seed.exe");
        fs::write(&executable, b"seed").unwrap();
        let mismatched = directory.join("a1_wrong_name_1_0_0_20260726.pip");
        fs::copy(fixture("a1_loader_1_0_0_20260726.pip"), &mismatched).unwrap();
        assert_eq!(
            discover_loader_pip(None, &executable).unwrap(),
            PipDiscovery::NeedsSelection(Vec::new())
        );
        assert!(discover_loader_pip(Some(&mismatched), &executable).is_err());
        fs::remove_dir_all(directory).unwrap();
    }
}
