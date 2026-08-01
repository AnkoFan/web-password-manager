use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::domain::EntityId;

pub(crate) const DATABASE_FILE: &str = "password-manager.db";
const DATABASE_MARKER: &str = "plaintext-local-database-v1";
const CORE_SCHEMA: &str = include_str!("../migrations/001_phase2_core.sql");
const REMOVE_PROTOTYPE_DATA: &str = include_str!("../migrations/002_remove_prototype_data.sql");
const CURRENT_SCHEMA_VERSION: i64 = 2;
const BACKUPS_DIRECTORY: &str = "plaintext-backups";
const BACKUP_MANIFEST_FILE: &str = "manifest.json";
const MAX_BACKUP_MANIFEST_BYTES: u64 = 64 * 1024;

pub(crate) struct VaultPaths {
    pub(crate) directory: PathBuf,
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
    database_bytes: u64,
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
        .map_err(|_| "无法确定本地数据目录".to_string())?;
    Ok(VaultPaths {
        database: directory.join(DATABASE_FILE),
        directory,
    })
}

pub(crate) fn open_or_create_database(paths: &VaultPaths) -> Result<Connection, String> {
    fs::create_dir_all(&paths.directory).map_err(|_| "无法创建本地数据目录".to_string())?;
    let is_new = !paths.database.exists();
    let mut connection =
        Connection::open(&paths.database).map_err(|_| "无法打开本地明文数据库".to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|_| "无法启用数据库关系校验".to_string())?;
    if is_new {
        create_schema(&mut connection)?;
    } else {
        verify_database(&connection)?;
    }
    Ok(connection)
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
    let logical_check: String = connection
        .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
        .map_err(|_| "数据库完整性检查失败".to_string())?;
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
    let database = directory.join(DATABASE_FILE);
    if fs::metadata(&database)
        .map_err(|_| "无法读取备份数据库".to_string())?
        .len()
        != manifest.database_bytes
    {
        return Err("备份文件长度校验失败".into());
    }
    if hash_file(&database)? != manifest.database_sha256 {
        return Err("备份完整性校验失败".into());
    }
    let connection = Connection::open(&database).map_err(|_| "无法打开备份数据库".to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|_| "无法验证备份数据库".to_string())?;
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
    if !paths.database.exists() {
        return Err("本地数据库不存在".into());
    }
    let root = backups_directory(paths);
    fs::create_dir_all(&root).map_err(|_| "无法创建备份目录".to_string())?;
    let id = EntityId::new_v4().as_uuid_string();
    let temporary = root.join(format!("{id}.creating"));
    let final_directory = root.join(&id);
    fs::create_dir(&temporary).map_err(|_| "无法创建临时备份".to_string())?;

    let result = (|| {
        let backup_database = temporary.join(DATABASE_FILE);
        let escaped = backup_database.to_string_lossy().replace('\'', "''");
        connection
            .execute_batch(&format!("VACUUM INTO '{escaped}';"))
            .map_err(|_| "无法复制本地数据库".to_string())?;
        sync_file(&backup_database, "无法同步备份数据库")?;
        let manifest = BackupManifest {
            format_version: 1,
            id: id.clone(),
            created_at: unix_millis()?,
            schema_version: CURRENT_SCHEMA_VERSION,
            database_bytes: fs::metadata(&backup_database)
                .map_err(|_| "无法读取备份数据库".to_string())?
                .len(),
            database_sha256: hash_file(&backup_database)?,
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
    let staged = paths
        .directory
        .join(format!("{DATABASE_FILE}.restoring-{operation_id}"));
    let rollback = paths
        .directory
        .join(format!("{DATABASE_FILE}.rollback-{operation_id}"));

    fs::copy(backup.join(DATABASE_FILE), &staged).map_err(|_| "无法准备恢复数据库".to_string())?;
    let staged_connection =
        Connection::open(&staged).map_err(|_| "无法打开待恢复数据库".to_string())?;
    staged_connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|_| "无法验证待恢复数据库".to_string())?;
    verify_database(&staged_connection)?;
    drop(staged_connection);

    fs::rename(&paths.database, &rollback).map_err(|_| "无法创建恢复回滚点".to_string())?;
    let replace_result = fs::rename(&staged, &paths.database)
        .map_err(|_| "无法提交恢复数据库".to_string())
        .and_then(|_| open_or_create_database(paths));
    match replace_result {
        Ok(connection) => {
            let _ = fs::remove_file(&rollback);
            Ok(connection)
        }
        Err(error) => {
            let _ = fs::remove_file(&paths.database);
            let _ = fs::rename(&rollback, &paths.database);
            let _ = fs::remove_file(&staged);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plaintext_database_has_a_sqlite_header_and_round_trips() {
        let directory = tempfile::tempdir().unwrap();
        let paths = VaultPaths {
            directory: directory.path().to_path_buf(),
            database: directory.path().join(DATABASE_FILE),
        };
        let connection = open_or_create_database(&paths).unwrap();
        verify_database(&connection).unwrap();
        drop(connection);

        assert_eq!(
            &fs::read(&paths.database).unwrap()[..16],
            b"SQLite format 3\0"
        );
        open_or_create_database(&paths).unwrap();
    }

    #[test]
    fn backup_hash_is_verified_before_restore() {
        let directory = tempfile::tempdir().unwrap();
        let paths = VaultPaths {
            directory: directory.path().to_path_buf(),
            database: directory.path().join(DATABASE_FILE),
        };
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
    fn backup_restore_replaces_the_active_plaintext_database() {
        let directory = tempfile::tempdir().unwrap();
        let paths = VaultPaths {
            directory: directory.path().to_path_buf(),
            database: directory.path().join(DATABASE_FILE),
        };
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
