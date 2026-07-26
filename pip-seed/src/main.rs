mod platform;
mod server;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn embedded_payload() -> Result<Vec<u8>, String> {
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    pip_core::envelope::extract_from_file(&executable)
}

fn usage() {
    eprintln!(
        "Usage:\n  pip-seed-cli.exe\n  pip-seed-cli.exe --no-open\n  pip-seed-cli.exe --verify [file.pip]\n  pip-seed-cli.exe --extract <destination.pip>\n  pip-seed-cli.exe --extract <seed.exe> <destination.pip>\n  pip-seed-cli.exe --pip <file.pip> [--no-open]"
    );
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--verify") {
        let bytes = if let Some(path) = args.get(1) {
            fs::read(path).map_err(|error| format!("cannot read PIP: {error}"))?
        } else {
            embedded_payload()?
        };
        let package = pip_core::Package::parse(bytes)?;
        println!(
            "valid PIP: {} bytes, {} assets",
            package.bytes().len(),
            package.assets().len()
        );
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("--extract") {
        let first_path = args.get(1).ok_or("--extract requires a destination path")?;
        let (payload, destination) = if let Some(destination) = args.get(2) {
            (
                pip_core::envelope::extract_from_file(Path::new(first_path))?,
                destination,
            )
        } else {
            (embedded_payload()?, first_path)
        };
        fs::write(destination, payload)
            .map_err(|error| format!("cannot write extracted PIP: {error}"))?;
        println!("{}", Path::new(destination).display());
        return Ok(());
    }
    let external_index = args.iter().position(|argument| argument == "--pip");
    let bytes = if let Some(index) = external_index {
        let path = args.get(index + 1).ok_or("--pip requires a path")?;
        fs::read(PathBuf::from(path)).map_err(|error| format!("cannot read PIP: {error}"))?
    } else {
        embedded_payload()?
    };
    if args
        .iter()
        .any(|argument| argument == "--help" || argument == "-h")
    {
        usage();
        return Ok(());
    }
    let package = pip_core::Package::parse(bytes)?;
    let token = platform::random_token()?;
    server::serve(
        package,
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
