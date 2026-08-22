use serde::{Deserialize, Serialize};
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
        Self::resolve_cli_args(args, None)
    }

    pub fn resolve_cli_args(
        args: &[String],
        lower_priority: Option<&PipIoPolicy>,
    ) -> Result<Self, String> {
        let mut policy = lower_priority.cloned().unwrap_or_else(Self::ask);
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

    pub(super) fn authorize(
        &self,
        field: &str,
        limit: &PipLimit,
        actual: u64,
    ) -> Result<(), String> {
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
