#[cfg(windows)]
pub fn random_token() -> Result<String, String> {
    use std::ffi::c_void;
    #[link(name = "bcrypt")]
    unsafe extern "system" {
        fn BCryptGenRandom(algorithm: *mut c_void, buffer: *mut u8, length: u32, flags: u32)
        -> i32;
    }
    let mut bytes = [0u8; 24];
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            0x00000002,
        )
    };
    if status < 0 {
        return Err(format!("BCryptGenRandom failed: {status}"));
    }
    Ok(pip_core::sha256_hex(&bytes))
}

#[cfg(not(windows))]
pub fn random_token() -> Result<String, String> {
    let seed = format!(
        "{}:{}:{:?}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos(),
        std::thread::current().id()
    );
    Ok(pip_core::sha256_hex(seed.as_bytes()))
}

#[cfg(windows)]
pub fn open_browser(url: &str) -> Result<(), String> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "shell32")]
    unsafe extern "system" {
        fn ShellExecuteW(
            hwnd: *mut c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show_command: i32,
        ) -> isize;
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(url)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            std::ptr::null(),
            wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if result <= 32 {
        Err(format!("ShellExecuteW failed: {result}"))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn open_browser(_url: &str) -> Result<(), String> {
    Err("automatic browser launch is only implemented for Windows".into())
}
