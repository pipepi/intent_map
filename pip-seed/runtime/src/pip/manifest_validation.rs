// 清单校验独立于二进制读取，避免格式解析文件承载插件协议规则。
use super::{Manifest, PackageRef};

pub(super) fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.element_abi.as_deref() == Some("relation-element/2")
        || manifest.node_type_abi.as_deref() == Some("relation-node-type/2")
    {
        return Err("Legacy executable plugin must be rebuilt for Pip".into());
    }
    crate::PipLayer::parse(&manifest.layer)?;
    crate::Version::parse(&manifest.package_version)?;
    crate::ReleaseDate::parse(&manifest.release_date)?;
    let valid_capability = |value: &str| {
        let Some((name, version)) = value.rsplit_once('/') else {
            return false;
        };
        !name.is_empty()
            && name
                .bytes()
                .next()
                .is_some_and(|byte| byte.is_ascii_lowercase())
            && name.bytes().all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'.' | b'-')
            })
            && !version.is_empty()
            && !version.starts_with('0')
            && version.bytes().all(|byte| byte.is_ascii_digit())
    };
    let layer = crate::PipLayer::parse(&manifest.layer)?;
    let valid_sha = |value: &str| {
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    };
    let valid_ref = |value: &PackageRef| {
        matches!(value.origin.as_str(), "system" | "user")
            && !value.package_id.is_empty()
            && crate::Version::parse(&value.version).is_ok()
            && crate::ReleaseDate::parse(&value.release_date).is_ok()
            && valid_sha(&value.sha256)
    };
    let valid_executable = || {
        manifest.entry.as_deref() == Some("entry.mjs")
            && !manifest.source_paths.is_empty()
            && manifest
                .source_paths
                .iter()
                .all(|path| path.starts_with("source/") && !path.contains(".."))
            && manifest.source_sha256.as_deref().is_some_and(valid_sha)
            && manifest.entry_sha256.as_deref().is_some_and(valid_sha)
            && manifest.redistributable.is_some()
    };
    if manifest.package_id.is_empty()
        || manifest.artifact_name.is_empty()
        || manifest.name.is_empty()
        || manifest.root_node_id.is_empty()
        || manifest.loader_abi != "pip-loader/1"
        || !matches!(
            manifest.artifact_role.as_str(),
            "authoring-source" | "runtime" | "source-and-runtime"
        )
        || manifest.content_type != "application/vnd.intent-map.pip"
        || manifest.io_policy.validate().is_err()
        || manifest
            .provided_editor_kinds
            .iter()
            .chain(&manifest.supported_document_kinds)
            .chain(&manifest.preferred_editor_kinds)
            .chain(&manifest.required_editor_capabilities)
            .chain(&manifest.provided_capabilities)
            .chain(&manifest.required_capabilities)
            .chain(&manifest.required_authoring_capabilities)
            .any(|value| value.is_empty())
        || manifest
            .authoring_kind
            .as_deref()
            .is_some_and(str::is_empty)
        || manifest
            .authoring_compiler
            .as_deref()
            .is_some_and(str::is_empty)
        || manifest
            .provided_capabilities
            .iter()
            .chain(&manifest.required_authoring_capabilities)
            .any(|value| !valid_capability(value))
        || (layer == crate::PipLayer::Editor
            && (manifest.editor_abi.as_deref() != Some("pip-editor/1")
                || manifest.provided_editor_kinds.is_empty()))
        || (layer != crate::PipLayer::Editor && manifest.editor_abi.is_some())
        || (layer == crate::PipLayer::NodeElement
            && (manifest.element_abi.as_deref() != Some("pip-element/2")
                || manifest.elements.is_empty()
                || !valid_executable()))
        || (layer == crate::PipLayer::NodeType
            && (manifest.node_type_abi.as_deref() != Some("pip-node-type/2")
                || manifest.type_node_ids.is_empty()
                || manifest.dependencies.is_empty()
                || !manifest.dependencies.iter().all(valid_ref)
                || !valid_executable()))
        || (layer == crate::PipLayer::NodeMap
            && (!matches!(manifest.node_map_abi.as_deref(), Some("pip-node-map/1" | "relation-node-map/1"))
                || manifest.root_node_ids.is_empty()
                || manifest.dependencies.is_empty()
                || !manifest.dependencies.iter().all(valid_ref)
                || manifest.launch_profile.as_ref().is_some_and(|profile| {
                    profile.schema_version != 1
                        || !valid_ref(&profile.loader)
                        || !valid_ref(&profile.editor)
                })))
        || (layer != crate::PipLayer::NodeElement
            && (manifest.element_abi.is_some() || !manifest.elements.is_empty()))
        || (layer != crate::PipLayer::NodeType
            && (manifest.node_type_abi.is_some() || !manifest.type_node_ids.is_empty()))
        || (layer != crate::PipLayer::NodeMap
            && (manifest.node_map_abi.is_some()
                || !manifest.root_node_ids.is_empty()
                || manifest.launch_profile.is_some()))
    {
        return Err("invalid PIP manifest fields".into());
    }
    Ok(())
}
