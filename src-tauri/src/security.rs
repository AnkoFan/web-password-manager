use argon2::{Algorithm, Argon2, Block, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub(crate) const KDF_MEMORY_KIB: u32 = 64 * 1024;
pub(crate) const KDF_ITERATIONS: u32 = 3;
pub(crate) const KDF_PARALLELISM: u32 = 1;
pub(crate) const KDF_OUTPUT_LENGTH: u32 = 32;
pub(crate) const ARGON2_VERSION: u32 = 19;
pub(crate) const VAULT_HEADER_MAGIC: &str = "WPMVAULT";

const MIN_KDF_MEMORY_KIB: u32 = 64 * 1024;
const MAX_KDF_MEMORY_KIB: u32 = 256 * 1024;
const MIN_KDF_ITERATIONS: u32 = 3;
const MAX_KDF_ITERATIONS: u32 = 10;
const MIN_KDF_PARALLELISM: u32 = 1;
const MAX_KDF_PARALLELISM: u32 = 4;
const V2_AAD_DOMAIN: &[u8] = b"WPM-VH2-AAD\0";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VaultKdfV2 {
    pub(crate) algorithm: String,
    pub(crate) version: u32,
    pub(crate) salt_hex: String,
    pub(crate) memory_kib: u32,
    pub(crate) iterations: u32,
    pub(crate) parallelism: u32,
    pub(crate) output_length: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VaultKeyWrapV2 {
    pub(crate) algorithm: String,
    pub(crate) nonce_hex: String,
    pub(crate) wrapped_dek_hex: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VaultHeaderV2 {
    pub(crate) magic: String,
    pub(crate) format_version: u32,
    pub(crate) vault_id: String,
    pub(crate) kdf: VaultKdfV2,
    pub(crate) key_wrap: VaultKeyWrapV2,
}

#[derive(Clone, Serialize)]
#[serde(untagged)]
pub(crate) enum StoredVaultHeader {
    V1(VaultHeader),
    V2(VaultHeaderV2),
}

impl StoredVaultHeader {
    pub(crate) fn format_version(&self) -> u32 {
        match self {
            Self::V1(header) => header.format_version,
            Self::V2(header) => header.format_version,
        }
    }

    pub(crate) fn vault_id(&self) -> Option<&str> {
        match self {
            Self::V1(_) => None,
            Self::V2(header) => Some(&header.vault_id),
        }
    }
}

fn decode_lower_hex(
    value: &str,
    expected_bytes: usize,
    message: &'static str,
) -> Result<Vec<u8>, String> {
    if value.len() != expected_bytes * 2
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(message.into());
    }
    hex::decode(value).map_err(|_| message.to_string())
}

fn derive_argon2(
    password: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let params = Params::new(
        memory_kib,
        iterations,
        parallelism,
        Some(KDF_OUTPUT_LENGTH as usize),
    )
    .map_err(|_| "主密码安全参数无效".to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut memory = allocate_argon2_memory(argon2.params().block_count())?;
    let mut key = Zeroizing::new(vec![0_u8; KDF_OUTPUT_LENGTH as usize]);
    argon2
        .hash_password_into_with_memory(
            password.as_bytes(),
            salt,
            key.as_mut_slice(),
            memory.as_mut_slice(),
        )
        .map_err(|_| "无法派生保险库密钥".to_string())?;
    Ok(key)
}

fn allocate_argon2_memory(block_count: usize) -> Result<Zeroizing<Vec<Block>>, String> {
    let mut blocks = Vec::new();
    blocks
        .try_reserve_exact(block_count)
        .map_err(|_| "可用内存不足，无法安全派生保险库密钥".to_string())?;
    blocks.resize(block_count, Block::default());
    Ok(Zeroizing::new(blocks))
}

#[cfg(test)]
mod allocation_tests {
    use super::*;

    #[test]
    fn impossible_argon2_allocation_returns_a_controlled_error() {
        let error = allocate_argon2_memory(usize::MAX)
            .err()
            .expect("an impossible allocation must be rejected");
        assert_eq!(error, "可用内存不足，无法安全派生保险库密钥");
    }
}

pub(crate) fn derive_kek(
    password: &str,
    header: &VaultHeader,
) -> Result<Zeroizing<Vec<u8>>, String> {
    if header.format_version != 1
        || header.kdf != "argon2id"
        || header.memory_kib != KDF_MEMORY_KIB
        || header.iterations != KDF_ITERATIONS
        || header.parallelism != KDF_PARALLELISM
        || header.wrap_algorithm != "xchacha20poly1305"
    {
        return Err("保险库使用了不受支持的安全参数".into());
    }
    let salt = decode_lower_hex(&header.kdf_salt_hex, 16, "保险库盐值无效")?;
    derive_argon2(
        password,
        &salt,
        header.memory_kib,
        header.iterations,
        header.parallelism,
    )
}

fn header_v1_aad(header: &VaultHeader) -> Vec<u8> {
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

#[cfg(test)]
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
                aad: &header_v1_aad(header),
            },
        )
        .map_err(|_| "无法包装保险库数据密钥".to_string())
}

pub(crate) fn unwrap_database_key(
    password: &str,
    header: &VaultHeader,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let kek = derive_kek(password, header)?;
    let nonce = decode_lower_hex(&header.wrap_nonce_hex, 24, "保险库包装 nonce 无效")?;
    let wrapped = decode_lower_hex(&header.wrapped_dek_hex, 48, "保险库包装密钥无效")?;
    let cipher = XChaCha20Poly1305::new_from_slice(kek.as_slice())
        .map_err(|_| "无法初始化密钥解包算法".to_string())?;
    let database_key = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &wrapped,
                aad: &header_v1_aad(header),
            },
        )
        .map_err(|_| "主密码不正确或保险库头已损坏".to_string())?;
    if database_key.len() != KDF_OUTPUT_LENGTH as usize {
        return Err("保险库数据密钥长度无效".into());
    }
    Ok(Zeroizing::new(database_key))
}

fn validate_v2_kdf(kdf: &VaultKdfV2) -> Result<Vec<u8>, String> {
    if kdf.algorithm != "argon2id"
        || kdf.version != ARGON2_VERSION
        || kdf.output_length != KDF_OUTPUT_LENGTH
        || !(MIN_KDF_MEMORY_KIB..=MAX_KDF_MEMORY_KIB).contains(&kdf.memory_kib)
        || !(MIN_KDF_ITERATIONS..=MAX_KDF_ITERATIONS).contains(&kdf.iterations)
        || !(MIN_KDF_PARALLELISM..=MAX_KDF_PARALLELISM).contains(&kdf.parallelism)
    {
        return Err("保险库使用了不受支持的安全参数".into());
    }
    if kdf.memory_kib != KDF_MEMORY_KIB
        || kdf.iterations != KDF_ITERATIONS
        || kdf.parallelism != KDF_PARALLELISM
    {
        return Err("保险库使用了未知的主密码安全配置".into());
    }
    decode_lower_hex(&kdf.salt_hex, 16, "保险库盐值无效")
}

fn canonical_uuid_bytes(value: &str) -> Result<[u8; 16], String> {
    let parsed = uuid::Uuid::parse_str(value).map_err(|_| "保险库标识无效".to_string())?;
    if parsed.hyphenated().to_string() != value {
        return Err("保险库标识无效".into());
    }
    Ok(*parsed.as_bytes())
}

pub(crate) fn validate_v2_header(header: &VaultHeaderV2) -> Result<(), String> {
    if header.magic != VAULT_HEADER_MAGIC || header.format_version != 2 {
        return Err("保险库使用了不受支持的安全头格式".into());
    }
    canonical_uuid_bytes(&header.vault_id)?;
    validate_v2_kdf(&header.kdf)?;
    if header.key_wrap.algorithm != "xchacha20poly1305" {
        return Err("保险库使用了不受支持的密钥包装算法".into());
    }
    decode_lower_hex(&header.key_wrap.nonce_hex, 24, "保险库包装 nonce 无效")?;
    if !header.key_wrap.wrapped_dek_hex.is_empty() {
        decode_lower_hex(&header.key_wrap.wrapped_dek_hex, 48, "保险库包装密钥无效")?;
    }
    Ok(())
}

pub(crate) fn validate_v2_stored_header(header: &VaultHeaderV2) -> Result<(), String> {
    validate_v2_header(header)?;
    decode_lower_hex(&header.key_wrap.wrapped_dek_hex, 48, "保险库包装密钥无效")?;
    Ok(())
}

pub(crate) fn header_v2_aad(header: &VaultHeaderV2) -> Result<Vec<u8>, String> {
    validate_v2_header(header)?;
    let vault_id = canonical_uuid_bytes(&header.vault_id)?;
    let salt = decode_lower_hex(&header.kdf.salt_hex, 16, "保险库盐值无效")?;
    let nonce = decode_lower_hex(&header.key_wrap.nonce_hex, 24, "保险库包装 nonce 无效")?;
    let mut aad = Vec::with_capacity(101);
    aad.extend_from_slice(V2_AAD_DOMAIN);
    aad.extend_from_slice(&header.format_version.to_be_bytes());
    aad.extend_from_slice(VAULT_HEADER_MAGIC.as_bytes());
    aad.extend_from_slice(&vault_id);
    aad.push(0x01);
    aad.extend_from_slice(&header.kdf.version.to_be_bytes());
    aad.extend_from_slice(&salt);
    aad.extend_from_slice(&header.kdf.memory_kib.to_be_bytes());
    aad.extend_from_slice(&header.kdf.iterations.to_be_bytes());
    aad.extend_from_slice(&header.kdf.parallelism.to_be_bytes());
    aad.extend_from_slice(&header.kdf.output_length.to_be_bytes());
    aad.push(0x01);
    aad.extend_from_slice(&nonce);
    Ok(aad)
}

pub(crate) fn derive_kek_v2(
    password: &str,
    header: &VaultHeaderV2,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let salt = validate_v2_kdf(&header.kdf)?;
    derive_argon2(
        password,
        &salt,
        header.kdf.memory_kib,
        header.kdf.iterations,
        header.kdf.parallelism,
    )
}

pub(crate) fn wrap_database_key_v2(
    kek: &[u8],
    database_key: &[u8],
    header: &VaultHeaderV2,
) -> Result<Vec<u8>, String> {
    let nonce = decode_lower_hex(&header.key_wrap.nonce_hex, 24, "保险库包装 nonce 无效")?;
    let aad = header_v2_aad(header)?;
    let cipher =
        XChaCha20Poly1305::new_from_slice(kek).map_err(|_| "无法初始化密钥包装算法".to_string())?;
    cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: database_key,
                aad: &aad,
            },
        )
        .map_err(|_| "无法包装保险库数据密钥".to_string())
}

pub(crate) fn unwrap_database_key_v2(
    password: &str,
    header: &VaultHeaderV2,
) -> Result<Zeroizing<Vec<u8>>, String> {
    validate_v2_stored_header(header)?;
    let kek = derive_kek_v2(password, header)?;
    let nonce = decode_lower_hex(&header.key_wrap.nonce_hex, 24, "保险库包装 nonce 无效")?;
    let wrapped = decode_lower_hex(&header.key_wrap.wrapped_dek_hex, 48, "保险库包装密钥无效")?;
    let aad = header_v2_aad(header)?;
    let cipher = XChaCha20Poly1305::new_from_slice(kek.as_slice())
        .map_err(|_| "无法初始化密钥解包算法".to_string())?;
    let database_key = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &wrapped,
                aad: &aad,
            },
        )
        .map_err(|_| "主密码不正确或保险库头已损坏".to_string())?;
    if database_key.len() != KDF_OUTPUT_LENGTH as usize {
        return Err("保险库数据密钥长度无效".into());
    }
    Ok(Zeroizing::new(database_key))
}

pub(crate) fn unwrap_stored_database_key(
    password: &str,
    header: &StoredVaultHeader,
) -> Result<Zeroizing<Vec<u8>>, String> {
    match header {
        StoredVaultHeader::V1(header) => unwrap_database_key(password, header),
        StoredVaultHeader::V2(header) => unwrap_database_key_v2(password, header),
    }
}
