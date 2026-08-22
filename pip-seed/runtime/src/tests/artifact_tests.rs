use super::{
    PipDiscovery, PipLayer, ReleaseDate, Version, discover_loader_pip, parse_pip_filename,
};
use crate::PipIoPolicy;
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn parses_layered_names_from_the_right() {
    let value = parse_pip_filename(Path::new("a3_software_authoring_2_10_4_20260918.pip")).unwrap();
    assert_eq!(value.layer, PipLayer::NodeElement);
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
    let path =
        std::env::temp_dir().join(format!("pip-seed-runtime-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).unwrap();
    path
}

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

#[test]
fn discovers_only_a1_pips_in_the_runtime_repository() {
    let directory = temporary_directory("discover-one");
    let executable = directory.join("a0_seed.exe");
    fs::write(&executable, b"seed").unwrap();
    fs::create_dir(directory.join("pip")).unwrap();
    let loader = directory.join("pip/a1_loader_1_0_0_20260726.pip");
    fs::copy(fixture("a1_loader_1_0_0_20260726.pip"), &loader).unwrap();
    fs::copy(
        fixture("minimal-valid.pip"),
        directory.join("pip/a5_app_0_1_0_20260726.pip"),
    )
    .unwrap();
    assert_eq!(
        discover_loader_pip(None, &executable, &PipIoPolicy::unlimited()).unwrap(),
        PipDiscovery::Selected(loader)
    );
    assert!(
        discover_loader_pip(
            Some(&directory.join("pip/a5_app_0_1_0_20260726.pip")),
            &executable,
            &PipIoPolicy::unlimited(),
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
    fs::create_dir(directory.join("pip")).unwrap();
    assert_eq!(
        discover_loader_pip(None, &executable, &PipIoPolicy::unlimited()).unwrap(),
        PipDiscovery::NeedsSelection(Vec::new())
    );
    for name in [
        "a1_loader_1_0_0_20260726.pip",
        "a1_loader_next_1_0_0_20260726.pip",
    ] {
        fs::copy(fixture(name), directory.join("pip").join(name)).unwrap();
    }
    assert!(
        matches!(discover_loader_pip(None, &executable, &PipIoPolicy::unlimited()).unwrap(), PipDiscovery::NeedsSelection(items) if items.len() == 2)
    );
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn ignores_invalid_loader_candidates_and_rejects_manifest_mismatches() {
    let directory = temporary_directory("discover-invalid");
    let executable = directory.join("a0_seed.exe");
    fs::write(&executable, b"seed").unwrap();
    fs::create_dir(directory.join("pip")).unwrap();
    let mismatched = directory.join("pip/a1_wrong_name_1_0_0_20260726.pip");
    fs::copy(fixture("a1_loader_1_0_0_20260726.pip"), &mismatched).unwrap();
    assert_eq!(
        discover_loader_pip(None, &executable, &PipIoPolicy::unlimited()).unwrap(),
        PipDiscovery::NeedsSelection(Vec::new())
    );
    assert!(
        discover_loader_pip(Some(&mismatched), &executable, &PipIoPolicy::unlimited(),).is_err()
    );
    fs::remove_dir_all(directory).unwrap();
}
