mod platform;
mod server;

use pip_core::{
    Package, PipDiscovery, PipLayer, RuntimeProfile, discover_loader_pip, load_runtime_profile,
    resolve_package_ref, runtime_catalog_sources, user_data_root, validate_package_filename,
    validate_profile_trust, validate_runtime_profile, trusted_hashes,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn usage() {
    eprintln!(
        "Usage:\n  pip-seed-cli [--profile <id>] [--pip <a1.pip>] [--editor <a2.pip>] [--select-editor] [--no-open]\n  pip-seed-cli --verify <file.pip>"
    );
}

fn argument_value(args: &[String], name: &str) -> Result<Option<PathBuf>, String> {
    let Some(index) = args.iter().position(|argument| argument == name) else {
        return Ok(None);
    };
    let value = args
        .get(index + 1)
        .ok_or_else(|| format!("{name} requires a path"))?;
    Ok(Some(PathBuf::from(value)))
}

fn string_value(args: &[String], name: &str) -> Result<Option<String>, String> {
    let Some(index) = args.iter().position(|argument| argument == name) else {
        return Ok(None);
    };
    args.get(index + 1)
        .cloned()
        .map(Some)
        .ok_or_else(|| format!("{name} requires a value"))
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args
        .iter()
        .any(|argument| argument == "--help" || argument == "-h")
    {
        usage();
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("--verify") {
        if args.len() != 2 {
            return Err("--verify requires exactly one PIP path".into());
        }
        let path = Path::new(&args[1]);
        let package =
            Package::parse(fs::read(path).map_err(|error| format!("cannot read PIP: {error}"))?)?;
        validate_package_filename(path, &package)?;
        println!(
            "valid PIP: {} · {} · {} bytes · {} assets",
            package.manifest_data().layer,
            package.manifest_data().package_version,
            package.bytes().len(),
            package.assets().len()
        );
        return Ok(());
    }
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    let explicit = argument_value(&args, "--pip")?;
    let executable_parent = executable.parent().ok_or("executable has no parent")?;
    let runtime_root = if executable_parent.file_name().is_some_and(|name| name == "tools") {
        executable_parent.parent().ok_or("tools directory has no runtime parent")?
    } else {
        executable_parent
    };
    let system_directory = explicit.as_deref()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or(runtime_root.join("pip"));
    let user_root = user_data_root()?;
    let sources = runtime_catalog_sources(&system_directory, &user_root);
    let profile: Option<RuntimeProfile> = string_value(&args, "--profile")?
        .map(|id| load_runtime_profile(&user_root, &id))
        .transpose()?;
    if let Some(profile) = &profile {
        validate_runtime_profile(profile, &sources)?;
        validate_profile_trust(profile, &trusted_hashes(&user_root)?)?;
    }
    let profile_loader = profile.as_ref()
        .map(|profile| resolve_package_ref(&sources, &profile.loader, Some(PipLayer::Loader)))
        .transpose()?
        .map(|(path, _)| path);
    let discovery = if explicit.is_some() || profile_loader.is_none() {
        discover_loader_pip(explicit.as_deref(), &runtime_root.join("seed"))?
    } else {
        PipDiscovery::Selected(profile_loader.expect("profile loader"))
    };
    let path = match discovery {
        PipDiscovery::Selected(path) => path,
        PipDiscovery::NeedsSelection(candidates) => {
            return Err(format!(
                "expected exactly one a1 Loader PIP in the runtime repository, found {}; use --pip <path>",
                candidates.len()
            ));
        }
    };
    let package =
        Package::parse(fs::read(&path).map_err(|error| format!("cannot read PIP: {error}"))?)?;
    let token = platform::random_token()?;
    let explicit_editor = argument_value(&args, "--editor")?
        .map(|path| {
            let editor = Package::parse(fs::read(&path).map_err(|error| format!("cannot read editor PIP: {error}"))?)?;
            validate_package_filename(&path, &editor)?;
            if editor.manifest_data().layer != "a2" { return Err::<Package, String>("--editor requires an a2 PIP".into()); }
            Ok(editor)
        })
        .transpose()?;
    let profile_editor = profile.as_ref()
        .map(|profile| resolve_package_ref(&sources, &profile.editor, Some(PipLayer::Editor)).map(|(_, package)| package))
        .transpose()?;
    server::serve(
        package,
        sources,
        user_root,
        explicit_editor.or(profile_editor),
        profile,
        args.iter().any(|argument| argument == "--select-editor"),
        token,
        !args.iter().any(|argument| argument == "--no-open"),
    )
}

fn main() {
    if let Err(error) = run() {
        eprintln!("pip-seed: {error}");
        std::process::exit(1);
    }
}
