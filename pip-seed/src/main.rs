mod platform;
mod server;

use pip_core::{Package, PipDiscovery, discover_loader_pip, validate_package_filename};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn usage() {
    eprintln!(
        "Usage:\n  pip-seed-cli [--pip <a1_loader.pip>] [--no-open] [--select-app]\n  pip-seed-cli --verify <file.pip>"
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
    let explicit = argument_value(&args, "--pip")?;
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    let path = match discover_loader_pip(explicit.as_deref(), &executable)? {
        PipDiscovery::Selected(path) => path,
        PipDiscovery::NeedsSelection(candidates) => {
            return Err(format!(
                "expected exactly one a1 Loader PIP beside Seed, found {}; use --pip <path>",
                candidates.len()
            ));
        }
    };
    let package =
        Package::parse(fs::read(&path).map_err(|error| format!("cannot read PIP: {error}"))?)?;
    let token = platform::random_token()?;
    let application_directory = path
        .parent()
        .ok_or("Loader PIP has no parent directory")?
        .join("pip");
    server::serve(
        package,
        application_directory,
        args.iter().any(|argument| argument == "--select-app"),
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
