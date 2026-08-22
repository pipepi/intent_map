use super::*;

fn system_source(layer: &str, package: &str) -> CatalogSource {
    CatalogSource {
        origin: PackageOrigin::System,
        directory: Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../repo/system")
            .join(layer)
            .join(package),
        read_only: true,
    }
}

fn reference(source: &CatalogSource, file: &str) -> PackageRef {
    let (_, package) =
        load_catalog_package_from_source(source, file, &PipIoPolicy::unlimited()).unwrap();
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
fn validates_exact_loader_and_editor_profile_references() {
    let loader = system_source("a1", "pip-loader");
    let editor = system_source("a2", "intent-map");
    let sources = vec![loader.clone(), editor.clone()];
    let profile = RuntimeProfile {
        schema_version: 1,
        profile_id: "system".into(),
        name: "System".into(),
        seed: None,
        loader: reference(&loader, "a1_loader_1_0_0_20260806.pip"),
        editor: reference(&editor, "a2_intent_map_1_0_0_20260806.pip"),
        capabilities: BTreeMap::new(),
    };
    validate_runtime_profile(&profile, &sources, &PipIoPolicy::unlimited()).unwrap();
    let mut changed = profile.clone();
    changed.editor.sha256 = "0".repeat(64);
    assert!(validate_runtime_profile(&changed, &sources, &PipIoPolicy::unlimited()).is_err());
}
