use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub(crate) const KDF_MEMORY_KIB: u32 = 64 * 1024;
pub(crate) const KDF_ITERATIONS: u32 = 3;
pub(crate) const KDF_PARALLELISM: u32 = 1;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultHeader {
    pub(crate) format_version: u32,
    pub(crate) kdf: String,
    pub(crate) kdf_salt_hex: String,
    pub(crate) memory_kib: u32,
    pub(crate) iterations: u32,
    pub(crate) parallelism: u32,
    pub(crate) wrap_algorithm: String,
    pub(crate) wrap_nonce_hex: String,
    pub(crate) wrapped_dek_hex: String,
}

pub(crate) fn derive_kek(
    password: &str,
    header: &VaultHeader,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let salt = hex::decode(&header.kdf_salt_hex).map_err(|_| "保险库盐值无效".to_string())?;
    let params = Params::new(
        header.memory_kib,
        header.iterations,
        header.parallelism,
        Some(32),
    )
    .map_err(|_| "主密码安全参数无效".to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new(vec![0_u8; 32]);
    argon2
        .hash_password_into(password.as_bytes(), &salt, key.as_mut_slice())
        .map_err(|_| "无法派生保险库密钥".to_string())?;
    Ok(key)
}

fn header_aad(header: &VaultHeader) -> Vec<u8> {
    format!(
        "local-vault|{}|{}|{}|{}|{}|{}|{}",
        header.format_version,
        header.kdf,
        header.kdf_salt_hex,
        header.memory_kib,
        header.iterations,
        header.parallelism,
        header.wrap_algorithm
    )
    .into_bytes()
}

pub(crate) fn wrap_database_key(
    kek: &[u8],
    database_key: &[u8],
    header: &VaultHeader,
    nonce: &[u8; 24],
) -> Result<Vec<u8>, String> {
    let cipher =
        XChaCha20Poly1305::new_from_slice(kek).map_err(|_| "无法初始化密钥包装算法".to_string())?;
    cipher
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: database_key,
                aad: &header_aad(header),
            },
        )
        .map_err(|_| "无法包装保险库数据密钥".to_string())
}

pub(crate) fn unwrap_database_key(
    password: &str,
    header: &VaultHeader,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let kek = derive_kek(password, header)?;
    let nonce =
        hex::decode(&header.wrap_nonce_hex).map_err(|_| "保险库包装 nonce 无效".to_string())?;
    let wrapped =
        hex::decode(&header.wrapped_dek_hex).map_err(|_| "保险库包装密钥无效".to_string())?;
    if nonce.len() != 24 {
        return Err("保险库包装 nonce 无效".into());
    }
    let cipher = XChaCha20Poly1305::new_from_slice(kek.as_slice())
        .map_err(|_| "无法初始化密钥解包算法".to_string())?;
    let database_key = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &wrapped,
                aad: &header_aad(header),
            },
        )
        .map_err(|_| "主密码不正确或保险库头已损坏".to_string())?;
    if database_key.len() != 32 {
        return Err("保险库数据密钥长度无效".into());
    }
    Ok(Zeroizing::new(database_key))
}
