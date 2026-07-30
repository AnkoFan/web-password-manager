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

use crate::domain::EntityId;
use crate::security::{
    derive_kek, unwrap_database_key, wrap_database_key, VaultHeader, KDF_ITERATIONS,
    KDF_MEMORY_KIB, KDF_PARALLELISM,
};

pub(crate) const HEADER_FILE: &str = "vault.header.json";
pub(crate) const DATABASE_FILE: &str = "vault.db";
const VAULT_MARKER: &str = "local-vault-v1";
const MAX_HEADER_BYTES: u64 = 64 * 1024;
const PHASE_2_CORE_SCHEMA: &str = include_str!("../migrations/001_phase2_core.sql");
const REMOVE_PROTOTYPE_DATA: &str = include_str!("../migrations/002_remove_prototype_data.sql");
const CURRENT_SCHEMA_VERSION: i64 = 2;
const BACKUPS_DIRECTORY: &str = "backups";
const BACKUP_MANIFEST_FILE: &str = "manifest.json";
const MAX_BACKUP_MANIFEST_BYTES: u64 = 64 * 1024;

pub(crate) struct VaultPaths {
    pub(crate) directory: PathBuf,
    pub(crate) header: PathBuf,
    pub(crate) database: PathBuf,
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
    header_sha256: String,
    database_sha256: String,
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
        .map_err(|_| "无法确定本地保险库目录".to_string())?;
    Ok(VaultPaths {
        header: directory.join(HEADER_FILE),
        database: directory.join(DATABASE_FILE),
        directory,
    })
}

pub(crate) fn load_header(path: &Path) -> Result<VaultHeader, String> {
    let metadata = fs::metadata(path).map_err(|_| "无法读取保险库头信息".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_HEADER_BYTES {
        return Err("保险库头信息大小无效".into());
    }
    let bytes = fs::read(path).map_err(|_| "无法读取保险库头信息".to_string())?;
    let header: VaultHeader =
        serde_json::from_slice(&bytes).map_err(|_| "保险库头信息无效".to_string())?;
    if header.format_version != 1
        || header.kdf != "argon2id"
        || header.memory_kib != KDF_MEMORY_KIB
        || header.iterations != KDF_ITERATIONS
        || header.parallelism != KDF_PARALLELISM
        || header.wrap_algorithm != "xchacha20poly1305"
    {
        return Err("保险库使用了不受支持的安全参数".into());
    }
    Ok(header)
}

pub(crate) fn open_encrypted_database(path: &Path, key: &[u8]) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|_| "无法打开本地保险库".to_string())?;
    let key_hex = Zeroizing::new(hex::encode(key));
    let key_pragma = Zeroizing::new(format!(
        "PRAGMA key = \"x'{}'\";
         PRAGMA foreign_keys = ON;",
        key_hex.as_str()
    ));
    connection
        .execute_batch(key_pragma.as_str())
        .map_err(|_| "无法初始化保险库加密".to_string())?;

    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version;", [], |row| row.get(0))
        .map_err(|_| "当前构建未启用 SQLCipher".to_string())?;
    if cipher_version.trim().is_empty() {
        return Err("当前构建未启用 SQLCipher".into());
    }
    Ok(connection)
}

pub(crate) fn create_schema(connection: &mut Connection) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始保险库初始化".to_string())?;
    transaction
        .execute_batch(
            "CREATE TABLE metadata (
         key TEXT PRIMARY KEY NOT NULL,
         value TEXT NOT NULL
       );",
        )
        .map_err(|_| "无法创建保险库结构".to_string())?;
    transaction
        .execute_batch(PHASE_2_CORE_SCHEMA)
        .map_err(|_| "无法创建第二阶段保险库结构".to_string())?;
    transaction
        .execute_batch(REMOVE_PROTOTYPE_DATA)
        .map_err(|_| "无法清理第一阶段原型结构".to_string())?;
    initialize_vault_meta(&transaction)?;
    transaction
        .execute(
            "INSERT INTO metadata (key, value) VALUES ('vault_marker', ?1)",
            [VAULT_MARKER],
        )
        .map_err(|_| "无法写入保险库标记".to_string())?;

    transaction
        .commit()
        .map_err(|_| "无法提交保险库初始化".to_string())
}

pub(crate) fn verify_database(connection: &Connection) -> Result<(), String> {
    verify_database_envelope(connection)?;
    verify_schema_version(connection)
}

fn verify_database_envelope(connection: &Connection) -> Result<(), String> {
    let mut cipher_check = connection
        .prepare("PRAGMA cipher_integrity_check;")
        .map_err(|_| "无法检查保险库完整性".to_string())?;
    let mut cipher_errors = cipher_check
        .query([])
        .map_err(|_| "保险库完整性检查失败".to_string())?;
    if cipher_errors
        .next()
        .map_err(|_| "保险库完整性检查失败".to_string())?
        .is_some()
    {
        return Err("保险库已损坏".into());
    }
    drop(cipher_errors);
    drop(cipher_check);

    let logical_check: String = connection
        .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
        .map_err(|_| "保险库结构完整性检查失败".to_string())?;
    if logical_check != "ok" {
        return Err("保险库结构已损坏".into());
    }

    let marker: String = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'vault_marker'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "主密码不正确或保险库已损坏".to_string())?;
    if marker != VAULT_MARKER {
        return Err("主密码不正确或保险库已损坏".into());
    }
    Ok(())
}

fn verify_schema_version(connection: &Connection) -> Result<(), String> {
    let user_version: i64 = connection
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|_| "无法读取保险库数据版本".to_string())?;
    let migration_version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "无法读取保险库迁移版本".to_string())?;
    if user_version > CURRENT_SCHEMA_VERSION || migration_version > CURRENT_SCHEMA_VERSION {
        return Err("保险库由更新版本的软件创建，请升级应用后再打开".into());
    }
    if user_version != CURRENT_SCHEMA_VERSION || migration_version != CURRENT_SCHEMA_VERSION {
        return Err("保险库需要迁移，当前版本不能安全写入".into());
    }
    let vault_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))
        .map_err(|_| "无法读取保险库元数据".to_string())?;
    if vault_count != 1 {
        return Err("保险库元数据已损坏".into());
    }
    Ok(())
}

fn migrate_schema(connection: &mut Connection) -> Result<(), String> {
    let user_version: i64 = connection
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|_| "无法读取保险库数据版本".to_string())?;
    if user_version >= CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    let migration_table_exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema
             WHERE type = 'table' AND name = 'schema_migrations'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "无法检查保险库迁移状态".to_string())?;
    if user_version == 0 && migration_table_exists != 0 {
        return Err("保险库版本状态不一致，需要恢复后再打开".into());
    }
    if user_version > 0 && migration_table_exists != 1 {
        return Err("保险库版本状态不一致，需要恢复后再打开".into());
    }

    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始保险库迁移".to_string())?;
    if user_version == 0 {
        transaction
            .execute_batch(PHASE_2_CORE_SCHEMA)
            .map_err(|_| "无法迁移第一阶段保险库".to_string())?;
        initialize_vault_meta(&transaction)?;
    }
    if user_version <= 1 {
        transaction
            .execute_batch(REMOVE_PROTOTYPE_DATA)
            .map_err(|_| "无法清理第一阶段原型数据".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "无法提交保险库迁移".to_string())
}

fn initialize_vault_meta(connection: &Connection) -> Result<(), String> {
    let vault_id = EntityId::new_v4();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效".to_string())
        .and_then(|duration| {
            i64::try_from(duration.as_millis()).map_err(|_| "系统时间无效".to_string())
        })?;
    connection
        .execute(
            "INSERT INTO vault_meta
             (id, display_name, data_model_version, created_at, updated_at)
             VALUES (?1, '我的保险库', 1, ?2, ?2)",
            params![vault_id.as_bytes().as_slice(), now],
        )
        .map_err(|_| "无法初始化保险库元数据".to_string())?;
    Ok(())
}

pub(crate) fn create_vault_files(paths: &VaultPaths, password: &str) -> Result<Connection, String> {
    fs::create_dir_all(&paths.directory).map_err(|_| "无法创建保险库目录".to_string())?;
    if paths.header.exists() || paths.database.exists() {
        return Err("本机已经存在保险库".into());
    }

    let mut salt = [0_u8; 16];
    OsRng.fill_bytes(&mut salt);
    let mut wrap_nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut wrap_nonce);
    let mut database_key = Zeroizing::new(vec![0_u8; 32]);
    OsRng.fill_bytes(database_key.as_mut_slice());

    let mut header = VaultHeader {
        format_version: 1,
        kdf: "argon2id".into(),
        kdf_salt_hex: hex::encode(salt),
        memory_kib: KDF_MEMORY_KIB,
        iterations: KDF_ITERATIONS,
        parallelism: KDF_PARALLELISM,
        wrap_algorithm: "xchacha20poly1305".into(),
        wrap_nonce_hex: hex::encode(wrap_nonce),
        wrapped_dek_hex: String::new(),
    };
    salt.zeroize();
    let kek = derive_kek(password, &header)?;
    let mut wrapped_dek = wrap_database_key(
        kek.as_slice(),
        database_key.as_slice(),
        &header,
        &wrap_nonce,
    )?;
    wrap_nonce.zeroize();
    header.wrapped_dek_hex = hex::encode(&wrapped_dek);
    wrapped_dek.zeroize();

    let temp_database = paths.directory.join("vault.db.creating");
    let temp_header = paths.directory.join("vault.header.json.creating");
    if temp_database.exists() {
        fs::remove_file(&temp_database).map_err(|_| "无法清理未完成的保险库".to_string())?;
    }
    if temp_header.exists() {
        fs::remove_file(&temp_header).map_err(|_| "无法清理未完成的保险库头".to_string())?;
    }

    let mut connection = open_encrypted_database(&temp_database, database_key.as_slice())?;
    create_schema(&mut connection)?;
    drop(connection);

    let header_json =
        serde_json::to_vec_pretty(&header).map_err(|_| "无法生成保险库头信息".to_string())?;
    fs::write(&temp_header, header_json).map_err(|_| "无法写入保险库头信息".to_string())?;
    fs::rename(&temp_database, &paths.database)
        .map_err(|_| "无法完成保险库数据库创建".to_string())?;
    if fs::rename(&temp_header, &paths.header).is_err() {
        let _ = fs::remove_file(&paths.database);
        return Err("无法完成保险库头信息创建".into());
    }

    let connection = open_encrypted_database(&paths.database, database_key.as_slice())?;
    verify_database(&connection)?;
    Ok(connection)
}

pub(crate) fn unlock_vault_files(paths: &VaultPaths, password: &str) -> Result<Connection, String> {
    let header = load_header(&paths.header)?;
    let database_key = unwrap_database_key(password, &header)?;
    let mut connection = open_encrypted_database(&paths.database, database_key.as_slice())?;
    verify_database_envelope(&connection)?;
    migrate_schema(&mut connection)?;
    verify_database(&connection)?;
    Ok(connection)
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
    buffer.fill(0);
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

fn validate_backup_files(
    paths: &VaultPaths,
    backup_id: &str,
) -> Result<(PathBuf, BackupManifest), String> {
    let directory = backup_directory(paths, backup_id)?;
    let manifest = read_backup_manifest(&directory)?;
    if manifest.id != backup_id {
        return Err("备份标识不一致".into());
    }
    let header = directory.join(HEADER_FILE);
    let database = directory.join(DATABASE_FILE);
    if hash_file(&header)? != manifest.header_sha256
        || hash_file(&database)? != manifest.database_sha256
    {
        return Err("备份完整性校验失败".into());
    }
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
        if !entry
            .file_type()
            .map_err(|_| "无法读取备份目录".to_string())?
            .is_dir()
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

pub(crate) fn create_backup(paths: &VaultPaths) -> Result<BackupInfo, String> {
    if !paths.header.exists() || !paths.database.exists() {
        return Err("本地保险库不存在".into());
    }
    let root = backups_directory(paths);
    fs::create_dir_all(&root).map_err(|_| "无法创建备份目录".to_string())?;
    let id = EntityId::new_v4().as_uuid_string();
    let temporary = root.join(format!("{id}.creating"));
    let final_directory = root.join(&id);
    fs::create_dir(&temporary).map_err(|_| "无法创建临时备份".to_string())?;

    let result = (|| {
        let backup_header = temporary.join(HEADER_FILE);
        let backup_database = temporary.join(DATABASE_FILE);
        fs::copy(&paths.header, &backup_header).map_err(|_| "无法复制保险库头信息".to_string())?;
        fs::copy(&paths.database, &backup_database)
            .map_err(|_| "无法复制保险库数据库".to_string())?;
        sync_file(&backup_header, "无法同步备份头信息")?;
        sync_file(&backup_database, "无法同步备份数据库")?;
        let manifest = BackupManifest {
            format_version: 1,
            id: id.clone(),
            created_at: unix_millis()?,
            schema_version: CURRENT_SCHEMA_VERSION,
            header_sha256: hash_file(&backup_header)?,
            database_sha256: hash_file(&backup_database)?,
        };
        let manifest_bytes =
            serde_json::to_vec_pretty(&manifest).map_err(|_| "无法生成备份清单".to_string())?;
        let manifest_path = temporary.join(BACKUP_MANIFEST_FILE);
        fs::write(&manifest_path, manifest_bytes).map_err(|_| "无法写入备份清单".to_string())?;
        sync_file(&manifest_path, "无法同步备份清单")?;
        fs::rename(&temporary, &final_directory).map_err(|_| "无法提交保险库备份".to_string())?;
        Ok(BackupInfo::from(&manifest))
    })();
    if result.is_err() && temporary.exists() {
        let _ = fs::remove_dir_all(&temporary);
    }
    result
}

pub(crate) fn verify_backup(
    paths: &VaultPaths,
    backup_id: &str,
    password: &str,
) -> Result<BackupInfo, String> {
    let (directory, manifest) = validate_backup_files(paths, backup_id)?;
    let backup_paths = VaultPaths {
        header: directory.join(HEADER_FILE),
        database: directory.join(DATABASE_FILE),
        directory,
    };
    let header = load_header(&backup_paths.header)?;
    let database_key = unwrap_database_key(password, &header)?;
    let connection = open_encrypted_database(&backup_paths.database, database_key.as_slice())?;
    verify_database(&connection)?;
    Ok(BackupInfo::from(&manifest))
}

pub(crate) fn restore_backup(
    paths: &VaultPaths,
    backup_id: &str,
    password: &str,
) -> Result<Connection, String> {
    let (backup, _) = validate_backup_files(paths, backup_id)?;
    verify_backup(paths, backup_id, password)?;

    let operation_id = EntityId::new_v4().as_uuid_string();
    let staged_header = paths
        .directory
        .join(format!("vault.header.json.restoring-{operation_id}"));
    let staged_database = paths
        .directory
        .join(format!("vault.db.restoring-{operation_id}"));
    let rollback_header = paths
        .directory
        .join(format!("vault.header.json.rollback-{operation_id}"));
    let rollback_database = paths
        .directory
        .join(format!("vault.db.rollback-{operation_id}"));

    fs::copy(backup.join(HEADER_FILE), &staged_header)
        .map_err(|_| "无法准备恢复头信息".to_string())?;
    fs::copy(backup.join(DATABASE_FILE), &staged_database)
        .map_err(|_| "无法准备恢复数据库".to_string())?;
    let staged_paths = VaultPaths {
        directory: paths.directory.clone(),
        header: staged_header.clone(),
        database: staged_database.clone(),
    };
    let staged_header_data = load_header(&staged_paths.header)?;
    let staged_key = unwrap_database_key(password, &staged_header_data)?;
    let staged_connection = open_encrypted_database(&staged_paths.database, staged_key.as_slice())?;
    verify_database(&staged_connection)?;
    drop(staged_connection);

    fs::copy(&paths.header, &rollback_header).map_err(|_| "无法创建恢复回滚点".to_string())?;
    fs::copy(&paths.database, &rollback_database).map_err(|_| "无法创建恢复回滚点".to_string())?;

    let replace_result = (|| {
        fs::remove_file(&paths.header).map_err(|_| "无法替换保险库头信息".to_string())?;
        fs::remove_file(&paths.database).map_err(|_| "无法替换保险库数据库".to_string())?;
        fs::rename(&staged_header, &paths.header).map_err(|_| "无法提交恢复头信息".to_string())?;
        fs::rename(&staged_database, &paths.database)
            .map_err(|_| "无法提交恢复数据库".to_string())?;
        unlock_vault_files(paths, password)
    })();

    match replace_result {
        Ok(connection) => {
            let _ = fs::remove_file(&rollback_header);
            let _ = fs::remove_file(&rollback_database);
            Ok(connection)
        }
        Err(error) => {
            let _ = fs::remove_file(&paths.header);
            let _ = fs::remove_file(&paths.database);
            let _ = fs::rename(&rollback_header, &paths.header);
            let _ = fs::rename(&rollback_database, &paths.database);
            let _ = fs::remove_file(&staged_header);
            let _ = fs::remove_file(&staged_database);
            Err(error)
        }
    }
}
