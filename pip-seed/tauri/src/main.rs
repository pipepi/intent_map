#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod native_export;

use pip_seed_runtime::{
    CatalogSource, Package, PackageOrigin, PipDiscovery, PipIoPolicy, PipLayer, RuntimeProfile,
    catalog_entries_from_sources_with_trust, discover_loader_pip, install_user_package,
    load_catalog_package_from_source, load_default_editor_package, load_io_policy,
    load_runtime_profile, resolve_package_ref, runtime_catalog_sources, save_io_policy,
    save_runtime_profile, trust_hash, trust_package_hashes, trusted_hashes, user_data_root,
    validate_package_filename, validate_profile_trust, validate_runtime_profile,
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
    sources: Vec<CatalogSource>,
    user_root: PathBuf,
    force_selection: bool,
    loader: pip_seed_runtime::Manifest,
    profile: Option<RuntimeProfile>,
    io_policy: PipIoPolicy,
    seed_source_sha: Option<&'static str>,
    launch_package: Option<Vec<u8>>,
    seed_artifact: PathBuf,
}

#[derive(Debug, PartialEq)]
enum OneShotCommand {
    Verify(PathBuf),
}

fn parse_one_shot_command(args: &[String]) -> Result<Option<OneShotCommand>, String> {
    match args.first().map(String::as_str) {
        Some("--verify") => args
            .get(1)
            .filter(|path| !path.starts_with("--"))
            .map(PathBuf::from)
            .map(OneShotCommand::Verify)
            .map(Some)
            .ok_or("--verify requires a PIP path".into()),
        _ => Ok(None),
    }
}

fn run_one_shot(command: OneShotCommand, policy: &PipIoPolicy) -> Result<(), String> {
    match command {
        OneShotCommand::Verify(path) => {
            let package = Package::parse_with_policy(
                fs::read(&path).map_err(|error| format!("cannot read PIP: {error}"))?,
                policy,
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

fn argument_string(args: &[String], name: &str) -> Result<Option<String>, String> {
    let Some(index) = args.iter().position(|argument| argument == name) else {
        return Ok(None);
    };
    args.get(index + 1)
        .cloned()
        .map(Some)
        .ok_or_else(|| format!("{name} requires a value"))
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

/** Validates the flat A1-A4 closure carried by A5 before any embedded code is selected. */
fn validate_launch_closure(
    bytes: &[u8],
    policy: &PipIoPolicy,
) -> Result<(Package, Package, Vec<String>), String> {
    let node_map = Package::parse_with_policy(bytes.to_vec(), policy)?;
    let manifest = node_map.manifest_data();
    if manifest.layer != "a5" {
        return Err("launch package must be an a5 Node Map".into());
    }
    let profile = manifest
        .launch_profile
        .as_ref()
        .ok_or("launch A5 has no launchProfile")?;
    let mut packages = Vec::new();
    for asset in node_map
        .assets()
        .iter()
        .filter(|asset| asset.path.starts_with("packages/") && asset.path.ends_with(".pip"))
    {
        let package = Package::parse_with_policy(node_map.asset_bytes(asset).to_vec(), policy)?;
        validate_package_filename(
            Path::new(asset.path.trim_start_matches("packages/")),
            &package,
        )?;
        packages.push(package);
    }
    let matches_ref = |package: &Package, reference: &pip_seed_runtime::ManifestPackageRef| {
        let item = package.manifest_data();
        item.package_id == reference.package_id
            && item.package_version == reference.version
            && item.release_date == reference.release_date
            && pip_seed_runtime::sha256_hex(package.bytes()) == reference.sha256
    };
    for reference in &manifest.dependencies {
        let node_type = packages
            .iter()
            .find(|package| matches_ref(package, reference))
            .ok_or_else(|| format!("launch closure lacks A4 {}", reference.package_id))?;
        if node_type.manifest_data().layer != "a4" {
            return Err("A5 dependency is not A4".into());
        }
        for element in &node_type.manifest_data().dependencies {
            if !packages.iter().any(|package| {
                matches_ref(package, element) && package.manifest_data().layer == "a3"
            }) {
                return Err(format!("launch closure lacks A3 {}", element.package_id));
            }
        }
    }
    let loader = packages
        .iter()
        .find(|package| {
            matches_ref(package, &profile.loader) && package.manifest_data().layer == "a1"
        })
        .ok_or("launch closure lacks exact A1")?
        .clone();
    let editor = packages
        .iter()
        .find(|package| {
            matches_ref(package, &profile.editor) && package.manifest_data().layer == "a2"
        })
        .ok_or("launch closure lacks exact A2")?
        .clone();
    let hashes = std::iter::once(pip_seed_runtime::sha256_hex(bytes))
        .chain(
            packages
                .iter()
                .map(|package| pip_seed_runtime::sha256_hex(package.bytes())),
        )
        .collect();
    Ok((loader, editor, hashes))
}

fn resolve_loader(
    args: &[String],
    seed: &Path,
    policy: &PipIoPolicy,
) -> Result<Option<PathBuf>, String> {
    let explicit = argument_path(args, "--pip")?;
    match discover_loader_pip(explicit.as_deref(), seed, policy)? {
        PipDiscovery::Selected(path) => Ok(Some(path)),
        PipDiscovery::NeedsSelection(_) => {
            let directory = seed
                .parent()
                .ok_or("Seed artifact has no parent")?
                .join("pip");
            let Some(path) = choose_loader(&directory)? else {
                return Ok(None);
            };
            match discover_loader_pip(Some(&path), seed, policy)? {
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
        return match trusted_hashes(&state.user_root).and_then(|trusted| {
            catalog_entries_from_sources_with_trust(
                &state.sources,
                &trusted,
                &state.io_policy,
            )
        }).and_then(|packages| {
            serde_json::to_vec(&json!({
                "forceSelection": state.force_selection,
                "loader": {
                    "layer": state.loader.layer,
                    "artifactName": state.loader.artifact_name,
                    "packageVersion": state.loader.package_version,
                    "releaseDate": state.loader.release_date,
                },
                "profile": state.profile,
                "seedSourceSha256": state.seed_source_sha,
                "seedIdentityMatchesProfile": state.profile.as_ref().and_then(|profile| profile.seed.as_ref())
                    .map(|seed| Some(seed.sha256.as_str()) == state.seed_source_sha),
                "packages": packages,
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
    if request.method() == Method::GET && raw_path == "/__pip/launch-package" {
        return match &state.launch_package {
            Some(bytes) => response(
                StatusCode::OK,
                "application/vnd.intent-map.pip",
                bytes.clone(),
                false,
            ),
            None => response(
                StatusCode::NO_CONTENT,
                "application/vnd.intent-map.pip",
                Vec::new(),
                false,
            ),
        };
    }
    if request.method() == Method::POST && raw_path == "/__pip/export-native" {
        return match native_export::export_native(
            request.body(),
            &state.seed_artifact,
            &state.io_policy,
        ) {
            Ok((body, mime)) => response(StatusCode::OK, mime, body, false),
            Err(error) => response(
                StatusCode::BAD_REQUEST,
                "text/plain",
                error.into_bytes(),
                false,
            ),
        };
    }
    if request.method() == Method::GET && raw_path == "/__pip/io-policy" {
        return match load_io_policy(&state.user_root).and_then(|policy| {
            serde_json::to_vec(&policy.unwrap_or_else(PipIoPolicy::ask))
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
    if request.method() == Method::POST && raw_path == "/__pip/io-policy" {
        let result = serde_json::from_slice::<PipIoPolicy>(request.body())
            .map_err(|error| format!("invalid PIP I/O policy: {error}"))
            .and_then(|policy| save_io_policy(&state.user_root, &policy).map(|_| ()));
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
    if request.method() == Method::POST && raw_path == "/__pip/activate" {
        let result = serde_json::from_slice::<serde_json::Value>(request.body())
            .map_err(|error| format!("invalid activation request: {error}"))
            .and_then(|value| {
                let file = value
                    .get("file")
                    .and_then(|item| item.as_str())
                    .map(str::to_owned)
                    .ok_or_else(|| "activation request requires file".to_string())?;
                let origin = value
                    .get("origin")
                    .and_then(|item| item.as_str())
                    .ok_or_else(|| "activation request requires origin".to_string())?;
                let origin = match origin {
                    "system" => PackageOrigin::System,
                    "user" => PackageOrigin::User,
                    _ => return Err("activation origin must be system or user".into()),
                };
                Ok((origin, file))
            })
            .and_then(|(origin, file)| {
                let package = state
                    .sources
                    .iter()
                    .filter(|source| source.origin == origin)
                    .find_map(|source| {
                        load_catalog_package_from_source(source, &file, &state.io_policy)
                            .ok()
                            .map(|(_, package)| package)
                    })
                    .ok_or_else(|| "activation package is unavailable".to_string())?;
                if package.manifest_data().layer != "a2" {
                    return Err("only a2 editors can be activated".into());
                }
                if origin == PackageOrigin::User
                    && !trusted_hashes(&state.user_root)?
                        .contains(&pip_seed_runtime::sha256_hex(package.bytes()))
                {
                    return Err("user editor SHA is not trusted for execution".into());
                }
                Ok(package)
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
    if request.method() == Method::POST && raw_path == "/__pip/trust" {
        let result = serde_json::from_slice::<serde_json::Value>(request.body())
            .map_err(|error| format!("invalid trust request: {error}"))
            .and_then(|value| {
                value
                    .get("sha256")
                    .and_then(|item| item.as_str())
                    .ok_or_else(|| "trust request requires sha256".to_string())
                    .and_then(|hash| trust_hash(&state.user_root, hash))
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
    if request.method() == Method::POST && raw_path == "/__pip/trust-batch" {
        let result = serde_json::from_slice::<serde_json::Value>(request.body())
            .map_err(|error| format!("invalid trust batch: {error}"))
            .and_then(|value| {
                value
                    .get("sha256")
                    .and_then(|item| item.as_array())
                    .ok_or_else(|| "trust batch requires sha256 array".to_string())
                    .and_then(|values| {
                        values
                            .iter()
                            .map(|item| {
                                item.as_str()
                                    .map(str::to_owned)
                                    .ok_or_else(|| "trust batch contains invalid SHA".to_string())
                            })
                            .collect::<Result<Vec<_>, _>>()
                    })
            })
            .and_then(|hashes| trust_package_hashes(&state.user_root, &hashes));
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
    if request.method() == Method::POST && raw_path == "/__pip/profiles" {
        let result = serde_json::from_slice::<RuntimeProfile>(request.body())
            .map_err(|error| format!("invalid runtime profile: {error}"))
            .and_then(|profile| {
                save_runtime_profile(&state.user_root, &profile, &state.sources, &state.io_policy)
                    .map(|_| ())
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
    if request.method() == Method::POST {
        if let Some(file) = raw_path.strip_prefix("/__pip/install/") {
            return match install_user_package(
                &state.user_root,
                file,
                request.body(),
                &state.io_policy,
            ) {
                Ok(_) => response(StatusCode::CREATED, "text/plain", Vec::new(), false),
                Err(error) => response(
                    StatusCode::BAD_REQUEST,
                    "text/plain",
                    error.into_bytes(),
                    false,
                ),
            };
        }
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
    if let Some(rest) = raw_path.strip_prefix("/__pip/packages/") {
        let Some((origin, file)) = rest.split_once('/') else {
            return response(
                StatusCode::BAD_REQUEST,
                "text/plain",
                b"package path requires origin and file".to_vec(),
                head_only,
            );
        };
        let origin = match origin {
            "system" => PackageOrigin::System,
            "user" => PackageOrigin::User,
            "workspace" => PackageOrigin::Workspace,
            _ => {
                return response(
                    StatusCode::BAD_REQUEST,
                    "text/plain",
                    b"invalid package origin".to_vec(),
                    head_only,
                );
            }
        };
        let package = state
            .sources
            .iter()
            .filter(|source| source.origin == origin)
            .find_map(|source| {
                load_catalog_package_from_source(source, file, &state.io_policy)
                    .ok()
                    .map(|(_, package)| package)
            });
        return match package {
            Some(package) => response(
                StatusCode::OK,
                "application/vnd.intent-map.pip",
                package.bytes().to_vec(),
                head_only,
            ),
            None => response(
                StatusCode::NOT_FOUND,
                "text/plain",
                b"package not found".to_vec(),
                head_only,
            ),
        };
    }
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

fn run(args: &[String], policy: PipIoPolicy) -> Result<(), String> {
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    let seed = seed_artifact(&executable);
    let system_directory = seed
        .parent()
        .ok_or("Seed artifact has no parent")?
        .join("pip");
    let user_root = user_data_root()?;
    let launch_package = argument_path(args, "--launch")?
        .map(|path| {
            let bytes =
                fs::read(&path).map_err(|error| format!("cannot read launch PIP: {error}"))?;
            let package = Package::parse_with_policy(bytes.clone(), &policy)?;
            validate_package_filename(&path, &package)?;
            if package.manifest_data().layer != "a5" {
                return Err("--launch requires an a5 Node Map PIP".into());
            }
            Ok::<_, String>(bytes)
        })
        .transpose()?
        .or(native_export::embedded_node_map(&executable, &policy)?);
    let launch_runtime = launch_package
        .as_deref()
        .map(|bytes| validate_launch_closure(bytes, &policy))
        .transpose()?;
    if let Some((_, _, hashes)) = &launch_runtime {
        trust_package_hashes(&user_root, hashes)?;
    }
    let sources = runtime_catalog_sources(&system_directory, &user_root);
    let profile: Option<RuntimeProfile> = argument_string(args, "--profile")?
        .map(|profile_id| load_runtime_profile(&user_root, &profile_id))
        .transpose()?;
    if let Some(profile) = &profile {
        validate_runtime_profile(profile, &sources, &policy)?;
        validate_profile_trust(profile, &trusted_hashes(&user_root)?)?;
    }
    let loader_from_profile = profile
        .as_ref()
        .map(|profile| {
            resolve_package_ref(&sources, &profile.loader, Some(PipLayer::Loader), &policy)
        })
        .transpose()?
        .map(|(path, _)| path);
    let loader_path = if launch_runtime.is_some() {
        None
    } else {
        if argument_path(args, "--pip")?.is_some() || loader_from_profile.is_none() {
            resolve_loader(args, &seed, &policy)?
        } else {
            loader_from_profile
        }
    };
    let package = if let Some((loader, _, _)) = &launch_runtime {
        loader.clone()
    } else {
        let Some(loader_path) = loader_path else {
            return Ok(());
        };
        Package::parse_with_policy(
            fs::read(&loader_path).map_err(|error| format!("cannot read PIP: {error}"))?,
            &policy,
        )?
    };
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let loader = package.manifest_data().clone();
    let force_selection = args.iter().any(|argument| argument == "--select-editor");
    let explicit_editor = argument_path(args, "--editor")?
        .map(|path| {
            let bytes =
                fs::read(&path).map_err(|error| format!("cannot read editor PIP: {error}"))?;
            let editor = Package::parse_with_policy(bytes, &policy)?;
            validate_package_filename(&path, &editor)?;
            if editor.manifest_data().layer != "a2" {
                return Err::<Package, String>("--editor requires an a2 PIP".into());
            }
            Ok(editor)
        })
        .transpose()?;
    let profile_editor = profile
        .as_ref()
        .map(|profile| {
            resolve_package_ref(&sources, &profile.editor, Some(PipLayer::Editor), &policy)
                .map(|(_, package)| package)
        })
        .transpose()?;
    let package = if force_selection {
        package
    } else if let Some((_, editor, _)) = &launch_runtime {
        editor.clone()
    } else if let Some(editor) = explicit_editor.or(profile_editor) {
        editor
    } else {
        load_default_editor_package(&package, &sources, false, &policy)?.unwrap_or(package)
    };
    let state = Arc::new(RuntimeState {
        package: RwLock::new(package),
        sources,
        user_root,
        force_selection,
        loader,
        profile,
        io_policy: policy,
        seed_source_sha: option_env!("PIP_SEED_SOURCE_SHA"),
        launch_package,
        seed_artifact: seed,
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
    let local_policy = user_data_root().and_then(|root| load_io_policy(&root));
    let local_policy = match local_policy {
        Ok(policy) => policy,
        Err(error) => {
            show_fatal(&error);
            std::process::exit(1);
        }
    };
    let parsed_policy = match PipIoPolicy::resolve_cli_args(&args, local_policy.as_ref()) {
        Ok(policy) => policy,
        Err(error) => {
            show_fatal(&error);
            std::process::exit(1);
        }
    };
    match parse_one_shot_command(&args) {
        Ok(Some(command)) => {
            if let Err(error) = run_one_shot(command, &parsed_policy) {
                show_fatal(&error);
                std::process::exit(1);
            }
        }
        Err(error) => {
            show_fatal(&error);
            std::process::exit(1);
        }
        Ok(None) => {
            let mut policy = parsed_policy;
            // Launching the interactive desktop application is explicit consent
            // for this process to read its selected/local packages. Preserve any
            // configured finite limits, but allow otherwise-unconfigured metrics
            // without a redundant startup dialog or persisting an unlimited policy.
            if policy.requires_confirmation() {
                policy.allow_asked();
            }
            if let Err(error) = run(&args, policy) {
                show_fatal(&error);
                std::process::exit(1);
            }
        }
    }
}

#[cfg(test)]
#[path = "tests/main_tests.rs"]
mod tests;
