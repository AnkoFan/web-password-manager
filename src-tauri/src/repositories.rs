use std::{
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, ErrorCode};

use crate::domain::{Category, DomainError, EntityId, ValidatedName};

mod vault_repository;
pub(crate) use vault_repository::VaultRepository;

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum RepositoryError {
    Domain(DomainError),
    CategoryAlreadyExists,
    CategoryNotFound,
    WebsiteNotFound,
    AccountAlreadyExists,
    AccountNotFound,
    FieldNotFound,
    DeletionGroupNotFound,
    ParentUnavailable,
    InvalidInput,
    CorruptData,
    StorageUnavailable,
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Domain(error) => error.fmt(formatter),
            Self::CategoryAlreadyExists => formatter.write_str("该分类名称已经存在"),
            Self::CategoryNotFound => formatter.write_str("分类不存在"),
            Self::WebsiteNotFound => formatter.write_str("网站不存在"),
            Self::AccountAlreadyExists => formatter.write_str("该账号名称已经存在"),
            Self::AccountNotFound => formatter.write_str("账号不存在"),
            Self::FieldNotFound => formatter.write_str("字段不存在"),
            Self::DeletionGroupNotFound => formatter.write_str("删除记录不存在"),
            Self::ParentUnavailable => formatter.write_str("所属对象不存在或已删除"),
            Self::InvalidInput => formatter.write_str("输入数据无效"),
            Self::CorruptData => formatter.write_str("保险库分类数据无效"),
            Self::StorageUnavailable => formatter.write_str("无法访问保险库数据"),
        }
    }
}

impl From<DomainError> for RepositoryError {
    fn from(value: DomainError) -> Self {
        Self::Domain(value)
    }
}

pub(crate) struct CategoryRepository<'connection> {
    connection: &'connection mut Connection,
}

impl<'connection> CategoryRepository<'connection> {
    pub(crate) fn new(connection: &'connection mut Connection) -> Self {
        Self { connection }
    }

    pub(crate) fn create(&mut self, name: &str) -> Result<Category, RepositoryError> {
        let name = ValidatedName::category(name)?;
        let transaction = self
            .connection
            .transaction()
            .map_err(|_| RepositoryError::StorageUnavailable)?;
        let vault_id = load_vault_id(&transaction)?;
        let sort_order: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sort_order) + 1, 0)
                 FROM categories
                 WHERE vault_id = ?1 AND deleted_at IS NULL",
                [vault_id.as_bytes().as_slice()],
                |row| row.get(0),
            )
            .map_err(|_| RepositoryError::StorageUnavailable)?;
        let id = EntityId::new_v4();
        let now = unix_time_millis()?;

        let insert = transaction.execute(
            "INSERT INTO categories
             (id, vault_id, name, name_key, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                id.as_bytes().as_slice(),
                vault_id.as_bytes().as_slice(),
                name.display(),
                name.comparison_key(),
                sort_order,
                now,
            ],
        );
        match insert {
            Ok(_) => {}
            Err(error) if is_constraint_violation(&error) => {
                return Err(RepositoryError::CategoryAlreadyExists);
            }
            Err(_) => return Err(RepositoryError::StorageUnavailable),
        }
        transaction
            .commit()
            .map_err(|_| RepositoryError::StorageUnavailable)?;

        Ok(Category {
            id,
            vault_id,
            name: name.display().to_string(),
            sort_order,
            created_at: now,
            updated_at: now,
        })
    }

    pub(crate) fn list_active(&self) -> Result<Vec<Category>, RepositoryError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, vault_id, name, sort_order, created_at, updated_at
                 FROM categories
                 WHERE deleted_at IS NULL
                 ORDER BY name_key, id",
            )
            .map_err(|_| RepositoryError::StorageUnavailable)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(|_| RepositoryError::StorageUnavailable)?;

        rows.map(|row| {
            let (id, vault_id, name, sort_order, created_at, updated_at) =
                row.map_err(|_| RepositoryError::StorageUnavailable)?;
            Ok(Category {
                id: EntityId::from_slice(&id).map_err(|_| RepositoryError::CorruptData)?,
                vault_id: EntityId::from_slice(&vault_id)
                    .map_err(|_| RepositoryError::CorruptData)?,
                name,
                sort_order,
                created_at,
                updated_at,
            })
        })
        .collect()
    }

    pub(crate) fn rename(
        &mut self,
        category_id: EntityId,
        new_name: &str,
    ) -> Result<(), RepositoryError> {
        let name = ValidatedName::category(new_name)?;
        let now = unix_time_millis()?;
        let update = self.connection.execute(
            "UPDATE categories
             SET name = ?1, name_key = ?2, updated_at = ?3
             WHERE id = ?4 AND deleted_at IS NULL",
            params![
                name.display(),
                name.comparison_key(),
                now,
                category_id.as_bytes().as_slice(),
            ],
        );
        match update {
            Ok(0) => Err(RepositoryError::CategoryNotFound),
            Ok(_) => Ok(()),
            Err(error) if is_constraint_violation(&error) => {
                Err(RepositoryError::CategoryAlreadyExists)
            }
            Err(_) => Err(RepositoryError::StorageUnavailable),
        }
    }
}

pub(super) fn load_vault_id(connection: &Connection) -> Result<EntityId, RepositoryError> {
    let (count, id) = connection
        .query_row("SELECT COUNT(*), MIN(id) FROM vault_meta", [], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<Vec<u8>>>(1)?))
        })
        .map_err(|_| RepositoryError::CorruptData)?;
    if count != 1 {
        return Err(RepositoryError::CorruptData);
    }
    let id = id.ok_or(RepositoryError::CorruptData)?;
    EntityId::from_slice(&id).map_err(|_| RepositoryError::CorruptData)
}

pub(super) fn unix_time_millis() -> Result<i64, RepositoryError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| RepositoryError::StorageUnavailable)?;
    i64::try_from(duration.as_millis()).map_err(|_| RepositoryError::StorageUnavailable)
}

pub(super) fn is_constraint_violation(error: &rusqlite::Error) -> bool {
    matches!(
        error.sqlite_error_code(),
        Some(ErrorCode::ConstraintViolation)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::create_schema;

    fn test_connection() -> (tempfile::TempDir, Connection) {
        let temp = tempfile::tempdir().unwrap();
        let mut connection = Connection::open(temp.path().join("password-manager.db")).unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        create_schema(&mut connection).unwrap();
        (temp, connection)
    }

    #[test]
    fn category_create_list_and_rename_preserve_identity() {
        let (_temp, mut connection) = test_connection();
        let mut repository = CategoryRepository::new(&mut connection);
        let created = repository.create("  工作  ").unwrap();
        repository.rename(created.id, "私人").unwrap();

        let categories = repository.list_active().unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].id, created.id);
        assert_eq!(categories[0].name, "私人");
    }

    #[test]
    fn category_names_are_unique_after_unicode_normalization() {
        let (_temp, mut connection) = test_connection();
        let mut repository = CategoryRepository::new(&mut connection);
        repository.create("Work").unwrap();

        assert_eq!(
            repository.create("  ＷＯＲＫ  ").unwrap_err(),
            RepositoryError::CategoryAlreadyExists
        );
    }

    #[test]
    fn rename_rejects_a_normalized_duplicate_name() {
        let (_temp, mut connection) = test_connection();
        let mut repository = CategoryRepository::new(&mut connection);
        repository.create("Work").unwrap();
        let personal = repository.create("Personal").unwrap();

        let error = repository.rename(personal.id, "  ＷＯＲＫ  ").unwrap_err();
        assert_eq!(error, RepositoryError::CategoryAlreadyExists);
    }

    #[test]
    fn categories_are_listed_by_normalized_name_instead_of_creation_order() {
        let (_temp, mut connection) = test_connection();
        let mut repository = CategoryRepository::new(&mut connection);
        repository.create("Zulu").unwrap();
        repository.create("Alpha").unwrap();

        let names: Vec<_> = repository
            .list_active()
            .unwrap()
            .into_iter()
            .map(|category| category.name)
            .collect();
        assert_eq!(names, vec!["Alpha", "Zulu"]);
    }
}
