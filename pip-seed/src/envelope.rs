use crate::sha256;
use std::fs;
use std::path::Path;

pub const FOOTER_SIZE: usize = 64;
const FOOTER_MAGIC: &[u8; 8] = b"PIPEXE\0\0";

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, String> {
    Ok(u32::from_le_bytes(
        bytes
            .get(offset..offset + 4)
            .ok_or("truncated footer")?
            .try_into()
            .map_err(|_| "invalid footer")?,
    ))
}

fn u64_at(bytes: &[u8], offset: usize) -> Result<u64, String> {
    Ok(u64::from_le_bytes(
        bytes
            .get(offset..offset + 8)
            .ok_or("truncated footer")?
            .try_into()
            .map_err(|_| "invalid footer")?,
    ))
}

pub fn extract_from_bytes(executable: &[u8]) -> Result<Vec<u8>, String> {
    if executable.len() < FOOTER_SIZE {
        return Err("executable has no PIP envelope".into());
    }
    let footer = &executable[executable.len() - FOOTER_SIZE..];
    if footer.get(..8) != Some(FOOTER_MAGIC)
        || u32_at(footer, 8)? != 1
        || u32_at(footer, 12)? as usize != FOOTER_SIZE
    {
        return Err("invalid PIP executable footer".into());
    }
    let offset = usize::try_from(u64_at(footer, 16)?).map_err(|_| "payload offset overflow")?;
    let length = usize::try_from(u64_at(footer, 24)?).map_err(|_| "payload length overflow")?;
    let end = offset
        .checked_add(length)
        .ok_or("payload offset overflow")?;
    if end != executable.len() - FOOTER_SIZE {
        return Err("PIP executable payload bounds are invalid".into());
    }
    let payload = executable
        .get(offset..end)
        .ok_or("PIP payload is truncated")?;
    if sha256::digest(payload) != footer[32..64] {
        return Err("PIP executable payload hash mismatch".into());
    }
    Ok(payload.to_vec())
}

pub fn extract_from_file(path: &Path) -> Result<Vec<u8>, String> {
    extract_from_bytes(&fs::read(path).map_err(|error| format!("cannot read executable: {error}"))?)
}

#[cfg(test)]
mod tests {
    use super::{FOOTER_MAGIC, FOOTER_SIZE, extract_from_bytes};
    use crate::sha256;

    #[test]
    fn extracts_overlay() {
        let seed = b"MZ-test-seed";
        let payload = b"PIP-test-payload";
        let mut executable = Vec::from(seed);
        executable.extend_from_slice(payload);
        let mut footer = [0u8; FOOTER_SIZE];
        footer[..8].copy_from_slice(FOOTER_MAGIC);
        footer[8..12].copy_from_slice(&1u32.to_le_bytes());
        footer[12..16].copy_from_slice(&(FOOTER_SIZE as u32).to_le_bytes());
        footer[16..24].copy_from_slice(&(seed.len() as u64).to_le_bytes());
        footer[24..32].copy_from_slice(&(payload.len() as u64).to_le_bytes());
        footer[32..].copy_from_slice(&sha256::digest(payload));
        executable.extend_from_slice(&footer);
        assert_eq!(extract_from_bytes(&executable).unwrap(), payload);
    }
}
