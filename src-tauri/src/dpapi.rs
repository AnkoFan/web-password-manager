use std::ptr::{null, null_mut};

use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};
use zeroize::Zeroizing;

const OPTIONAL_ENTROPY: &[u8] = b"WebPasswordManager/DPAPI/database-key/v1";

fn blob(bytes: &[u8]) -> Result<CRYPT_INTEGER_BLOB, String> {
    Ok(CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len()).map_err(|_| "DPAPI 数据过大".to_string())?,
        pbData: bytes.as_ptr().cast_mut(),
    })
}

pub(crate) fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let input = blob(plaintext)?;
    let entropy = blob(OPTIONAL_ENTROPY)?;
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: all input blobs reference live slices for the duration of the call. Windows
    // allocates output with LocalAlloc; it is copied before being released with LocalFree.
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            null(),
            &entropy,
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 || output.pbData.is_null() {
        return Err("Windows 无法保护本地数据库密钥".into());
    }
    // SAFETY: CryptProtectData returned a valid buffer of cbData bytes.
    let protected =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    // SAFETY: the buffer was allocated by CryptProtectData and has not been freed yet.
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(protected)
}

pub(crate) fn unprotect(protected: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    let input = blob(protected)?;
    let entropy = blob(OPTIONAL_ENTROPY)?;
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: input blobs reference live slices; no optional UI or description pointers are used.
    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            &entropy,
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 || output.pbData.is_null() {
        return Err("当前 Windows 用户无法解开本地数据库密钥".into());
    }
    // SAFETY: CryptUnprotectData returned a valid buffer of cbData bytes.
    let plaintext = Zeroizing::new(unsafe {
        std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
    });
    // SAFETY: the DPAPI output buffer is valid for cbData bytes and remains allocated. Volatile
    // writes prevent the plaintext database key from being optimized out before LocalFree.
    unsafe {
        for index in 0..output.cbData as usize {
            output.pbData.add(index).write_volatile(0);
        }
    }
    // SAFETY: the buffer was allocated by CryptUnprotectData and has not been freed yet.
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_user_dpapi_round_trip() {
        let plaintext = Zeroizing::new(b"TEST-ONLY-DPAPI-KEY-MATERIAL-32".to_vec());
        let protected = protect(&plaintext).unwrap();
        assert_ne!(protected, *plaintext);
        assert_eq!(*unprotect(&protected).unwrap(), *plaintext);
    }

    #[test]
    fn modified_dpapi_blob_is_rejected() {
        let mut protected = protect(b"TEST-ONLY-DPAPI-TAMPER").unwrap();
        let last = protected.len() - 1;
        protected[last] ^= 0x80;
        assert!(unprotect(&protected).is_err());
    }
}
