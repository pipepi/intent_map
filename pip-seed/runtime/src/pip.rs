use crate::sha256;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ops::Range;

const PIP_MAGIC: &[u8; 8] = b"PIP\0SEED";
const PIP_VERSION: u32 = 1;
const SECTION_COUNT: usize = 4;
const SECTION_ENTRY_SIZE: usize = 48;
const HEADER_SIZE: usize = 16 + SECTION_COUNT * SECTION_ENTRY_SIZE;

mod policy;
mod manifest_validation;
pub use policy::{PipIoPolicy, PipLimit};

#[derive(Clone, Debug)]
pub struct Asset {
    pub path: String,
    pub mime: String,
    pub range: Range<usize>,
}

#[derive(Clone)]
pub struct Package {
    bytes: Vec<u8>,
    sections: [Range<usize>; SECTION_COUNT],
    assets: Vec<Asset>,
    manifest: Manifest,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageRef {
    pub origin: String,
    pub package_id: String,
    pub version: String,
    pub release_date: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDeclaration {
    pub id: String,
    pub tag: String,
    pub purpose: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProfile {
    pub schema_version: u32,
    pub loader: PackageRef,
    pub editor: PackageRef,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub package_id: String,
    pub layer: String,
    pub artifact_name: String,
    pub name: String,
    pub package_version: String,
    pub release_date: String,
    pub root_node_id: String,
    pub loader_abi: String,
    pub artifact_role: String,
    pub editor_abi: Option<String>,
    pub element_abi: Option<String>,
    pub node_type_abi: Option<String>,
    pub node_map_abi: Option<String>,
    pub entry: Option<String>,
    #[serde(default)]
    pub elements: Vec<ElementDeclaration>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub source_paths: Vec<String>,
    pub source_sha256: Option<String>,
    pub entry_sha256: Option<String>,
    pub redistributable: Option<bool>,
    #[serde(default)]
    pub type_node_ids: Vec<String>,
    #[serde(default)]
    pub root_node_ids: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<PackageRef>,
    pub launch_profile: Option<LaunchProfile>,
    pub provided_editor_kinds: Vec<String>,
    pub supported_document_kinds: Vec<String>,
    pub preferred_editor_kinds: Vec<String>,
    pub required_editor_capabilities: Vec<String>,
    pub provided_capabilities: Vec<String>,
    pub required_capabilities: Vec<String>,
    pub required_authoring_capabilities: Vec<String>,
    pub io_policy: PipIoPolicy,
    pub authoring_kind: Option<String>,
    pub authoring_compiler: Option<String>,
    pub created_at: String,
    pub content_type: String,
}

fn u16_at(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let value = bytes.get(offset..offset + 2).ok_or("truncated u16")?;
    Ok(u16::from_le_bytes(
        value.try_into().map_err(|_| "invalid u16")?,
    ))
}

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let value = bytes.get(offset..offset + 4).ok_or("truncated u32")?;
    Ok(u32::from_le_bytes(
        value.try_into().map_err(|_| "invalid u32")?,
    ))
}

fn u64_at(bytes: &[u8], offset: usize) -> Result<u64, String> {
    let value = bytes.get(offset..offset + 8).ok_or("truncated u64")?;
    Ok(u64::from_le_bytes(
        value.try_into().map_err(|_| "invalid u64")?,
    ))
}

fn parse_assets(section: &[u8], base: usize, policy: &PipIoPolicy) -> Result<Vec<Asset>, String> {
    if section.is_empty() {
        return Ok(Vec::new());
    }
    let count = u32_at(section, 0)? as usize;
    policy.authorize("maxResourceCount", &policy.max_resource_count, count as u64)?;
    let mut cursor = 4usize;
    let mut seen = HashSet::new();
    let mut assets = Vec::with_capacity(count);
    for _ in 0..count {
        let path_len = u16_at(section, cursor)? as usize;
        let mime_len = u16_at(section, cursor + 2)? as usize;
        let data_len = usize::try_from(u64_at(section, cursor + 4)?)
            .map_err(|_| "asset length exceeds platform limit")?;
        policy.authorize(
            "maxSingleResourceBytes",
            &policy.max_single_resource_bytes,
            data_len as u64,
        )?;
        cursor = cursor.checked_add(12).ok_or("asset offset overflow")?;
        let metadata_end = cursor
            .checked_add(path_len)
            .and_then(|value| value.checked_add(mime_len))
            .ok_or("asset metadata overflow")?;
        let data_end = metadata_end
            .checked_add(data_len)
            .ok_or("asset data overflow")?;
        if data_end > section.len() {
            return Err("asset record is truncated".into());
        }
        let path = std::str::from_utf8(&section[cursor..cursor + path_len])
            .map_err(|_| "asset path is not UTF-8")?
            .to_string();
        cursor += path_len;
        let mime = std::str::from_utf8(&section[cursor..cursor + mime_len])
            .map_err(|_| "asset MIME is not UTF-8")?
            .to_string();
        cursor += mime_len;
        if path.is_empty()
            || path.starts_with('/')
            || path.contains("..")
            || path.contains('\\')
            || !seen.insert(path.clone())
        {
            return Err(format!("unsafe or duplicate asset path: {path}"));
        }
        assets.push(Asset {
            path,
            mime,
            range: base + cursor..base + data_end,
        });
        cursor = data_end;
    }
    if cursor != section.len() {
        return Err("asset section contains trailing data".into());
    }
    Ok(assets)
}

impl Package {
    pub fn parse_with_policy(bytes: Vec<u8>, policy: &PipIoPolicy) -> Result<Self, String> {
        policy.authorize("maxPipBytes", &policy.max_pip_bytes, bytes.len() as u64)?;
        if bytes.len() < HEADER_SIZE {
            return Err("PIP header is truncated".into());
        }
        if bytes.get(..8) != Some(PIP_MAGIC) {
            return Err("invalid PIP magic".into());
        }
        if u32_at(&bytes, 8)? != PIP_VERSION || u32_at(&bytes, 12)? as usize != HEADER_SIZE {
            return Err("unsupported PIP header".into());
        }
        let mut sections_vec = Vec::with_capacity(SECTION_COUNT);
        for index in 0..SECTION_COUNT {
            let entry = 16 + index * SECTION_ENTRY_SIZE;
            let offset = usize::try_from(u64_at(&bytes, entry)?).map_err(|_| "offset overflow")?;
            let length =
                usize::try_from(u64_at(&bytes, entry + 8)?).map_err(|_| "length overflow")?;
            if offset < HEADER_SIZE || offset % 8 != 0 {
                return Err(format!("invalid PIP section {index}"));
            }
            let end = offset.checked_add(length).ok_or("section overflow")?;
            if end > bytes.len() {
                return Err(format!("PIP section {index} is out of bounds"));
            }
            let expected = bytes.get(entry + 16..entry + 48).ok_or("truncated hash")?;
            if sha256::digest(&bytes[offset..end]) != expected {
                return Err(format!("PIP section {index} hash mismatch"));
            }
            sections_vec.push(offset..end);
        }
        let mut ordered = sections_vec.clone();
        ordered.sort_by_key(|range| range.start);
        for pair in ordered.windows(2) {
            if pair[0].end > pair[1].start {
                return Err("PIP sections overlap".into());
            }
        }
        let expanded_size = sections_vec.iter().try_fold(0usize, |total, range| {
            total
                .checked_add(range.len())
                .ok_or("expanded size overflow")
        })?;
        policy.authorize(
            "maxExpandedBytes",
            &policy.max_expanded_bytes,
            expanded_size as u64,
        )?;
        policy.authorize("maxCompressionRatio", &policy.max_compression_ratio, 1)?;
        let sections: [Range<usize>; SECTION_COUNT] = sections_vec
            .try_into()
            .map_err(|_| "invalid PIP section count")?;
        let manifest: Manifest = serde_json::from_slice(&bytes[sections[0].clone()])
            .map_err(|error| format!("invalid PIP manifest: {error}"))?;
        manifest_validation::validate_manifest(&manifest)?;
        let assets = parse_assets(&bytes[sections[3].clone()], sections[3].start, policy)?;
        Ok(Self {
            bytes,
            sections,
            assets,
            manifest,
        })
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn manifest(&self) -> &[u8] {
        &self.bytes[self.sections[0].clone()]
    }

    pub fn manifest_data(&self) -> &Manifest {
        &self.manifest
    }

    pub fn assets(&self) -> &[Asset] {
        &self.assets
    }

    pub fn asset_bytes(&self, asset: &Asset) -> &[u8] {
        &self.bytes[asset.range.clone()]
    }
}

#[cfg(test)]
#[path = "tests/pip_tests.rs"]
mod tests;
