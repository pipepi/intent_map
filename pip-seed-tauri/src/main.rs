#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pip_core::{
    Package, PipDiscovery, catalog_entries, discover_loader_pip, load_catalog_package,
    load_default_catalog_package, validate_package_filename,
};
use serde_json::json;
use std::borrow::Cow;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::http::{Method, Request, Response, StatusCode, header};
use tauri::{WebviewUrl, WebviewWindowBuilder};

struct RuntimeState {
    package: RwLock<Package>,
    applications: PathBuf,
    force_selection: bool,
    loader: pip_core::Manifest,
}

#[derive(Debug, PartialEq)]
enum OneShotCommand {
    Verify(PathBuf),
}

fn parse_one_shot_command(args: &[String]) -> Result<Option<OneShotCommand>, String> {
    match args.first().map(String::as_str) {
        Some("--verify") if args.len() == 2 => {
            Ok(Some(OneShotCommand::Verify(PathBuf::from(&args[1]))))
        }
        Some("--verify") => Err("--verify requires exactly one PIP path".into()),
        _ => Ok(None),
    }
}

fn run_one_shot(command: OneShotCommand) -> Result<(), String> {
    match command {
        OneShotCommand::Verify(path) => {
            let package = Package::parse(
                fs::read(&path).map_err(|error| format!("cannot read PIP: {error}"))?,
            )?;
            validate_package_filename(&path, &package)
        }
    }
}

fn argument_path(args: &[String], name: &str) -> Result<Option<PathBuf>, String> {
    let Some(index) = args.iter().position(|argument| argument == name) else {
        return Ok(None);
    };
    Ok(Some(PathBuf::from(
        args.get(index + 1)
            .ok_or_else(|| format!("{name} requires a path"))?,
    )))
}

fn choose_loader(directory: &Path) -> Result<Option<PathBuf>, String> {
    Ok(rfd::FileDialog::new()
        .set_directory(directory)
        .add_filter("PIP Loader", &["pip"])
        .pick_file())
}

fn seed_artifact(executable: &Path) -> PathBuf {
    let Some(macos) = executable.parent() else {
        return executable.to_path_buf();
    };
    let Some(contents) = macos.parent() else {
        return executable.to_path_buf();
    };
    let Some(bundle) = contents.parent() else {
        return executable.to_path_buf();
    };
    if macos.file_name().is_some_and(|name| name == "MacOS")
        && contents.file_name().is_some_and(|name| name == "Contents")
        && bundle
            .extension()
            .is_some_and(|extension| extension == "app")
    {
        bundle.to_path_buf()
    } else {
        executable.to_path_buf()
    }
}

fn resolve_loader(args: &[String], seed: &Path) -> Result<Option<PathBuf>, String> {
    let explicit = argument_path(args, "--pip")?;
    match discover_loader_pip(explicit.as_deref(), seed)? {
        PipDiscovery::Selected(path) => Ok(Some(path)),
        PipDiscovery::NeedsSelection(_) => {
            let directory = seed.parent().ok_or("Seed artifact has no parent")?;
            let Some(path) = choose_loader(directory)? else {
                return Ok(None);
            };
            match discover_loader_pip(Some(&path), seed)? {
                PipDiscovery::Selected(path) => Ok(Some(path)),
                PipDiscovery::NeedsSelection(_) => unreachable!(),
            }
        }
    }
}

fn response(
    status: StatusCode,
    mime: &str,
    body: Vec<u8>,
    head_only: bool,
) -> Response<Cow<'static, [u8]>> {
    let content_length = body.len();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, content_length)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "no-store")
        .body(if head_only {
            Cow::Borrowed(&[] as &[u8])
        } else {
            Cow::Owned(body)
        })
        .expect("static PIP response must be valid")
}

fn package_response(
    state: &RuntimeState,
    request: &Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let raw_path = request.uri().path();
    if raw_path.contains("..") || raw_path.contains('\\') || raw_path.contains('%') {
        return response(
            StatusCode::BAD_REQUEST,
            "text/plain",
            b"unsafe path".to_vec(),
            false,
        );
    }
    if request.method() == Method::GET && raw_path == "/__pip/catalog" {
        return match catalog_entries(&state.applications).and_then(|apps| {
            serde_json::to_vec(&json!({
                "forceSelection": state.force_selection,
                "loader": {
                    "layer": state.loader.layer,
                    "artifactName": state.loader.artifact_name,
                    "packageVersion": state.loader.package_version,
                    "releaseDate": state.loader.release_date,
                },
                "apps": apps,
            }))
            .map_err(|error| error.to_string())
        }) {
            Ok(body) => response(
                StatusCode::OK,
                "application/json; charset=utf-8",
                body,
                false,
            ),
            Err(error) => response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "text/plain",
                error.into_bytes(),
                false,
            ),
        };
    }
    if request.method() == Method::POST && raw_path == "/__pip/activate" {
        let result = serde_json::from_slice::<serde_json::Value>(request.body())
            .map_err(|error| format!("invalid activation request: {error}"))
            .and_then(|value| {
                value
                    .get("file")
                    .and_then(|item| item.as_str())
                    .map(str::to_owned)
                    .ok_or_else(|| "activation request requires file".into())
            })
            .and_then(|file| {
                load_catalog_package(&state.applications, &file).map(|(_, package)| package)
            })
            .and_then(|package| {
                state
                    .package
                    .write()
                    .map_err(|_| "package lock poisoned".to_string())
                    .map(|mut active| *active = package)
            });
        return match result {
            Ok(()) => response(StatusCode::NO_CONTENT, "text/plain", Vec::new(), false),
            Err(error) => response(
                StatusCode::BAD_REQUEST,
                "text/plain",
                error.into_bytes(),
                false,
            ),
        };
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain",
            b"method not allowed".to_vec(),
            false,
        );
    }
    let head_only = request.method() == Method::HEAD;
    let package = match state.package.read() {
        Ok(package) => package,
        Err(_) => {
            return response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "text/plain",
                b"package lock poisoned".to_vec(),
                head_only,
            );
        }
    };
    if raw_path == "/__pip/package" {
        return response(
            StatusCode::OK,
            "application/vnd.intent-map.pip",
            package.bytes().to_vec(),
            head_only,
        );
    }
    if raw_path == "/__pip/manifest" {
        return response(
            StatusCode::OK,
            "application/json; charset=utf-8",
            package.manifest().to_vec(),
            head_only,
        );
    }
    let asset_path = if raw_path == "/" {
        "index.html"
    } else {
        raw_path.trim_start_matches('/')
    };
    match package
        .assets()
        .iter()
        .find(|asset| asset.path == asset_path)
    {
        Some(asset) => response(
            StatusCode::OK,
            &asset.mime,
            package.asset_bytes(asset).to_vec(),
            head_only,
        ),
        None => response(
            StatusCode::NOT_FOUND,
            "text/plain",
            b"not found".to_vec(),
            head_only,
        ),
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    let seed = seed_artifact(&executable);
    let Some(loader_path) = resolve_loader(args, &seed)? else {
        return Ok(());
    };
    let package = Package::parse(
        fs::read(&loader_path).map_err(|error| format!("cannot read PIP: {error}"))?,
    )?;
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let loader = package.manifest_data().clone();
    let applications = loader_path
        .parent()
        .ok_or("Loader PIP has no parent directory")?
        .join("pip");
    let force_selection = args.iter().any(|argument| argument == "--select-app");
    let package =
        load_default_catalog_package(&package, &applications, force_selection)?.unwrap_or(package);
    let state = Arc::new(RuntimeState {
        package: RwLock::new(package),
        applications,
        force_selection,
        loader,
    });
    let protocol_state = Arc::clone(&state);
    tauri::Builder::default()
        .register_uri_scheme_protocol("pip", move |_context, request| {
            package_response(&protocol_state, &request)
        })
        .setup(|app| {
            let url = "pip://localhost/index.html"
                .parse()
                .map_err(|error| format!("invalid desktop URL: {error}"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("PIP Runtime")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .zoom_hotkeys_enabled(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .map_err(|error| format!("desktop runtime failed: {error}"))
}

#[cfg(windows)]
fn show_fatal(message: &str) {
    use std::os::windows::ffi::OsStrExt;
    use std::{ffi::OsStr, ptr};
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBoxW(
            window: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            kind: u32,
        ) -> i32;
    }
    let text: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let caption: Vec<u16> = OsStr::new("PIP Runtime")
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MessageBoxW(ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10);
    }
}

#[cfg(not(windows))]
fn show_fatal(message: &str) {
    eprintln!("pip-seed-tauri: {message}");
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    match parse_one_shot_command(&args) {
        Ok(Some(command)) => {
            if let Err(error) = run_one_shot(command) {
                show_fatal(&error);
                std::process::exit(1);
            }
        }
        Err(error) => {
            show_fatal(&error);
            std::process::exit(1);
        }
        Ok(None) => {
            if let Err(error) = run(&args) {
                show_fatal(&error);
                std::process::exit(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
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
                PathBuf::from(
                    "/runtime/a0_pip_seed_1_0_0_20260806.app/Contents/MacOS/pip-seed-tauri"
                )
                .as_path()
            ),
            PathBuf::from("/runtime/a0_pip_seed_1_0_0_20260806.app")
        );
        assert_eq!(
            seed_artifact(PathBuf::from("/runtime/pip-seed-tauri").as_path()),
            PathBuf::from("/runtime/pip-seed-tauri")
        );
    }
}
