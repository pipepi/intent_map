
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
    let bytes = include_bytes!("../../../../tests/fixtures/minimal-valid.pip");
    let file = "a5_intent_map_test_0_1_0_20260726.pip";
    let destination =
        install_user_package(&directory, file, bytes, &PipIoPolicy::unlimited()).unwrap();
    assert_eq!(destination, directory.join("registry/a5").join(file));
    assert!(install_user_package(&directory, file, bytes, &PipIoPolicy::unlimited()).is_err());
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

#[test]
fn round_trips_local_io_policy() {
    let directory = temporary_directory("io-policy");
    assert!(load_io_policy(&directory).unwrap().is_none());
    let mut policy = PipIoPolicy::unlimited();
    policy.max_pip_bytes = crate::PipLimit::Value {
        value: "4096".into(),
    };
    let path = save_io_policy(&directory, &policy).unwrap();
    assert_eq!(path, directory.join("pip-io-policy.json"));
    assert_eq!(load_io_policy(&directory).unwrap(), Some(policy));
    fs::remove_dir_all(directory).unwrap();
}
