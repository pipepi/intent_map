use super::{Package, PipIoPolicy, PipLimit};

#[test]
fn reads_typescript_fixed_vector() {
    let package = Package::parse_with_policy(
        include_bytes!("../../../../tests/fixtures/minimal-valid.pip").to_vec(),
        &PipIoPolicy::unlimited(),
    )
    .expect("TypeScript fixture must be a valid PIP");
    assert_eq!(package.assets().len(), 1);
    assert_eq!(package.assets()[0].path, "index.html");
    assert_eq!(package.asset_bytes(&package.assets()[0]), b"<h1>PIP</h1>");
}

#[test]
fn policy_asks_by_default_and_accepts_explicit_limits() {
    let bytes = include_bytes!("../../../../tests/fixtures/minimal-valid.pip").to_vec();
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
    let args = ["--max-pip-size", "1024", "--max-resource-size", "unlimited"].map(str::to_string);
    let policy = PipIoPolicy::from_cli_args(&args).expect("valid policy");
    assert_eq!(
        policy.max_pip_bytes,
        PipLimit::Value {
            value: "1024".into()
        }
    );
    assert_eq!(policy.max_single_resource_bytes, PipLimit::Unlimited);
    assert!(policy.requires_confirmation());

    let allowed =
        PipIoPolicy::from_cli_args(&["--allow-package-limits".into()]).expect("explicit consent");
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

    let mut local = PipIoPolicy::unlimited();
    local.max_pip_bytes = PipLimit::Value { value: "8".into() };
    let resolved =
        PipIoPolicy::resolve_cli_args(&["--max-resource-count".into(), "3".into()], Some(&local))
            .expect("CLI overlays local policy");
    assert_eq!(resolved.max_pip_bytes, local.max_pip_bytes);
    assert_eq!(
        resolved.max_resource_count,
        PipLimit::Value { value: "3".into() }
    );
}
