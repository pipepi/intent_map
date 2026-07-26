use crate::pip::Package;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;

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

fn handle(mut stream: TcpStream, package: &Package, token: &str) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut request = [0u8; 8192];
    let size = stream
        .read(&mut request)
        .map_err(|error| error.to_string())?;
    if size == request.len() {
        return Err("HTTP request headers exceed limit".into());
    }
    let request = std::str::from_utf8(&request[..size]).map_err(|_| "HTTP request is not UTF-8")?;
    let first_line = request.lines().next().ok_or("empty HTTP request")?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().ok_or("missing method")?;
    let target = parts.next().ok_or("missing target")?;
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
    let (raw_path, query) = target.split_once('?').unwrap_or((target, ""));
    let query_authorized = query
        .split('&')
        .any(|item| item == format!("token={token}"));
    let cookie_authorized = request.lines().any(|line| {
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
            head_only,
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
            head_only,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
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
        return Ok(());
    }
    if raw_path == "/__pip/manifest" {
        response(
            &mut stream,
            "200 OK",
            "application/json; charset=utf-8",
            package.manifest(),
            head_only,
            None,
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
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
    Ok(())
}

pub fn serve(package: Package, token: String, open: bool) -> Result<(), String> {
    if !package
        .assets()
        .iter()
        .any(|asset| asset.path == "index.html")
    {
        return Err("PIP package has no index.html asset".into());
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    let address = listener.local_addr().map_err(|error| error.to_string())?;
    let url = format!("http://127.0.0.1:{}/?token={token}", address.port());
    println!("{url}");
    if open {
        crate::platform::open_browser(&url)?;
    }
    let package = Arc::new(package);
    for connection in listener.incoming() {
        match connection {
            Ok(stream) => {
                let package = Arc::clone(&package);
                let token = token.clone();
                std::thread::spawn(move || {
                    if let Err(error) = handle(stream, &package, &token) {
                        eprintln!("request rejected: {error}");
                    }
                });
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }
    Ok(())
}
