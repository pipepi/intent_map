#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pip_core::Package;
use std::borrow::Cow;
use std::env;
use std::fs;
use std::sync::Arc;
use tauri::http::{Method, Request, Response, StatusCode, header};
use tauri::{WebviewUrl, WebviewWindowBuilder};

fn load_payload() -> Result<Vec<u8>, String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if let Some(index) = args.iter().position(|argument| argument == "--pip") {
        let path = args.get(index + 1).ok_or("--pip requires a path")?;
        return fs::read(path).map_err(|error| format!("cannot read PIP: {error}"));
    }
    let executable =
        env::current_exe().map_err(|error| format!("cannot locate executable: {error}"))?;
    pip_core::envelope::extract_from_file(&executable)
}

fn package_response(package: &Package, request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain; charset=utf-8",
            b"method not allowed".to_vec(),
            request.method() == Method::HEAD,
        );
    }
    let raw_path = request.uri().path();
    if raw_path.contains("..") || raw_path.contains('\\') {
        return response(
            StatusCode::BAD_REQUEST,
            "text/plain; charset=utf-8",
            b"unsafe path".to_vec(),
            request.method() == Method::HEAD,
        );
    }
    if raw_path == "/__pip/package" {
        return response(
            StatusCode::OK,
            "application/vnd.intent-map.pip",
            package.bytes().to_vec(),
            request.method() == Method::HEAD,
        );
    }
    if raw_path == "/__pip/manifest" {
        return response(
            StatusCode::OK,
            "application/json; charset=utf-8",
            package.manifest().to_vec(),
            request.method() == Method::HEAD,
        );
    }
    let path = if raw_path == "/" {
        "index.html"
    } else {
        raw_path.trim_start_matches('/')
    };
    if let Some(asset) = package.assets().iter().find(|asset| asset.path == path) {
        response(
            StatusCode::OK,
            &asset.mime,
            package.asset_bytes(asset).to_vec(),
            request.method() == Method::HEAD,
        )
    } else {
        response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"not found".to_vec(),
            request.method() == Method::HEAD,
        )
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

fn run() -> Result<(), String> {
    let package = Arc::new(Package::parse(load_payload()?)?);
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let protocol_package = Arc::clone(&package);
    tauri::Builder::default()
        .register_uri_scheme_protocol("pip", move |_context, request| {
            package_response(&protocol_package, &request)
        })
        .setup(|app| {
            let url = "pip://localhost/index.html?token=desktop"
                .parse()
                .map_err(|error| format!("invalid desktop URL: {error}"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Intent Map")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                // On Windows, Wry maps this flag to both WebView2 zoom controls
                // and IsPinchZoomEnabled. Keep it enabled so touch and precision
                // touchpad pinch gestures reach the embedded application.
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
    let caption: Vec<u16> = OsStr::new("Intent Map PIP")
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
    if let Err(error) = run() {
        show_fatal(&error);
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::package_response;
    use pip_core::Package;
    use tauri::http::{Method, Request, StatusCode};

    fn fixture() -> Package {
        Package::parse(include_bytes!("../../tests/fixtures/minimal-valid.pip").to_vec())
            .expect("shared PIP fixture must be valid")
    }

    fn request(method: Method, path: &str) -> Request<Vec<u8>> {
        Request::builder()
            .method(method)
            .uri(format!("pip://localhost{path}"))
            .body(Vec::new())
            .unwrap()
    }

    #[test]
    fn serves_assets_and_package_from_memory() {
        let package = fixture();
        let index = package_response(&package, &request(Method::GET, "/index.html"));
        assert_eq!(index.status(), StatusCode::OK);
        assert_eq!(index.body().as_ref(), b"<h1>PIP</h1>");

        let payload = package_response(&package, &request(Method::GET, "/__pip/package"));
        assert_eq!(payload.status(), StatusCode::OK);
        assert_eq!(payload.body().as_ref(), package.bytes());
    }

    #[test]
    fn rejects_writes_and_path_traversal() {
        let package = fixture();
        assert_eq!(
            package_response(&package, &request(Method::POST, "/index.html")).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        assert_eq!(
            package_response(&package, &request(Method::GET, "/../secret")).status(),
            StatusCode::BAD_REQUEST
        );
    }
}
