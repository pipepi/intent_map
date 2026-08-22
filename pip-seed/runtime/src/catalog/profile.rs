use super::*;
pub fn resolve_package_ref(
    sources: &[CatalogSource],
    reference: &PackageRef,
    expected_layer: Option<PipLayer>,
    policy: &PipIoPolicy,
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
            let Ok(loaded) = load_catalog_package_from_source(source, &file, policy) else {
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
        return Err(format!(
            "package {} has the wrong layer",
            reference.package_id
        ));
    }
    Ok((path, package))
}

pub fn validate_runtime_profile(
    profile: &RuntimeProfile,
    sources: &[CatalogSource],
    policy: &PipIoPolicy,
) -> Result<(), String> {
    if profile.schema_version != 1 || profile.profile_id.is_empty() || profile.name.is_empty() {
        return Err("invalid runtime profile identity".into());
    }
    resolve_package_ref(sources, &profile.loader, Some(PipLayer::Loader), policy)?;
    resolve_package_ref(sources, &profile.editor, Some(PipLayer::Editor), policy)?;
    if let Some(seed) = &profile.seed {
        resolve_package_ref(sources, seed, Some(PipLayer::Seed), policy)?;
    }
    let mut providers = HashSet::new();
    for (capability, reference) in &profile.capabilities {
        if !providers.insert(capability) {
            return Err(format!("duplicate capability provider: {capability}"));
        }
        let (_, package) =
            resolve_package_ref(sources, reference, Some(PipLayer::Functional), policy)?;
        if !package
            .manifest_data()
            .provided_capabilities
            .iter()
            .any(|provided| provided == capability)
        {
            return Err(format!(
                "{} does not provide {capability}",
                reference.package_id
            ));
        }
    }
    Ok(())
}

pub fn load_default_editor_package(
    loader: &Package,
    sources: &[CatalogSource],
    force_selection: bool,
    policy: &PipIoPolicy,
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
    let matches: Vec<_> = catalog_entries_from_sources(sources, policy)?
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
    load_catalog_package_from_source(source, &selected.file, policy)
        .map(|(_, package)| Some(package))
}

pub fn load_default_catalog_package(
    loader: &Package,
    directory: &Path,
    force_selection: bool,
    policy: &PipIoPolicy,
) -> Result<Option<Package>, String> {
    load_default_editor_package(
        loader,
        &[CatalogSource {
            origin: PackageOrigin::System,
            directory: directory.to_path_buf(),
            read_only: true,
        }],
        force_selection,
        policy,
    )
}
