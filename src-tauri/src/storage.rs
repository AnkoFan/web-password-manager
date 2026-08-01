use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use zeroize::{Zeroize, Zeroizing};

use crate::{domain::EntityId, dpapi};

pub(crate) const DATABASE_FILE: &str = "password-manager.dpapi.db";
pub(crate) const KEY_FILE: &str = "password-manager.dpapi-key";
const KEY_FILE_MAGIC: &[u8; 8] = b"WPMDPK01";
const DATABASE_KEY_BYTES: usize = 32;
const DATABASE_MARKER: &str = "dpapi-sqlcipher-database-v1";
const CORE_SCHEMA: &str = include_str!("../migrations/001_phase2_core.sql");
const REMOVE_PROTOTYPE_DATA: &str = include_str!("../migrations/002_remove_prototype_data.sql");
const CURRENT_SCHEMA_VERSION: i64 = 2;
const BACKUPS_DIRECTORY: &str = "dpapi-backups";
const BACKUP_MANIFEST_FILE: &str = "manifest.json";
const MAX_KEY_FILE_BYTES: u64 = 64 * 1024;
const MAX_BACKUP_MANIFEST_BYTES: u64 = 64 * 1024;

pub(crate) struct VaultPaths {
    pub(crate) directory: PathBuf,
    pub(crate) database: PathBuf,
    pub(crate) key: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupInfo {
    pub(crate) id: String,
    pub(crate) created_at: i64,
    pub(crate) schema_version: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    id: String,
    created_at: i64,
    schema_version: i64,
    database_bytes: u64,
    database_sha256: String,
    key_bytes: u64,
    key_sha256: String,
}

impl From<&BackupManifest> for BackupInfo {
    fn from(value: &BackupManifest) -> Self {
        Self {
            id: value.id.clone(),
            created_at: value.created_at,
            schema_version: value.schema_version,
        }
    }
}

pub(crate) fn vault_paths(app: &AppHandle) -> Result<VaultPaths, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "无法确定本地数据目录".to_string())?;
    Ok(VaultPaths {
        database: directory.join(DATABASE_FILE),
        key: directory.join(KEY_FILE),
        directory,
    })
}

fn encode_key_file(protected: &[u8]) -> Result<Vec<u8>, String> {
    let length = u32::try_from(protected.len()).map_err(|_| "DPAPI 密钥文件过大".to_string())?;
    let mut encoded = Vec::with_capacity(12 + protected.len());
    encoded.extend_from_slice(KEY_FILE_MAGIC);
    encoded.extend_from_slice(&length.to_le_bytes());
    encoded.extend_from_slice(protected);
    Ok(encoded)
}

fn read_database_key(path: &Path) -> Result<Zeroizing<Vec<u8>>, String> {
    let metadata = fs::metadata(path).map_err(|_| "DPAPI 密钥文件不存在".to_string())?;
    if metadata.len() < 13 || metadata.len() > MAX_KEY_FILE_BYTES {
        return Err("DPAPI 密钥文件大小无效".into());
    }
    let encoded = fs::read(path).map_err(|_| "无法读取 DPAPI 密钥文件".to_string())?;
    if encoded.get(..8) != Some(KEY_FILE_MAGIC) {
        return Err("DPAPI 密钥文件格式无效".into());
    }
    let length = u32::from_le_bytes(
        encoded[8..12]
            .try_into()
            .map_err(|_| "DPAPI 密钥文件格式无效".to_string())?,
    ) as usize;
    if length == 0 || encoded.len() != 12 + length {
        return Err("DPAPI 密钥文件长度无效".into());
    }
    let key = dpapi::unprotect(&encoded[12..])?;
    if key.len() != DATABASE_KEY_BYTES {
        return Err("DPAPI 数据库密钥长度无效".into());
    }
    Ok(key)
}

fn open_encrypted_database(path: &Path, key: &[u8]) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|_| "无法打开本地加密数据库".to_string())?;
    let key_hex = Zeroizing::new(hex::encode(key));
    let key_pragma = Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", key_hex.as_str()));
    connection
        .execute_batch(key_pragma.as_str())
        .map_err(|_| "无法初始化数据库加密".to_string())?;
    connection
        .execute_batch(
            "PRAGMA cipher_memory_security = ON;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|_| "无法初始化数据库安全设置".to_string())?;
    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version;", [], |row| row.get(0))
        .map_err(|_| "当前构建未启用 SQLCipher".to_string())?;
    if cipher_version.trim().is_empty() {
        return Err("当前构建未启用 SQLCipher".into());
    }
    let memory_security: String = connection
        .query_row("PRAGMA cipher_memory_security;", [], |row| row.get(0))
        .map_err(|_| "无法验证 SQLCipher 内存擦除".to_string())?;
    if memory_security != "1" {
        return Err("SQLCipher 内存擦除未启用".into());
    }
    Ok(connection)
}

pub(crate) fn open_or_create_database(paths: &VaultPaths) -> Result<Connection, String> {
    fs::create_dir_all(&paths.directory).map_err(|_| "无法创建本地数据目录".to_string())?;
    match (paths.database.exists(), paths.key.exists()) {
        (true, true) => {
            let key = read_database_key(&paths.key)?;
            let connection = open_encrypted_database(&paths.database, &key)?;
            verify_database(&connection)?;
            Ok(connection)
        }
        (false, false) => create_database(paths),
        _ => Err("检测到不完整的 DPAPI 加密数据库，请保留原文件并从备份恢复".into()),
    }
}

fn create_database(paths: &VaultPaths) -> Result<Connection, String> {
    let operation_id = EntityId::new_v4().as_uuid_string();
    let temporary_database = paths
        .directory
        .join(format!("{DATABASE_FILE}.creating-{operation_id}"));
    let temporary_key = paths
        .directory
        .join(format!("{KEY_FILE}.creating-{operation_id}"));
    let mut key = Zeroizing::new(vec![0_u8; DATABASE_KEY_BYTES]);
    OsRng.fill_bytes(&mut key);
    let protected = dpapi::protect(&key)?;
    let encoded_key = encode_key_file(&protected)?;

    let result = (|| {
        fs::write(&temporary_key, encoded_key)
            .map_err(|_| "无法写入 DPAPI 密钥文件".to_string())?;
        sync_file(&temporary_key, "无法同步 DPAPI 密钥文件")?;
        let mut connection = open_encrypted_database(&temporary_database, &key)?;
        create_schema(&mut connection)?;
        verify_database(&connection)?;
        drop(connection);
        sync_file(&temporary_database, "无法同步加密数据库")?;
        fs::rename(&temporary_database, &paths.database)
            .map_err(|_| "无法提交加密数据库".to_string())?;
        if let Err(error) = fs::rename(&temporary_key, &paths.key) {
            let _ = fs::remove_file(&paths.database);
            return Err(format!("无法提交 DPAPI 密钥文件：{error}"));
        }
        open_encrypted_database(&paths.database, &key).and_then(|connection| {
            verify_database(&connection)?;
            Ok(connection)
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_database);
        let _ = fs::remove_file(&temporary_key);
    }
    result
}

pub(crate) fn create_schema(connection: &mut Connection) -> Result<(), String> {
    let vault_id = EntityId::new_v4();
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始数据库初始化".to_string())?;
    transaction
        .execute_batch(
            "CREATE TABLE metadata (
               key TEXT PRIMARY KEY NOT NULL,
               value TEXT NOT NULL
             );",
        )
        .map_err(|_| "无法创建数据库结构".to_string())?;
    transaction
        .execute_batch(CORE_SCHEMA)
        .map_err(|_| "无法创建账号数据结构".to_string())?;
    transaction
        .execute_batch(REMOVE_PROTOTYPE_DATA)
        .map_err(|_| "无法完成数据库初始化".to_string())?;
    initialize_vault_meta(&transaction, &vault_id)?;
    transaction
        .execute(
            "INSERT INTO metadata (key, value) VALUES ('database_marker', ?1)",
            [DATABASE_MARKER],
        )
        .map_err(|_| "无法写入数据库标记".to_string())?;
    transaction
        .commit()
        .map_err(|_| "无法提交数据库初始化".to_string())
}

fn initialize_vault_meta(connection: &Connection, vault_id: &EntityId) -> Result<(), String> {
    let now = unix_millis()?;
    connection
        .execute(
            "INSERT INTO vault_meta
             (id, display_name, data_model_version, created_at, updated_at)
             VALUES (?1, '我的账号库', 1, ?2, ?2)",
            params![vault_id.as_bytes().as_slice(), now],
        )
        .map_err(|_| "无法初始化账号库元数据".to_string())?;
    Ok(())
}

pub(crate) fn verify_database(connection: &Connection) -> Result<(), String> {
    let mut cipher_statement = connection
        .prepare("PRAGMA cipher_integrity_check;")
        .map_err(|_| "无法开始数据库密文完整性检查".to_string())?;
    let cipher_errors = cipher_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "数据库密文完整性检查失败".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "数据库密文完整性检查失败".to_string())?;
    if !cipher_errors.is_empty() {
        return Err("加密数据库已经损坏".into());
    }
    let logical_check: String = connection
        .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
        .map_err(|_| "数据库逻辑完整性检查失败".to_string())?;
    if logical_check != "ok" {
        return Err("本地数据库已经损坏".into());
    }
    let marker: String = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'database_marker'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "无法确认本地数据库格式".to_string())?;
    if marker != DATABASE_MARKER {
        return Err("本地数据库格式不受支持".into());
    }
    let user_version: i64 = connection
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|_| "无法读取数据库版本".to_string())?;
    let migration_version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "无法读取数据库迁移版本".to_string())?;
    if user_version != CURRENT_SCHEMA_VERSION || migration_version != CURRENT_SCHEMA_VERSION {
        return Err("本地数据库版本不受支持，请升级应用".into());
    }
    let vault_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))
        .map_err(|_| "无法读取账号库元数据".to_string())?;
    if vault_count != 1 {
        return Err("账号库元数据已经损坏".into());
    }
    Ok(())
}

fn unix_millis() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效".to_string())
        .and_then(|duration| {
            i64::try_from(duration.as_millis()).map_err(|_| "系统时间无效".to_string())
        })
}

fn backups_directory(paths: &VaultPaths) -> PathBuf {
    paths.directory.join(BACKUPS_DIRECTORY)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|_| "无法读取备份文件".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "无法读取备份文件".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    buffer.zeroize();
    Ok(hex::encode(hasher.finalize()))
}

fn sync_file(path: &Path, message: &'static str) -> Result<(), String> {
    fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|_| message.to_string())
}

fn read_backup_manifest(directory: &Path) -> Result<BackupManifest, String> {
    let path = directory.join(BACKUP_MANIFEST_FILE);
    let metadata = fs::metadata(&path).map_err(|_| "备份清单不存在".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_BACKUP_MANIFEST_BYTES {
        return Err("备份清单大小无效".into());
    }
    let manifest: BackupManifest =
        serde_json::from_slice(&fs::read(path).map_err(|_| "无法读取备份清单".to_string())?)
            .map_err(|_| "备份清单无效".to_string())?;
    if manifest.format_version != 1 || manifest.schema_version != CURRENT_SCHEMA_VERSION {
        return Err("备份版本不受支持".into());
    }
    EntityId::parse(&manifest.id).map_err(|_| "备份标识无效".to_string())?;
    Ok(manifest)
}

fn backup_directory(paths: &VaultPaths, backup_id: &str) -> Result<PathBuf, String> {
    let id = EntityId::parse(backup_id).map_err(|_| "备份标识无效".to_string())?;
    Ok(backups_directory(paths).join(id.as_uuid_string()))
}

fn validate_file(path: &Path, expected_bytes: u64, expected_hash: &str) -> Result<(), String> {
    if fs::metadata(path)
        .map_err(|_| "备份文件不存在".to_string())?
        .len()
        != expected_bytes
    {
        return Err("备份文件长度校验失败".into());
    }
    if hash_file(path)? != expected_hash {
        return Err("备份完整性校验失败".into());
    }
    Ok(())
}

fn validate_backup_files(
    paths: &VaultPaths,
    backup_id: &str,
) -> Result<(PathBuf, BackupManifest), String> {
    let directory = backup_directory(paths, backup_id)?;
    let manifest = read_backup_manifest(&directory)?;
    if manifest.id != backup_id {
        return Err("备份标识不一致".into());
    }
    let database = directory.join(DATABASE_FILE);
    let key_file = directory.join(KEY_FILE);
    validate_file(
        &database,
        manifest.database_bytes,
        &manifest.database_sha256,
    )?;
    validate_file(&key_file, manifest.key_bytes, &manifest.key_sha256)?;
    let key = read_database_key(&key_file)?;
    let connection = open_encrypted_database(&database, &key)?;
    verify_database(&connection)?;
    Ok((directory, manifest))
}

pub(crate) fn list_backups(paths: &VaultPaths) -> Result<Vec<BackupInfo>, String> {
    let root = backups_directory(paths);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(root).map_err(|_| "无法读取备份目录".to_string())? {
        let entry = entry.map_err(|_| "无法读取备份目录".to_string())?;
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            || entry.file_name().to_string_lossy().ends_with(".creating")
        {
            continue;
        }
        let manifest = read_backup_manifest(&entry.path())?;
        if entry.file_name().to_string_lossy() != manifest.id {
            return Err("备份目录标识不一致".into());
        }
        backups.push(BackupInfo::from(&manifest));
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

pub(crate) fn create_backup(
    paths: &VaultPaths,
    connection: &Connection,
) -> Result<BackupInfo, String> {
    if !paths.database.exists() || !paths.key.exists() {
        return Err("DPAPI 加密数据库不完整".into());
    }
    let root = backups_directory(paths);
    fs::create_dir_all(&root).map_err(|_| "无法创建备份目录".to_string())?;
    let id = EntityId::new_v4().as_uuid_string();
    let temporary = root.join(format!("{id}.creating"));
    let final_directory = root.join(&id);
    fs::create_dir(&temporary).map_err(|_| "无法创建临时备份".to_string())?;

    let result = (|| {
        let backup_database = temporary.join(DATABASE_FILE);
        let key = read_database_key(&paths.key)?;
        let key_hex = Zeroizing::new(hex::encode(&key));
        let escaped = backup_database.to_string_lossy().replace('\'', "''");
        let attach = Zeroizing::new(format!(
            "ATTACH DATABASE '{escaped}' AS backup KEY \"x'{}'\";",
            key_hex.as_str()
        ));
        connection
            .execute_batch(attach.as_str())
            .map_err(|_| "无法创建加密备份数据库".to_string())?;
        let export_result = connection
            .query_row("SELECT sqlcipher_export('backup');", [], |_| Ok(()))
            .map_err(|_| "无法导出加密备份数据库".to_string());
        let detach_result = connection
            .execute_batch("PRAGMA backup.user_version = 2; DETACH DATABASE backup;")
            .map_err(|_| "无法完成加密备份数据库".to_string());
        export_result?;
        detach_result?;
        sync_file(&backup_database, "无法同步加密备份数据库")?;
        let backup_key = temporary.join(KEY_FILE);
        fs::copy(&paths.key, &backup_key).map_err(|_| "无法复制 DPAPI 密钥文件".to_string())?;
        sync_file(&backup_key, "无法同步 DPAPI 密钥文件")?;
        let manifest = BackupManifest {
            format_version: 1,
            id: id.clone(),
            created_at: unix_millis()?,
            schema_version: CURRENT_SCHEMA_VERSION,
            database_bytes: fs::metadata(&backup_database)
                .map_err(|_| "无法读取备份数据库".to_string())?
                .len(),
            database_sha256: hash_file(&backup_database)?,
            key_bytes: fs::metadata(&backup_key)
                .map_err(|_| "无法读取备份密钥文件".to_string())?
                .len(),
            key_sha256: hash_file(&backup_key)?,
        };
        let manifest_bytes =
            serde_json::to_vec_pretty(&manifest).map_err(|_| "无法生成备份清单".to_string())?;
        let manifest_path = temporary.join(BACKUP_MANIFEST_FILE);
        fs::write(&manifest_path, manifest_bytes).map_err(|_| "无法写入备份清单".to_string())?;
        sync_file(&manifest_path, "无法同步备份清单")?;
        fs::rename(&temporary, &final_directory).map_err(|_| "无法提交数据库备份".to_string())?;
        Ok(BackupInfo::from(&manifest))
    })();
    if result.is_err() && temporary.exists() {
        let _ = fs::remove_dir_all(&temporary);
    }
    result
}

pub(crate) fn verify_backup(paths: &VaultPaths, backup_id: &str) -> Result<BackupInfo, String> {
    let (_, manifest) = validate_backup_files(paths, backup_id)?;
    Ok(BackupInfo::from(&manifest))
}

pub(crate) fn restore_backup(paths: &VaultPaths, backup_id: &str) -> Result<Connection, String> {
    let (backup, _) = validate_backup_files(paths, backup_id)?;
    let operation_id = EntityId::new_v4().as_uuid_string();
    let staged_database = paths
        .directory
        .join(format!("{DATABASE_FILE}.restoring-{operation_id}"));
    let staged_key = paths
        .directory
        .join(format!("{KEY_FILE}.restoring-{operation_id}"));
    let rollback_database = paths
        .directory
        .join(format!("{DATABASE_FILE}.rollback-{operation_id}"));
    let rollback_key = paths
        .directory
        .join(format!("{KEY_FILE}.rollback-{operation_id}"));

    fs::copy(backup.join(DATABASE_FILE), &staged_database)
        .map_err(|_| "无法准备恢复数据库".to_string())?;
    fs::copy(backup.join(KEY_FILE), &staged_key).map_err(|_| "无法准备恢复密钥文件".to_string())?;
    let staged_database_key = read_database_key(&staged_key)?;
    let staged_connection = open_encrypted_database(&staged_database, &staged_database_key)?;
    verify_database(&staged_connection)?;
    drop(staged_connection);

    fs::rename(&paths.database, &rollback_database)
        .map_err(|_| "无法创建数据库恢复回滚点".to_string())?;
    if let Err(error) = fs::rename(&paths.key, &rollback_key) {
        let _ = fs::rename(&rollback_database, &paths.database);
        return Err(format!("无法创建密钥恢复回滚点：{error}"));
    }
    let replace_result = fs::rename(&staged_database, &paths.database)
        .map_err(|_| "无法提交恢复数据库".to_string())
        .and_then(|_| {
            fs::rename(&staged_key, &paths.key).map_err(|_| "无法提交恢复密钥文件".to_string())
        })
        .and_then(|_| open_or_create_database(paths));
    match replace_result {
        Ok(connection) => {
            let _ = fs::remove_file(&rollback_database);
            let _ = fs::remove_file(&rollback_key);
            Ok(connection)
        }
        Err(error) => {
            let _ = fs::remove_file(&paths.database);
            let _ = fs::remove_file(&paths.key);
            let _ = fs::rename(&rollback_database, &paths.database);
            let _ = fs::rename(&rollback_key, &paths.key);
            let _ = fs::remove_file(&staged_database);
            let _ = fs::remove_file(&staged_key);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(directory: &tempfile::TempDir) -> VaultPaths {
        VaultPaths {
            directory: directory.path().to_path_buf(),
            database: directory.path().join(DATABASE_FILE),
            key: directory.path().join(KEY_FILE),
        }
    }

    #[test]
    fn dpapi_sqlcipher_database_has_no_plaintext_header_and_round_trips() {
        let directory = tempfile::tempdir().unwrap();
        let paths = paths(&directory);
        let connection = open_or_create_database(&paths).unwrap();
        verify_database(&connection).unwrap();
        drop(connection);

        assert_ne!(
            &fs::read(&paths.database).unwrap()[..16],
            b"SQLite format 3\0"
        );
        open_or_create_database(&paths).unwrap();
    }

    #[test]
    fn incomplete_database_pair_is_rejected_without_overwrite() {
        let directory = tempfile::tempdir().unwrap();
        let paths = paths(&directory);
        fs::write(&paths.database, b"TEST-ONLY-INCOMPLETE").unwrap();
        assert!(open_or_create_database(&paths).is_err());
        assert_eq!(fs::read(&paths.database).unwrap(), b"TEST-ONLY-INCOMPLETE");
        assert!(!paths.key.exists());
    }

    #[test]
    fn backup_hash_is_verified_before_restore() {
        let directory = tempfile::tempdir().unwrap();
        let paths = paths(&directory);
        let connection = open_or_create_database(&paths).unwrap();
        let backup = create_backup(&paths, &connection).unwrap();
        verify_backup(&paths, &backup.id).unwrap();

        let backup_database = backup_directory(&paths, &backup.id)
            .unwrap()
            .join(DATABASE_FILE);
        fs::write(backup_database, b"TEST ONLY CORRUPTION").unwrap();
        assert!(verify_backup(&paths, &backup.id).is_err());
    }

    #[test]
    fn backup_restore_replaces_the_active_encrypted_database() {
        let directory = tempfile::tempdir().unwrap();
        let paths = paths(&directory);
        let connection = open_or_create_database(&paths).unwrap();
        connection
            .execute(
                "UPDATE vault_meta SET display_name = 'TEST-ONLY BACKUP'",
                [],
            )
            .unwrap();
        let backup = create_backup(&paths, &connection).unwrap();
        connection
            .execute(
                "UPDATE vault_meta SET display_name = 'TEST-ONLY CURRENT'",
                [],
            )
            .unwrap();
        drop(connection);

        let restored = restore_backup(&paths, &backup.id).unwrap();
        let display_name: String = restored
            .query_row("SELECT display_name FROM vault_meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(display_name, "TEST-ONLY BACKUP");
    }
}
