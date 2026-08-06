use pip_core::{Package, catalog_entries, load_catalog_package, load_default_catalog_package};
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;

struct RuntimeState {
    package: RwLock<Package>,
    applications: PathBuf,
    force_selection: bool,
    loader: pip_core::Manifest,
}

fn response(
    stream: &mut TcpStream,
    status: &str,
    mime: &str,
    body: &[u8],
    head_only: bool,
    cookie: Option<&str>,
) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {mime}\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'\r\n{}Connection: close\r\n\r\n",
        body.len(),
        cookie
            .map(|value| format!(
                "Set-Cookie: pip_token={value}; Path=/; HttpOnly; SameSite=Strict\r\n"
            ))
            .unwrap_or_default()
    )?;
    if !head_only {
        stream.write_all(body)?;
    }
    Ok(())
}

fn handle(mut stream: TcpStream, state: &RuntimeState, token: &str) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut request_bytes = [0u8; 65_536];
    let size = stream
        .read(&mut request_bytes)
        .map_err(|error| error.to_string())?;
    if size == request_bytes.len() {
        return Err("HTTP request exceeds limit".into());
    }
    let request =
        std::str::from_utf8(&request_bytes[..size]).map_err(|_| "HTTP request is not UTF-8")?;
    let (headers, body) = request.split_once("\r\n\r\n").unwrap_or((request, ""));
    let first_line = headers.lines().next().ok_or("empty HTTP request")?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().ok_or("missing method")?;
    let target = parts.next().ok_or("missing target")?;
    let (raw_path, query) = target.split_once('?').unwrap_or((target, ""));
    let query_authorized = query
        .split('&')
        .any(|item| item == format!("token={token}"));
    let cookie_authorized = headers.lines().any(|line| {
        line.get(..7)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("cookie:"))
            && line.split_once(':').is_some_and(|(_, value)| {
                value
                    .split(';')
                    .any(|cookie| cookie.trim() == format!("pip_token={token}"))
            })
    });
    if !query_authorized && !cookie_authorized {
        response(
            &mut stream,
            "403 Forbidden",
            "text/plain",
            b"forbidden",
            method == "HEAD",
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    if raw_path.contains("..") || raw_path.contains('\\') || raw_path.contains('%') {
        response(
            &mut stream,
            "400 Bad Request",
            "text/plain",
            b"unsafe path",
            false,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    if method == "GET" && raw_path == "/__pip/catalog" {
        let apps = catalog_entries(&state.applications)?;
        let payload = serde_json::to_vec(&json!({
            "forceSelection": state.force_selection,
            "loader": {
                "layer": state.loader.layer,
                "artifactName": state.loader.artifact_name,
                "packageVersion": state.loader.package_version,
                "releaseDate": state.loader.release_date,
            },
            "apps": apps,
        }))
        .map_err(|error| error.to_string())?;
        response(
            &mut stream,
            "200 OK",
            "application/json; charset=utf-8",
            &payload,
            false,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    if method == "POST" && raw_path == "/__pip/activate" {
        let value: serde_json::Value = serde_json::from_str(body)
            .map_err(|error| format!("invalid activation request: {error}"))?;
        let file = value
            .get("file")
            .and_then(|value| value.as_str())
            .ok_or("activation request requires file")?;
        let (_, package) = load_catalog_package(&state.applications, file)?;
        *state.package.write().map_err(|_| "package lock poisoned")? = package;
        response(
            &mut stream,
            "204 No Content",
            "text/plain",
            b"",
            false,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    if !matches!(method, "GET" | "HEAD") {
        response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain",
            b"method not allowed",
            false,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    let head_only = method == "HEAD";
    let package = state.package.read().map_err(|_| "package lock poisoned")?;
    if raw_path == "/__pip/package" {
        response(
            &mut stream,
            "200 OK",
            "application/vnd.intent-map.pip",
            package.bytes(),
            head_only,
            None,
        )
        .map_err(|error| error.to_string())?;
    } else if raw_path == "/__pip/manifest" {
        response(
            &mut stream,
            "200 OK",
            "application/json; charset=utf-8",
            package.manifest(),
            head_only,
            None,
        )
        .map_err(|error| error.to_string())?;
    } else {
        let path = if raw_path == "/" {
            "index.html"
        } else {
            raw_path.trim_start_matches('/')
        };
        if let Some(asset) = package.assets().iter().find(|asset| asset.path == path) {
            let set_cookie = (path == "index.html" && query_authorized).then_some(token);
            response(
                &mut stream,
                "200 OK",
                &asset.mime,
                package.asset_bytes(asset),
                head_only,
                set_cookie,
            )
            .map_err(|error| error.to_string())?;
        } else {
            response(
                &mut stream,
                "404 Not Found",
                "text/plain",
                b"not found",
                head_only,
                None,
            )
            .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn serve(
    package: Package,
    applications: PathBuf,
    force_selection: bool,
    token: String,
    open: bool,
) -> Result<(), String> {
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let loader = package.manifest_data().clone();
    let package =
        load_default_catalog_package(&package, &applications, force_selection)?.unwrap_or(package);
    let state = Arc::new(RuntimeState {
        package: RwLock::new(package),
        applications,
        force_selection,
        loader,
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
