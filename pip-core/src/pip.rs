use crate::sha256;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ops::Range;

const PIP_MAGIC: &[u8; 8] = b"PIP\0SEED";
const PIP_VERSION: u32 = 1;
const SECTION_COUNT: usize = 4;
const SECTION_ENTRY_SIZE: usize = 48;
const HEADER_SIZE: usize = 16 + SECTION_COUNT * SECTION_ENTRY_SIZE;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum PipLimit {
    Ask,
    Unlimited,
    Value { value: String },
}

impl PipLimit {
    fn from_cli(value: &str, option: &str) -> Result<Self, String> {
        match value {
            "ask" => Ok(Self::Ask),
            "unlimited" => Ok(Self::Unlimited),
            _ if value == "0"
                || (!value.starts_with('0') && value.bytes().all(|byte| byte.is_ascii_digit())) =>
            {
                Ok(Self::Value {
                    value: value.to_string(),
                })
            }
            _ => Err(format!(
                "{option} requires a non-negative integer, ask, or unlimited"
            )),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PipIoPolicy {
    pub schema_version: u32,
    pub max_pip_bytes: PipLimit,
    pub max_single_resource_bytes: PipLimit,
    pub max_expanded_bytes: PipLimit,
    pub max_resource_count: PipLimit,
    pub max_compression_ratio: PipLimit,
}

impl PipIoPolicy {
    pub fn ask() -> Self {
        Self {
            schema_version: 1,
            max_pip_bytes: PipLimit::Ask,
            max_single_resource_bytes: PipLimit::Ask,
            max_expanded_bytes: PipLimit::Ask,
            max_resource_count: PipLimit::Ask,
            max_compression_ratio: PipLimit::Ask,
        }
    }

    pub fn unlimited() -> Self {
        Self {
            schema_version: 1,
            max_pip_bytes: PipLimit::Unlimited,
            max_single_resource_bytes: PipLimit::Unlimited,
            max_expanded_bytes: PipLimit::Unlimited,
            max_resource_count: PipLimit::Unlimited,
            max_compression_ratio: PipLimit::Unlimited,
        }
    }

    pub fn from_cli_args(args: &[String]) -> Result<Self, String> {
        let mut policy = Self::ask();
        for (option, target) in [
            ("--max-pip-size", &mut policy.max_pip_bytes),
            ("--max-resource-size", &mut policy.max_single_resource_bytes),
            ("--max-expanded-size", &mut policy.max_expanded_bytes),
            ("--max-resource-count", &mut policy.max_resource_count),
            ("--max-compression-ratio", &mut policy.max_compression_ratio),
        ] {
            let positions: Vec<_> = args
                .iter()
                .enumerate()
                .filter_map(|(index, value)| (value == option).then_some(index))
                .collect();
            if positions.len() > 1 {
                return Err(format!("{option} may only be provided once"));
            }
            if let Some(index) = positions.first() {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| format!("{option} requires a value"))?;
                *target = PipLimit::from_cli(value, option)?;
            }
        }
        if args.iter().any(|value| value == "--allow-package-limits") {
            policy.allow_asked();
        }
        policy.validate()?;
        Ok(policy)
    }

    pub fn requires_confirmation(&self) -> bool {
        [
            &self.max_pip_bytes,
            &self.max_single_resource_bytes,
            &self.max_expanded_bytes,
            &self.max_resource_count,
            &self.max_compression_ratio,
        ]
        .into_iter()
        .any(|limit| matches!(limit, PipLimit::Ask))
    }

    pub fn allow_asked(&mut self) {
        for limit in [
            &mut self.max_pip_bytes,
            &mut self.max_single_resource_bytes,
            &mut self.max_expanded_bytes,
            &mut self.max_resource_count,
            &mut self.max_compression_ratio,
        ] {
            if matches!(limit, PipLimit::Ask) {
                *limit = PipLimit::Unlimited;
            }
        }
    }

    fn limit_value(field: &str, limit: &PipLimit) -> Result<Option<u64>, String> {
        let PipLimit::Value { value } = limit else {
            return Ok(None);
        };
        if value != "0"
            && (value.starts_with('0') || !value.bytes().all(|byte| byte.is_ascii_digit()))
        {
            return Err(format!("invalid PIP I/O policy value for {field}"));
        }
        value
            .parse::<u64>()
            .map(Some)
            .map_err(|_| format!("invalid PIP I/O policy value for {field}"))
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("unsupported PIP I/O policy version".into());
        }
        for (field, limit) in [
            ("maxPipBytes", &self.max_pip_bytes),
            ("maxSingleResourceBytes", &self.max_single_resource_bytes),
            ("maxExpandedBytes", &self.max_expanded_bytes),
            ("maxResourceCount", &self.max_resource_count),
            ("maxCompressionRatio", &self.max_compression_ratio),
        ] {
            Self::limit_value(field, limit)?;
        }
        Ok(())
    }

    fn authorize(&self, field: &str, limit: &PipLimit, actual: u64) -> Result<(), String> {
        self.validate()?;
        match limit {
            PipLimit::Ask => Err(format!(
                "PIP I/O confirmation required for {field}: {actual}"
            )),
            PipLimit::Unlimited => Ok(()),
            PipLimit::Value { .. } => {
                let maximum = Self::limit_value(field, limit)?.expect("value limit");
                if actual <= maximum {
                    Ok(())
                } else {
                    Err(format!("{field} exceeded: {actual}/{maximum}"))
                }
            }
        }
    }
}

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
            || (layer == crate::PipLayer::Functional && manifest.provided_capabilities.is_empty())
        {
            return Err("invalid PIP manifest fields".into());
        }
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
mod tests {
    use super::{Package, PipIoPolicy, PipLimit};

    #[test]
    fn reads_typescript_fixed_vector() {
        let package = Package::parse_with_policy(
            include_bytes!("../../tests/fixtures/minimal-valid.pip").to_vec(),
            &PipIoPolicy::unlimited(),
        )
        .expect("TypeScript fixture must be a valid PIP");
        assert_eq!(package.assets().len(), 1);
        assert_eq!(package.assets()[0].path, "index.html");
        assert_eq!(package.asset_bytes(&package.assets()[0]), b"<h1>PIP</h1>");
    }

    #[test]
    fn policy_asks_by_default_and_accepts_explicit_limits() {
        let bytes = include_bytes!("../../tests/fixtures/minimal-valid.pip").to_vec();
        let error = Package::parse_with_policy(bytes.clone(), &PipIoPolicy::ask())
            .err()
            .expect("ask policy must require confirmation");
        assert!(error.contains("maxPipBytes"));

        let mut policy = PipIoPolicy::unlimited();
        policy.max_pip_bytes = PipLimit::Value {
            value: (bytes.len() - 1).to_string(),
        };
        let error = Package::parse_with_policy(bytes, &policy)
            .err()
            .expect("small limit must reject package");
        assert!(error.contains("maxPipBytes exceeded"));
    }

    #[test]
    fn parses_cli_policy_without_hidden_defaults() {
        let args =
            ["--max-pip-size", "1024", "--max-resource-size", "unlimited"].map(str::to_string);
        let policy = PipIoPolicy::from_cli_args(&args).expect("valid policy");
        assert_eq!(
            policy.max_pip_bytes,
            PipLimit::Value {
                value: "1024".into()
            }
        );
        assert_eq!(policy.max_single_resource_bytes, PipLimit::Unlimited);
        assert!(policy.requires_confirmation());

        let allowed = PipIoPolicy::from_cli_args(&["--allow-package-limits".into()])
            .expect("explicit consent");
        assert!(!allowed.requires_confirmation());
        assert!(PipIoPolicy::from_cli_args(&["--max-pip-size".into()]).is_err());
        assert!(
            PipIoPolicy::from_cli_args(&[
                "--max-pip-size".into(),
                "1".into(),
                "--max-pip-size".into(),
                "2".into(),
            ])
            .is_err()
        );
    }
}
