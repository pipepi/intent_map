
use super::{OneShotCommand, parse_one_shot_command, seed_artifact};
use std::path::PathBuf;

#[test]
fn parses_only_external_verify_command() {
    assert_eq!(
        parse_one_shot_command(&["--verify".into(), "a1_loader_1_0_0_20260806.pip".into()])
            .unwrap(),
        Some(OneShotCommand::Verify(PathBuf::from(
            "a1_loader_1_0_0_20260806.pip"
        )))
    );
    assert!(parse_one_shot_command(&["--verify".into()]).is_err());
}

#[test]
fn resolves_the_outer_app_as_the_seed_artifact() {
    assert_eq!(
        seed_artifact(
            PathBuf::from("/runtime/a0_pip_seed_1_0_0_20260806.app/Contents/MacOS/pip-seed-tauri")
                .as_path()
        ),
        PathBuf::from("/runtime/a0_pip_seed_1_0_0_20260806.app")
    );
    assert_eq!(
        seed_artifact(PathBuf::from("/runtime/pip-seed-tauri").as_path()),
        PathBuf::from("/runtime/pip-seed-tauri")
    );
}
