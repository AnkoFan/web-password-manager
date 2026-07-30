use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    process::Command,
};

use argon2::{Algorithm, Argon2, AssociatedData, ParamsBuilder, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rusqlite::params;

use crate::{
    security::{
        derive_kek, unwrap_database_key, wrap_database_key, VaultHeader, KDF_ITERATIONS,
        KDF_MEMORY_KIB, KDF_PARALLELISM,
    },
    storage::{
        create_backup, create_schema, create_vault_files, list_backups, load_header,
        open_encrypted_database, restore_backup, unlock_vault_files, verify_backup,
        verify_database, VaultPaths, DATABASE_FILE, HEADER_FILE,
    },
};

const TEST_PASSWORD: &str = "fictional-restart-password";
const RESTART_TEST_MODE: &str = "WPM_RESTART_TEST_MODE";
const RESTART_TEST_DIRECTORY: &str = "WPM_RESTART_TEST_DIRECTORY";

pub(crate) fn test_header() -> VaultHeader {
    VaultHeader {
        format_version: 1,
        kdf: "argon2id".into(),
        kdf_salt_hex: hex::encode([7_u8; 16]),
        memory_kib: KDF_MEMORY_KIB,
        iterations: KDF_ITERATIONS,
        parallelism: KDF_PARALLELISM,
        wrap_algorithm: "xchacha20poly1305".into(),
        wrap_nonce_hex: hex::encode([8_u8; 24]),
        wrapped_dek_hex: String::new(),
    }
}

fn test_paths(directory: &std::path::Path) -> VaultPaths {
    VaultPaths {
        header: directory.join(HEADER_FILE),
        database: directory.join(DATABASE_FILE),
        directory: directory.to_path_buf(),
    }
}

#[test]
fn argon2id_key_is_stable_for_the_same_password_and_salt() {
    let header = test_header();
    let first = derive_kek("a-long-test-password", &header).unwrap();
    let second = derive_kek("a-long-test-password", &header).unwrap();
    let different = derive_kek("a-different-test-password", &header).unwrap();

    assert_eq!(first.as_slice(), second.as_slice());
    assert_ne!(first.as_slice(), different.as_slice());
}

#[test]
fn argon2id_matches_rfc_9106_known_answer() {
    let params = ParamsBuilder::new()
        .m_cost(32)
        .t_cost(3)
        .p_cost(4)
        .data(AssociatedData::new(&[0x04; 12]).unwrap())
        .build()
        .unwrap();
    let argon2 =
        Argon2::new_with_secret(&[0x03; 8], Algorithm::Argon2id, Version::V0x13, params).unwrap();
    let mut output = [0_u8; 32];

    argon2
        .hash_password_into(&[0x01; 32], &[0x02; 16], &mut output)
        .unwrap();

    assert_eq!(
        output.as_slice(),
        hex::decode("0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659").unwrap()
    );
}

#[test]
fn xchacha20poly1305_matches_ietf_draft_known_answer() {
    let key: Vec<u8> = (0x80..=0x9f).collect();
    let nonce: Vec<u8> = (0x40..=0x57).collect();
    let aad = hex::decode("50515253c0c1c2c3c4c5c6c7").unwrap();
    let plaintext = b"Ladies and Gentlemen of the class of '99: \
        If I could offer you only one tip for the future, sunscreen would be it.";
    let expected = hex::decode(concat!(
        "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb",
        "731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452",
        "2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9",
        "21f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780a",
        "cf49"
    ))
    .unwrap();
    let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();

    let encrypted = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .unwrap();

    assert_eq!(encrypted, expected);
}

#[test]
fn wrapped_database_key_requires_the_correct_password() {
    let mut header = test_header();
    let nonce = [8_u8; 24];
    let database_key = [9_u8; 32];
    let kek = derive_kek("a-long-test-password", &header).unwrap();
    header.wrapped_dek_hex =
        hex::encode(wrap_database_key(kek.as_slice(), &database_key, &header, &nonce).unwrap());

    let unwrapped = unwrap_database_key("a-long-test-password", &header).unwrap();
    assert_eq!(unwrapped.as_slice(), database_key);
    assert!(unwrap_database_key("wrong-test-password", &header).is_err());
}

#[test]
fn wrapped_database_key_authenticates_salt_nonce_tag_and_header_aad() {
    let mut header = test_header();
    let nonce = [8_u8; 24];
    let database_key = [9_u8; 32];
    let kek = derive_kek(TEST_PASSWORD, &header).unwrap();
    header.wrapped_dek_hex =
        hex::encode(wrap_database_key(kek.as_slice(), &database_key, &header, &nonce).unwrap());

    let mut changed_salt = header.clone();
    changed_salt.kdf_salt_hex.replace_range(0..2, "00");
    assert!(unwrap_database_key(TEST_PASSWORD, &changed_salt).is_err());

    let mut changed_nonce = header.clone();
    changed_nonce.wrap_nonce_hex.replace_range(0..2, "00");
    assert!(unwrap_database_key(TEST_PASSWORD, &changed_nonce).is_err());

    let mut changed_tag = header.clone();
    let last = changed_tag.wrapped_dek_hex.len() - 2;
    changed_tag.wrapped_dek_hex.replace_range(last.., "00");
    assert!(unwrap_database_key(TEST_PASSWORD, &changed_tag).is_err());

    let mut changed_aad = header;
    changed_aad.wrap_algorithm = "xchacha20poly1305-modified".into();
    assert!(unwrap_database_key(TEST_PASSWORD, &changed_aad).is_err());
}

#[test]
fn sqlcipher_file_is_not_a_plain_sqlite_database() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let mut connection = open_encrypted_database(&database, key.as_slice()).unwrap();
    create_schema(&mut connection).unwrap();
    drop(connection);

    let prefix = fs::read(&database).unwrap();
    assert_ne!(&prefix[..16], b"SQLite format 3\0");
}

#[test]
fn sqlcipher_enhanced_memory_wiping_is_enabled() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let connection = open_encrypted_database(&database, key.as_slice()).unwrap();

    let enabled: String = connection
        .query_row("PRAGMA cipher_memory_security;", [], |row| row.get(0))
        .unwrap();
    assert_eq!(enabled, "1");
    assert!(
        option_env!("LIBSQLITE3_FLAGS")
            .unwrap_or_default()
            .split_whitespace()
            .any(|flag| flag == "-DOMIT_MEMLOCK"),
        "Windows-safe SQLCipher builds must omit OS page locking"
    );
}

#[test]
fn phase_2_core_schema_has_expected_tables_and_version() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let mut connection = open_encrypted_database(&database, key.as_slice()).unwrap();
    create_schema(&mut connection).unwrap();

    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 2);

    for table in [
        "vault_meta",
        "categories",
        "websites",
        "accounts",
        "account_fields",
        "deletion_groups",
        "schema_migrations",
    ] {
        let exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1, "missing table: {table}");
    }
    let vault_rows: i64 = connection
        .query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))
        .unwrap();
    assert_eq!(vault_rows, 1);
    let demo_table: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = 'demo_fields'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(demo_table, 0);
}

#[test]
fn newer_schema_version_is_rejected_before_use() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let mut connection = open_encrypted_database(&database, key.as_slice()).unwrap();
    create_schema(&mut connection).unwrap();
    connection
        .execute_batch("PRAGMA user_version = 3;")
        .unwrap();

    let error = verify_database(&connection).unwrap_err();
    assert!(error.contains("更新版本"));
}

#[test]
fn multiple_vault_metadata_rows_are_rejected_as_corruption() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let mut connection = open_encrypted_database(&database, key.as_slice()).unwrap();
    create_schema(&mut connection).unwrap();
    connection
        .execute(
            "INSERT INTO vault_meta
             (id, display_name, data_model_version, created_at, updated_at)
             VALUES (?1, '异常保险库', 1, 1, 1)",
            [[44_u8; 16].as_slice()],
        )
        .unwrap();

    assert!(verify_database(&connection)
        .unwrap_err()
        .contains("元数据已损坏"));
}

#[test]
fn schema_enforces_foreign_keys_and_sensitive_passwords() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("vault.db");
    let key = derive_kek("a-long-test-password", &test_header()).unwrap();
    let mut connection = open_encrypted_database(&database, key.as_slice()).unwrap();
    create_schema(&mut connection).unwrap();

    let missing_vault = [1_u8; 16];
    let category = [2_u8; 16];
    assert!(connection
        .execute(
            "INSERT INTO categories
             (id, vault_id, name, name_key, sort_order, created_at, updated_at)
             VALUES (?1, ?2, '测试分类', '测试分类', 0, 1, 1)",
            params![category.as_slice(), missing_vault.as_slice()],
        )
        .is_err());

    let vault: Vec<u8> = connection
        .query_row("SELECT id FROM vault_meta LIMIT 1", [], |row| row.get(0))
        .unwrap();
    connection
        .execute(
            "INSERT INTO categories
             (id, vault_id, name, name_key, sort_order, created_at, updated_at)
             VALUES (?1, ?2, '测试分类', '测试分类', 0, 1, 1)",
            params![category.as_slice(), vault.as_slice()],
        )
        .unwrap();
    let website = [4_u8; 16];
    connection
        .execute(
            "INSERT INTO websites
             (id, vault_id, category_id, name, name_key, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, '示例网站', '示例网站', 0, 1, 1)",
            params![website.as_slice(), vault.as_slice(), category.as_slice()],
        )
        .unwrap();
    let account = [5_u8; 16];
    connection
        .execute(
            "INSERT INTO accounts
             (id, vault_id, website_id, display_name, display_name_key, sort_order,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, '私人账号', '私人账号', 0, 1, 1)",
            params![account.as_slice(), vault.as_slice(), website.as_slice()],
        )
        .unwrap();
    let field = [6_u8; 16];
    assert!(connection
        .execute(
            "INSERT INTO account_fields
             (id, account_id, system_role, label, label_key, field_type, value,
              is_sensitive, sort_order, created_at, updated_at)
             VALUES (?1, ?2, 'password', '密码', '密码', 'password',
                     'fictional-secret', 0, 0, 1, 1)",
            params![field.as_slice(), account.as_slice()],
        )
        .is_err());
}

#[test]
fn persisted_vault_rejects_wrong_password_and_unlocks_again() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    let connection = create_vault_files(&paths, TEST_PASSWORD).unwrap();
    verify_database(&connection).unwrap();
    drop(connection);

    assert!(unlock_vault_files(&paths, "wrong-fictional-password").is_err());
    let reopened = unlock_vault_files(&paths, TEST_PASSWORD).unwrap();
    verify_database(&reopened).unwrap();
}

#[test]
fn persisted_vault_unlocks_in_independent_processes() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());

    for mode in ["reject-wrong-password", "unlock-correct-password"] {
        let status = Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("tests::restart_unlock_subprocess_helper")
            .arg("--nocapture")
            .env(RESTART_TEST_MODE, mode)
            .env(RESTART_TEST_DIRECTORY, temp.path())
            .status()
            .unwrap();
        assert!(status.success(), "restart subprocess failed in mode {mode}");
    }
}

#[test]
fn restart_unlock_subprocess_helper() {
    let Ok(mode) = std::env::var(RESTART_TEST_MODE) else {
        return;
    };
    let directory = std::path::PathBuf::from(std::env::var_os(RESTART_TEST_DIRECTORY).unwrap());
    let paths = test_paths(&directory);
    match mode.as_str() {
        "reject-wrong-password" => {
            assert!(unlock_vault_files(&paths, "wrong-fictional-password").is_err());
        }
        "unlock-correct-password" => {
            let connection = unlock_vault_files(&paths, TEST_PASSWORD).unwrap();
            verify_database(&connection).unwrap();
        }
        _ => panic!("unknown restart test mode"),
    }
}

#[test]
fn phase_1_vault_is_migrated_to_schema_version_2() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    let connection = create_vault_files(&paths, TEST_PASSWORD).unwrap();
    connection
        .execute_batch(
            "DROP TABLE account_fields;
             DROP TABLE accounts;
             DROP TABLE websites;
             DROP TABLE categories;
             DROP TABLE deletion_groups;
             DROP TABLE vault_meta;
             DROP TABLE schema_migrations;
             CREATE TABLE demo_fields (
               name TEXT PRIMARY KEY NOT NULL,
               value TEXT NOT NULL
             );
             INSERT INTO demo_fields(name, value) VALUES ('password', 'fictional-secret');
             PRAGMA user_version = 0;",
        )
        .unwrap();
    drop(connection);

    let migrated = unlock_vault_files(&paths, TEST_PASSWORD).unwrap();
    let version: i64 = migrated
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    let vault_rows: i64 = migrated
        .query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))
        .unwrap();
    let demo_table: i64 = migrated
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = 'demo_fields'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 2);
    assert_eq!(vault_rows, 1);
    assert_eq!(demo_table, 0);
}

#[test]
fn schema_version_1_is_migrated_to_version_2_without_prototype_data() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    let connection = create_vault_files(&paths, TEST_PASSWORD).unwrap();
    connection
        .execute_batch(
            "DELETE FROM schema_migrations WHERE version = 2;
             CREATE TABLE demo_fields (
               name TEXT PRIMARY KEY NOT NULL,
               value TEXT NOT NULL
             );
             INSERT INTO demo_fields(name, value) VALUES ('password', 'fictional-secret');
             PRAGMA user_version = 1;",
        )
        .unwrap();
    drop(connection);

    let migrated = unlock_vault_files(&paths, TEST_PASSWORD).unwrap();
    let version: i64 = migrated
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    let demo_table: i64 = migrated
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = 'demo_fields'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 2);
    assert_eq!(demo_table, 0);
}

#[test]
fn unlock_rejects_tampered_database() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());

    let length = fs::metadata(&paths.database).unwrap().len();
    let mut database = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&paths.database)
        .unwrap();
    database.seek(SeekFrom::Start(length / 2)).unwrap();
    let mut original = [0_u8; 1];
    database.read_exact(&mut original).unwrap();
    database.seek(SeekFrom::Start(length / 2)).unwrap();
    database.write_all(&[original[0] ^ 0xFF]).unwrap();
    database.flush().unwrap();
    drop(database);

    assert!(unlock_vault_files(&paths, TEST_PASSWORD).is_err());
}

#[test]
fn unlock_rejects_truncated_database() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());

    let original_length = fs::metadata(&paths.database).unwrap().len();
    fs::OpenOptions::new()
        .write(true)
        .open(&paths.database)
        .unwrap()
        .set_len(original_length - 1)
        .unwrap();

    assert!(unlock_vault_files(&paths, TEST_PASSWORD).is_err());
}

#[test]
fn unlock_rejects_tampered_wrapped_database_key() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());

    let mut header = load_header(&paths.header).unwrap();
    let replacement = if header.wrapped_dek_hex.starts_with('0') {
        "1"
    } else {
        "0"
    };
    header.wrapped_dek_hex.replace_range(0..1, replacement);
    fs::write(&paths.header, serde_json::to_vec_pretty(&header).unwrap()).unwrap();

    assert!(unlock_vault_files(&paths, TEST_PASSWORD).is_err());
}

#[test]
fn unsupported_kdf_parameters_are_rejected_before_derivation() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());

    let mut header = load_header(&paths.header).unwrap();
    header.memory_kib = KDF_MEMORY_KIB.saturating_add(1);
    fs::write(&paths.header, serde_json::to_vec_pretty(&header).unwrap()).unwrap();

    assert!(load_header(&paths.header).is_err());
    assert!(unlock_vault_files(&paths, TEST_PASSWORD).is_err());
}

#[test]
fn mismatched_header_and_database_are_rejected() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    let first_paths = test_paths(first.path());
    let second_paths = test_paths(second.path());
    drop(create_vault_files(&first_paths, TEST_PASSWORD).unwrap());
    drop(create_vault_files(&second_paths, TEST_PASSWORD).unwrap());

    fs::copy(&second_paths.header, &first_paths.header).unwrap();

    assert!(unlock_vault_files(&first_paths, TEST_PASSWORD).is_err());
}

#[test]
fn oversized_header_is_rejected_before_parsing() {
    let temp = tempfile::tempdir().unwrap();
    let header = temp.path().join(HEADER_FILE);
    fs::write(&header, vec![b' '; 64 * 1024 + 1]).unwrap();

    assert!(load_header(&header).is_err());
}

#[test]
fn encrypted_backup_can_be_verified_and_restored() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    let connection = create_vault_files(&paths, TEST_PASSWORD).unwrap();
    connection
        .execute(
            "INSERT INTO categories
             (id, vault_id, name, name_key, sort_order, created_at, updated_at)
             SELECT ?1, id, '备份前', '备份前', 0, 1, 1 FROM vault_meta",
            [[71_u8; 16].as_slice()],
        )
        .unwrap();
    drop(connection);

    let backup = create_backup(&paths).unwrap();
    assert_eq!(list_backups(&paths).unwrap()[0].id, backup.id);
    assert!(verify_backup(&paths, &backup.id, "wrong-fictional-password").is_err());
    verify_backup(&paths, &backup.id, TEST_PASSWORD).unwrap();

    let connection = unlock_vault_files(&paths, TEST_PASSWORD).unwrap();
    connection
        .execute(
            "INSERT INTO categories
             (id, vault_id, name, name_key, sort_order, created_at, updated_at)
             SELECT ?1, id, '备份后', '备份后', 1, 2, 2 FROM vault_meta",
            [[72_u8; 16].as_slice()],
        )
        .unwrap();
    drop(connection);

    let restored = restore_backup(&paths, &backup.id, TEST_PASSWORD).unwrap();
    let names: Vec<String> = restored
        .prepare("SELECT name FROM categories ORDER BY sort_order")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(names, vec!["备份前"]);
}

#[test]
fn corrupt_backup_is_rejected_without_replacing_current_vault() {
    let temp = tempfile::tempdir().unwrap();
    let paths = test_paths(temp.path());
    drop(create_vault_files(&paths, TEST_PASSWORD).unwrap());
    let backup = create_backup(&paths).unwrap();
    let original_header = fs::read(&paths.header).unwrap();
    let original_database = fs::read(&paths.database).unwrap();
    let backup_database = paths
        .directory
        .join("backups")
        .join(&backup.id)
        .join(DATABASE_FILE);
    let mut bytes = fs::read(&backup_database).unwrap();
    let middle = bytes.len() / 2;
    bytes[middle] ^= 0xFF;
    fs::write(backup_database, bytes).unwrap();

    assert!(restore_backup(&paths, &backup.id, TEST_PASSWORD).is_err());
    assert_eq!(fs::read(&paths.header).unwrap(), original_header);
    assert_eq!(fs::read(&paths.database).unwrap(), original_database);
    assert!(unlock_vault_files(&paths, TEST_PASSWORD).is_ok());
}
