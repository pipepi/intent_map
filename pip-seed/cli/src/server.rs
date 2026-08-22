use pip_seed_runtime::{
    CatalogSource, Package, PackageOrigin, PipIoPolicy, RuntimeProfile,
    catalog_entries_from_sources_with_trust, install_user_package,
    load_catalog_package_from_source, load_default_editor_package, load_io_policy, save_io_policy,
    save_runtime_profile, trust_hash, trusted_hashes,
};
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;

mod http;
use http::{RuntimeState, handle};
pub fn serve(
    package: Package,
    sources: Vec<CatalogSource>,
    user_root: PathBuf,
    selected_editor: Option<Package>,
    profile: Option<RuntimeProfile>,
    force_selection: bool,
    token: String,
    open: bool,
    io_policy: PipIoPolicy,
) -> Result<(), String> {
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let loader = package.manifest_data().clone();
    let package = if force_selection {
        package
    } else if let Some(editor) = selected_editor {
        editor
    } else {
        load_default_editor_package(&package, &sources, false, &io_policy)?.unwrap_or(package)
    };
    let state = Arc::new(RuntimeState {
        package: RwLock::new(package),
        sources,
        user_root,
        force_selection,
        loader,
        profile,
        io_policy,
    });
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    let address = listener.local_addr().map_err(|error| error.to_string())?;
    let url = format!("http://127.0.0.1:{}/?token={token}", address.port());
    println!("{url}");
    if open {
        crate::platform::open_browser(&url)?;
    }
    for connection in listener.incoming() {
        match connection {
            Ok(stream) => {
                let state = Arc::clone(&state);
                let token = token.clone();
                std::thread::spawn(move || {
                    if let Err(error) = handle(stream, &state, &token) {
                        eprintln!("request rejected: {error}");
                    }
                });
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }
    Ok(())
}
