use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use super::{is_constraint_violation, load_vault_id, unix_time_millis, RepositoryError};
use crate::domain::{
    normalize_for_comparison, validate_field_set, validate_optional_url, AccountDetail,
    AccountField, AccountSummary, EntityId, FieldDraft, FieldType, SearchResult, SystemRole,
    TrashItem, ValidatedName, Website,
};

pub(crate) struct VaultRepository<'connection> {
    connection: &'connection mut Connection,
}

impl<'connection> VaultRepository<'connection> {
    pub(crate) fn new(connection: &'connection mut Connection) -> Self {
        Self { connection }
    }

    pub(crate) fn list_websites(
        &self,
        category_id: Option<EntityId>,
    ) -> Result<Vec<Website>, RepositoryError> {
        let category = category_id.map(|id| id.as_bytes().to_vec());
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, category_id, name, primary_url, sort_order
                 FROM websites
                 WHERE deleted_at IS NULL
                   AND (?1 IS NULL OR category_id = ?1)
                 ORDER BY name_key, id",
            )
            .map_err(storage_error)?;
        let rows = statement
            .query_map(params![category], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(storage_error)?;
        rows.map(|row| {
            let (id, category_id, name, primary_url, sort_order) = row.map_err(storage_error)?;
            Ok(Website {
                id: entity_id(&id)?,
                category_id: entity_id(&category_id)?,
                name,
                primary_url,
                sort_order,
            })
        })
        .collect()
    }

    pub(crate) fn save_website(
        &mut self,
        website_id: Option<EntityId>,
        category_id: EntityId,
        name: &str,
        primary_url: Option<&str>,
    ) -> Result<Website, RepositoryError> {
        let name = ValidatedName::website(name)?;
        let primary_url = validate_optional_url(primary_url)?;
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let vault_id = load_vault_id(&transaction)?;
        require_active_category(&transaction, category_id, vault_id)?;
        let now = unix_time_millis()?;

        let (id, sort_order) = if let Some(id) = website_id {
            let sort_order = transaction
                .query_row(
                    "SELECT sort_order FROM websites
                     WHERE id = ?1 AND deleted_at IS NULL",
                    [id.as_bytes().as_slice()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(storage_error)?
                .ok_or(RepositoryError::WebsiteNotFound)?;
            let updated = transaction
                .execute(
                    "UPDATE websites
                     SET category_id = ?1, vault_id = ?2, name = ?3, name_key = ?4,
                         primary_url = ?5, updated_at = ?6
                     WHERE id = ?7 AND deleted_at IS NULL",
                    params![
                        category_id.as_bytes().as_slice(),
                        vault_id.as_bytes().as_slice(),
                        name.display(),
                        name.comparison_key(),
                        primary_url,
                        now,
                        id.as_bytes().as_slice(),
                    ],
                )
                .map_err(constraint_or_storage)?;
            if updated == 0 {
                return Err(RepositoryError::WebsiteNotFound);
            }
            (id, sort_order)
        } else {
            let id = EntityId::new_v4();
            let sort_order = next_sort_order(&transaction, "websites", "category_id", category_id)?;
            transaction
                .execute(
                    "INSERT INTO websites
                     (id, vault_id, category_id, name, name_key, primary_url,
                      sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                    params![
                        id.as_bytes().as_slice(),
                        vault_id.as_bytes().as_slice(),
                        category_id.as_bytes().as_slice(),
                        name.display(),
                        name.comparison_key(),
                        primary_url,
                        sort_order,
                        now,
                    ],
                )
                .map_err(constraint_or_storage)?;
            (id, sort_order)
        };
        transaction.commit().map_err(storage_error)?;
        Ok(Website {
            id,
            category_id,
            name: name.display().to_string(),
            primary_url,
            sort_order,
        })
    }

    pub(crate) fn list_accounts(
        &self,
        website_id: EntityId,
    ) -> Result<Vec<AccountSummary>, RepositoryError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT a.id, a.website_id, a.display_name, a.sort_order,
                        COALESCE(
                          (SELECT f.value FROM account_fields f
                           WHERE f.account_id = a.id AND f.system_role = 'username'
                             AND f.is_sensitive = 0 LIMIT 1),
                          (SELECT f.value FROM account_fields f
                           WHERE f.account_id = a.id AND f.system_role = 'email'
                             AND f.is_sensitive = 0 LIMIT 1)
                        )
                 FROM accounts a
                 JOIN websites w ON w.id = a.website_id AND w.deleted_at IS NULL
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE a.website_id = ?1 AND a.deleted_at IS NULL
                 ORDER BY a.display_name_key, a.id",
            )
            .map_err(storage_error)?;
        let rows = statement
            .query_map([website_id.as_bytes().as_slice()], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(storage_error)?;
        rows.map(|row| {
            let (id, website_id, display_name, sort_order, summary) = row.map_err(storage_error)?;
            Ok(AccountSummary {
                id: entity_id(&id)?,
                website_id: entity_id(&website_id)?,
                display_name,
                summary,
                sort_order,
            })
        })
        .collect()
    }

    pub(crate) fn get_account(
        &self,
        account_id: EntityId,
    ) -> Result<AccountDetail, RepositoryError> {
        let (website_id, display_name) = self
            .connection
            .query_row(
                "SELECT a.website_id, a.display_name
                 FROM accounts a
                 JOIN websites w ON w.id = a.website_id AND w.deleted_at IS NULL
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE a.id = ?1 AND a.deleted_at IS NULL",
                [account_id.as_bytes().as_slice()],
                |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(storage_error)?
            .ok_or(RepositoryError::AccountNotFound)?;

        let mut statement = self
            .connection
            .prepare(
                "SELECT id, system_role, label, field_type,
                        CASE WHEN is_sensitive = 0 THEN value ELSE NULL END,
                        is_sensitive, sort_order
                 FROM account_fields
                 WHERE account_id = ?1
                 ORDER BY sort_order, id",
            )
            .map_err(storage_error)?;
        let fields = statement
            .query_map([account_id.as_bytes().as_slice()], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, bool>(5)?,
                    row.get::<_, i64>(6)?,
                ))
            })
            .map_err(storage_error)?
            .map(|row| {
                let (id, role, label, field_type, value, is_sensitive, sort_order) =
                    row.map_err(storage_error)?;
                Ok(AccountField {
                    id: entity_id(&id)?,
                    system_role: SystemRole::parse_optional(role.as_deref())?,
                    label,
                    field_type: FieldType::parse(&field_type)?,
                    value,
                    is_sensitive,
                    sort_order,
                })
            })
            .collect::<Result<Vec<_>, RepositoryError>>()?;

        Ok(AccountDetail {
            id: account_id,
            website_id: entity_id(&website_id)?,
            display_name,
            fields,
        })
    }

    pub(crate) fn save_account(
        &mut self,
        account_id: Option<EntityId>,
        website_id: EntityId,
        display_name: &str,
        fields: Vec<FieldDraft>,
    ) -> Result<AccountDetail, RepositoryError> {
        let display_name = ValidatedName::account(display_name)?;
        validate_field_set(&fields)?;
        let mut provided_ids = HashSet::new();
        if fields
            .iter()
            .filter_map(|field| field.id)
            .any(|id| !provided_ids.insert(id))
        {
            return Err(RepositoryError::InvalidInput);
        }

        let transaction = self.connection.transaction().map_err(storage_error)?;
        let vault_id = load_vault_id(&transaction)?;
        require_active_website(&transaction, website_id, vault_id)?;
        let now = unix_time_millis()?;

        let account_id = if let Some(id) = account_id {
            let updated = transaction.execute(
                "UPDATE accounts
                 SET website_id = ?1, vault_id = ?2, display_name = ?3,
                     display_name_key = ?4, updated_at = ?5
                 WHERE id = ?6 AND deleted_at IS NULL",
                params![
                    website_id.as_bytes().as_slice(),
                    vault_id.as_bytes().as_slice(),
                    display_name.display(),
                    display_name.comparison_key(),
                    now,
                    id.as_bytes().as_slice(),
                ],
            );
            match updated {
                Ok(0) => return Err(RepositoryError::AccountNotFound),
                Ok(_) => {}
                Err(error) if is_constraint_violation(&error) => {
                    return Err(RepositoryError::AccountAlreadyExists);
                }
                Err(_) => return Err(RepositoryError::StorageUnavailable),
            }
            id
        } else {
            let id = EntityId::new_v4();
            let sort_order = next_sort_order(&transaction, "accounts", "website_id", website_id)?;
            let inserted = transaction.execute(
                "INSERT INTO accounts
                 (id, vault_id, website_id, display_name, display_name_key,
                  sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![
                    id.as_bytes().as_slice(),
                    vault_id.as_bytes().as_slice(),
                    website_id.as_bytes().as_slice(),
                    display_name.display(),
                    display_name.comparison_key(),
                    sort_order,
                    now,
                ],
            );
            match inserted {
                Ok(_) => id,
                Err(error) if is_constraint_violation(&error) => {
                    return Err(RepositoryError::AccountAlreadyExists);
                }
                Err(_) => return Err(RepositoryError::StorageUnavailable),
            }
        };

        let existing_ids = load_field_ids(&transaction, account_id)?;
        for existing_id in existing_ids.difference(&provided_ids) {
            transaction
                .execute(
                    "DELETE FROM account_fields WHERE id = ?1 AND account_id = ?2",
                    params![
                        existing_id.as_bytes().as_slice(),
                        account_id.as_bytes().as_slice()
                    ],
                )
                .map_err(storage_error)?;
        }

        for (sort_order, field) in fields.into_iter().enumerate() {
            let id = field.id.unwrap_or_else(EntityId::new_v4);
            if existing_ids.contains(&id) {
                if field.keep_existing_value {
                    transaction
                        .execute(
                            "UPDATE account_fields
                             SET system_role = ?1, label = ?2, label_key = ?3,
                                 field_type = ?4, is_sensitive = ?5,
                                 sort_order = ?6, updated_at = ?7
                             WHERE id = ?8 AND account_id = ?9",
                            params![
                                field.system_role.map(SystemRole::as_str),
                                field.label.display(),
                                field.label.comparison_key(),
                                field.field_type.as_str(),
                                field.is_sensitive,
                                sort_order as i64,
                                now,
                                id.as_bytes().as_slice(),
                                account_id.as_bytes().as_slice(),
                            ],
                        )
                        .map_err(constraint_or_storage)?;
                } else {
                    transaction
                        .execute(
                            "UPDATE account_fields
                             SET system_role = ?1, label = ?2, label_key = ?3,
                                 field_type = ?4, value = ?5, is_sensitive = ?6,
                                 sort_order = ?7, updated_at = ?8
                             WHERE id = ?9 AND account_id = ?10",
                            params![
                                field.system_role.map(SystemRole::as_str),
                                field.label.display(),
                                field.label.comparison_key(),
                                field.field_type.as_str(),
                                field.value.expect("validated field value"),
                                field.is_sensitive,
                                sort_order as i64,
                                now,
                                id.as_bytes().as_slice(),
                                account_id.as_bytes().as_slice(),
                            ],
                        )
                        .map_err(constraint_or_storage)?;
                }
            } else {
                transaction
                    .execute(
                        "INSERT INTO account_fields
                         (id, account_id, system_role, label, label_key, field_type,
                          value, is_sensitive, sort_order, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                        params![
                            id.as_bytes().as_slice(),
                            account_id.as_bytes().as_slice(),
                            field.system_role.map(SystemRole::as_str),
                            field.label.display(),
                            field.label.comparison_key(),
                            field.field_type.as_str(),
                            field.value.expect("validated field value"),
                            field.is_sensitive,
                            sort_order as i64,
                            now,
                        ],
                    )
                    .map_err(constraint_or_storage)?;
            }
        }
        transaction.commit().map_err(storage_error)?;
        self.get_account(account_id)
    }

    pub(crate) fn soft_delete_category(
        &mut self,
        category_id: EntityId,
    ) -> Result<(), RepositoryError> {
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let group_id = begin_deletion(&transaction, "category", category_id)?;
        let now = unix_time_millis()?;
        transaction
            .execute(
                "UPDATE accounts SET deleted_at = ?1, deletion_group_id = ?2, updated_at = ?1
                 WHERE deleted_at IS NULL AND website_id IN
                   (SELECT id FROM websites WHERE category_id = ?3 AND deleted_at IS NULL)",
                params![
                    now,
                    group_id.as_bytes().as_slice(),
                    category_id.as_bytes().as_slice()
                ],
            )
            .map_err(storage_error)?;
        transaction
            .execute(
                "UPDATE websites SET deleted_at = ?1, deletion_group_id = ?2, updated_at = ?1
                 WHERE category_id = ?3 AND deleted_at IS NULL",
                params![
                    now,
                    group_id.as_bytes().as_slice(),
                    category_id.as_bytes().as_slice()
                ],
            )
            .map_err(storage_error)?;
        finish_root_deletion(&transaction, "categories", category_id, group_id, now)?;
        transaction.commit().map_err(storage_error)
    }

    pub(crate) fn soft_delete_website(
        &mut self,
        website_id: EntityId,
    ) -> Result<(), RepositoryError> {
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let group_id = begin_deletion(&transaction, "website", website_id)?;
        let now = unix_time_millis()?;
        transaction
            .execute(
                "UPDATE accounts SET deleted_at = ?1, deletion_group_id = ?2, updated_at = ?1
                 WHERE website_id = ?3 AND deleted_at IS NULL",
                params![
                    now,
                    group_id.as_bytes().as_slice(),
                    website_id.as_bytes().as_slice()
                ],
            )
            .map_err(storage_error)?;
        finish_root_deletion(&transaction, "websites", website_id, group_id, now)?;
        transaction.commit().map_err(storage_error)
    }

    pub(crate) fn soft_delete_account(
        &mut self,
        account_id: EntityId,
    ) -> Result<(), RepositoryError> {
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let group_id = begin_deletion(&transaction, "account", account_id)?;
        let now = unix_time_millis()?;
        finish_root_deletion(&transaction, "accounts", account_id, group_id, now)?;
        transaction.commit().map_err(storage_error)
    }

    pub(crate) fn list_trash(&self) -> Result<Vec<TrashItem>, RepositoryError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT d.id, d.root_entity_type, d.deleted_at,
                        CASE d.root_entity_type
                          WHEN 'category' THEN (SELECT name FROM categories WHERE id = d.root_entity_id)
                          WHEN 'website' THEN (SELECT name FROM websites WHERE id = d.root_entity_id)
                          WHEN 'account' THEN (SELECT display_name FROM accounts WHERE id = d.root_entity_id)
                        END
                 FROM deletion_groups d
                 ORDER BY d.deleted_at DESC, d.id",
            )
            .map_err(storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(storage_error)?;
        rows.map(|row| {
            let (group_id, entity_type, deleted_at, entity_name) = row.map_err(storage_error)?;
            Ok(TrashItem {
                group_id: entity_id(&group_id)?,
                entity_type,
                entity_name: entity_name.unwrap_or_else(|| "已删除项目".into()),
                deleted_at,
            })
        })
        .collect()
    }

    pub(crate) fn restore_deletion_group(
        &mut self,
        group_id: EntityId,
    ) -> Result<(), RepositoryError> {
        self.restore_deletion_groups(&[group_id])
    }

    pub(crate) fn restore_deletion_groups(
        &mut self,
        group_ids: &[EntityId],
    ) -> Result<(), RepositoryError> {
        let group_ids = unique_group_ids(group_ids)?;
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let mut groups = Vec::with_capacity(group_ids.len());
        for group_id in group_ids {
            groups.push(load_deletion_group(&transaction, group_id)?);
        }
        groups.sort_by_key(|(_, entity_type, _)| match entity_type.as_str() {
            "category" => 0,
            "website" => 1,
            "account" => 2,
            _ => 3,
        });
        for (group_id, entity_type, root_id) in groups {
            restore_one_group(&transaction, group_id, &entity_type, root_id)?;
        }
        transaction.commit().map_err(storage_error)
    }

    pub(crate) fn permanently_delete_groups(
        &mut self,
        group_ids: &[EntityId],
    ) -> Result<usize, RepositoryError> {
        let group_ids = unique_group_ids(group_ids)?;
        let transaction = self.connection.transaction().map_err(storage_error)?;
        let mut groups = Vec::with_capacity(group_ids.len());
        for group_id in &group_ids {
            groups.push(load_deletion_group(&transaction, *group_id)?);
        }

        let mut category_ids = HashSet::new();
        let mut website_ids = HashSet::new();
        let mut account_ids = HashSet::new();
        for (group_id, entity_type, root_id) in &groups {
            collect_ids_by_group(
                &transaction,
                *group_id,
                &mut category_ids,
                &mut website_ids,
                &mut account_ids,
            )?;
            match entity_type.as_str() {
                "category" => {
                    category_ids.insert(*root_id);
                }
                "website" => {
                    website_ids.insert(*root_id);
                }
                "account" => {
                    account_ids.insert(*root_id);
                }
                _ => return Err(RepositoryError::CorruptData),
            }
        }

        for category_id in category_ids.clone() {
            collect_websites_for_category(&transaction, category_id, &mut website_ids)?;
        }
        for website_id in website_ids.clone() {
            collect_accounts_for_website(&transaction, website_id, &mut account_ids)?;
        }

        let mut affected_groups: HashSet<EntityId> = group_ids.into_iter().collect();
        collect_entity_groups(
            &transaction,
            "categories",
            &category_ids,
            &mut affected_groups,
        )?;
        collect_entity_groups(&transaction, "websites", &website_ids, &mut affected_groups)?;
        collect_entity_groups(&transaction, "accounts", &account_ids, &mut affected_groups)?;

        for account_id in &account_ids {
            transaction
                .execute(
                    "DELETE FROM account_fields WHERE account_id = ?1",
                    [account_id.as_bytes().as_slice()],
                )
                .map_err(storage_error)?;
            transaction
                .execute(
                    "DELETE FROM accounts WHERE id = ?1",
                    [account_id.as_bytes().as_slice()],
                )
                .map_err(storage_error)?;
        }
        for website_id in &website_ids {
            transaction
                .execute(
                    "DELETE FROM websites WHERE id = ?1",
                    [website_id.as_bytes().as_slice()],
                )
                .map_err(storage_error)?;
        }
        for category_id in &category_ids {
            transaction
                .execute(
                    "DELETE FROM categories WHERE id = ?1",
                    [category_id.as_bytes().as_slice()],
                )
                .map_err(storage_error)?;
        }
        for group_id in &affected_groups {
            transaction
                .execute(
                    "DELETE FROM deletion_groups WHERE id = ?1",
                    [group_id.as_bytes().as_slice()],
                )
                .map_err(storage_error)?;
        }
        let affected_count = affected_groups.len();
        transaction.commit().map_err(storage_error)?;
        Ok(affected_count)
    }

    pub(crate) fn search(&self, query: &str) -> Result<Vec<SearchResult>, RepositoryError> {
        let query = query.trim();
        if query.chars().count() > 500 {
            return Err(crate::domain::DomainError::SearchQueryTooLong.into());
        }
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let key = normalize_for_comparison(query);
        let mut results = Vec::new();

        let mut website_statement = self
            .connection
            .prepare(
                "SELECT w.id, w.name, c.name, w.category_id
                 FROM websites w
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE w.deleted_at IS NULL AND instr(w.name_key, ?1) > 0
                 ORDER BY w.name_key LIMIT 50",
            )
            .map_err(storage_error)?;
        let website_rows = website_statement
            .query_map([&key], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            })
            .map_err(storage_error)?;
        for row in website_rows {
            let (id, title, subtitle, category_id) = row.map_err(storage_error)?;
            let id = entity_id(&id)?;
            results.push(SearchResult {
                kind: "website",
                id,
                title,
                subtitle,
                category_id: entity_id(&category_id)?,
                website_id: id,
                account_id: None,
            });
        }
        drop(website_statement);

        let mut account_statement = self
            .connection
            .prepare(
                "SELECT a.id, a.display_name, w.name, w.id, w.category_id
                 FROM accounts a
                 JOIN websites w ON w.id = a.website_id AND w.deleted_at IS NULL
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE a.deleted_at IS NULL AND (
                   instr(a.display_name_key, ?1) > 0
                   OR EXISTS (
                     SELECT 1 FROM account_fields f
                     WHERE f.account_id = a.id
                       AND f.system_role IN ('username', 'email')
                       AND f.is_sensitive = 0
                       AND instr(lower(f.value), ?1) > 0
                   )
                 )
                 ORDER BY a.display_name_key LIMIT 50",
            )
            .map_err(storage_error)?;
        let account_rows = account_statement
            .query_map([&key], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                    row.get::<_, Vec<u8>>(4)?,
                ))
            })
            .map_err(storage_error)?;
        for row in account_rows {
            let (id, title, subtitle, website_id, category_id) = row.map_err(storage_error)?;
            let id = entity_id(&id)?;
            results.push(SearchResult {
                kind: "account",
                id,
                title,
                subtitle,
                category_id: entity_id(&category_id)?,
                website_id: entity_id(&website_id)?,
                account_id: Some(id),
            });
        }
        Ok(results)
    }

    pub(crate) fn read_field_value(&self, field_id: EntityId) -> Result<String, RepositoryError> {
        self.connection
            .query_row(
                "SELECT f.value
                 FROM account_fields f
                 JOIN accounts a ON a.id = f.account_id AND a.deleted_at IS NULL
                 JOIN websites w ON w.id = a.website_id AND w.deleted_at IS NULL
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE f.id = ?1",
                [field_id.as_bytes().as_slice()],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage_error)?
            .ok_or(RepositoryError::FieldNotFound)
    }

    pub(crate) fn website_url(&self, website_id: EntityId) -> Result<String, RepositoryError> {
        let value = self
            .connection
            .query_row(
                "SELECT w.primary_url
                 FROM websites w
                 JOIN categories c ON c.id = w.category_id AND c.deleted_at IS NULL
                 WHERE w.id = ?1 AND w.deleted_at IS NULL",
                [website_id.as_bytes().as_slice()],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(storage_error)?
            .ok_or(RepositoryError::WebsiteNotFound)?
            .ok_or(crate::domain::DomainError::InvalidUrl)?;
        validate_optional_url(Some(&value))?.ok_or(crate::domain::DomainError::InvalidUrl.into())
    }
}

fn unique_group_ids(group_ids: &[EntityId]) -> Result<Vec<EntityId>, RepositoryError> {
    if group_ids.is_empty() || group_ids.len() > 500 {
        return Err(RepositoryError::InvalidInput);
    }
    let mut seen = HashSet::new();
    Ok(group_ids
        .iter()
        .copied()
        .filter(|group_id| seen.insert(*group_id))
        .collect())
}

fn load_deletion_group(
    transaction: &Transaction<'_>,
    group_id: EntityId,
) -> Result<(EntityId, String, EntityId), RepositoryError> {
    let (entity_type, root_id) = transaction
        .query_row(
            "SELECT root_entity_type, root_entity_id FROM deletion_groups WHERE id = ?1",
            [group_id.as_bytes().as_slice()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)),
        )
        .optional()
        .map_err(storage_error)?
        .ok_or(RepositoryError::DeletionGroupNotFound)?;
    Ok((group_id, entity_type, entity_id(&root_id)?))
}

fn restore_one_group(
    transaction: &Transaction<'_>,
    group_id: EntityId,
    entity_type: &str,
    root_id: EntityId,
) -> Result<(), RepositoryError> {
    let parent_active = match entity_type {
        "category" => true,
        "website" => transaction
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM websites w JOIN categories c ON c.id = w.category_id
                   WHERE w.id = ?1 AND c.deleted_at IS NULL
                 )",
                [root_id.as_bytes().as_slice()],
                |row| row.get(0),
            )
            .map_err(storage_error)?,
        "account" => transaction
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM accounts a
                   JOIN websites w ON w.id = a.website_id
                   JOIN categories c ON c.id = w.category_id
                   WHERE a.id = ?1 AND w.deleted_at IS NULL AND c.deleted_at IS NULL
                 )",
                [root_id.as_bytes().as_slice()],
                |row| row.get(0),
            )
            .map_err(storage_error)?,
        _ => return Err(RepositoryError::CorruptData),
    };
    if !parent_active {
        return Err(RepositoryError::ParentUnavailable);
    }
    for table in ["accounts", "websites", "categories"] {
        transaction
            .execute(
                &format!(
                    "UPDATE {table} SET deleted_at = NULL, deletion_group_id = NULL
                     WHERE deletion_group_id = ?1"
                ),
                [group_id.as_bytes().as_slice()],
            )
            .map_err(constraint_or_storage)?;
    }
    transaction
        .execute(
            "DELETE FROM deletion_groups WHERE id = ?1",
            [group_id.as_bytes().as_slice()],
        )
        .map_err(storage_error)?;
    Ok(())
}

fn collect_ids_by_group(
    transaction: &Transaction<'_>,
    group_id: EntityId,
    categories: &mut HashSet<EntityId>,
    websites: &mut HashSet<EntityId>,
    accounts: &mut HashSet<EntityId>,
) -> Result<(), RepositoryError> {
    collect_ids(
        transaction,
        "SELECT id FROM categories WHERE deletion_group_id = ?1",
        group_id,
        categories,
    )?;
    collect_ids(
        transaction,
        "SELECT id FROM websites WHERE deletion_group_id = ?1",
        group_id,
        websites,
    )?;
    collect_ids(
        transaction,
        "SELECT id FROM accounts WHERE deletion_group_id = ?1",
        group_id,
        accounts,
    )
}

fn collect_websites_for_category(
    transaction: &Transaction<'_>,
    category_id: EntityId,
    websites: &mut HashSet<EntityId>,
) -> Result<(), RepositoryError> {
    collect_ids(
        transaction,
        "SELECT id FROM websites WHERE category_id = ?1",
        category_id,
        websites,
    )
}

fn collect_accounts_for_website(
    transaction: &Transaction<'_>,
    website_id: EntityId,
    accounts: &mut HashSet<EntityId>,
) -> Result<(), RepositoryError> {
    collect_ids(
        transaction,
        "SELECT id FROM accounts WHERE website_id = ?1",
        website_id,
        accounts,
    )
}

fn collect_ids(
    transaction: &Transaction<'_>,
    sql: &str,
    parent_id: EntityId,
    target: &mut HashSet<EntityId>,
) -> Result<(), RepositoryError> {
    let mut statement = transaction.prepare(sql).map_err(storage_error)?;
    let rows = statement
        .query_map([parent_id.as_bytes().as_slice()], |row| {
            row.get::<_, Vec<u8>>(0)
        })
        .map_err(storage_error)?;
    for row in rows {
        target.insert(entity_id(&row.map_err(storage_error)?)?);
    }
    Ok(())
}

fn collect_entity_groups(
    transaction: &Transaction<'_>,
    table: &str,
    entity_ids: &HashSet<EntityId>,
    target: &mut HashSet<EntityId>,
) -> Result<(), RepositoryError> {
    for entity_id_value in entity_ids {
        let group = transaction
            .query_row(
                &format!("SELECT deletion_group_id FROM {table} WHERE id = ?1"),
                [entity_id_value.as_bytes().as_slice()],
                |row| row.get::<_, Option<Vec<u8>>>(0),
            )
            .optional()
            .map_err(storage_error)?
            .flatten();
        if let Some(group_id) = group {
            target.insert(entity_id(&group_id)?);
        }
    }
    Ok(())
}

fn entity_id(value: &[u8]) -> Result<EntityId, RepositoryError> {
    EntityId::from_slice(value).map_err(|_| RepositoryError::CorruptData)
}

fn storage_error(_: rusqlite::Error) -> RepositoryError {
    RepositoryError::StorageUnavailable
}

fn constraint_or_storage(error: rusqlite::Error) -> RepositoryError {
    if is_constraint_violation(&error) {
        RepositoryError::InvalidInput
    } else {
        RepositoryError::StorageUnavailable
    }
}

fn require_active_category(
    transaction: &Transaction<'_>,
    category_id: EntityId,
    vault_id: EntityId,
) -> Result<(), RepositoryError> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM categories
               WHERE id = ?1 AND vault_id = ?2 AND deleted_at IS NULL
             )",
            params![
                category_id.as_bytes().as_slice(),
                vault_id.as_bytes().as_slice()
            ],
            |row| row.get(0),
        )
        .map_err(storage_error)?;
    if exists {
        Ok(())
    } else {
        Err(RepositoryError::CategoryNotFound)
    }
}

fn require_active_website(
    transaction: &Transaction<'_>,
    website_id: EntityId,
    vault_id: EntityId,
) -> Result<(), RepositoryError> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM websites w
               JOIN categories c ON c.id = w.category_id
               WHERE w.id = ?1 AND w.vault_id = ?2
                 AND w.deleted_at IS NULL AND c.deleted_at IS NULL
             )",
            params![
                website_id.as_bytes().as_slice(),
                vault_id.as_bytes().as_slice()
            ],
            |row| row.get(0),
        )
        .map_err(storage_error)?;
    if exists {
        Ok(())
    } else {
        Err(RepositoryError::WebsiteNotFound)
    }
}

fn next_sort_order(
    transaction: &Transaction<'_>,
    table: &str,
    parent_column: &str,
    parent_id: EntityId,
) -> Result<i64, RepositoryError> {
    let sql = format!(
        "SELECT COALESCE(MAX(sort_order) + 1, 0)
         FROM {table}
         WHERE {parent_column} = ?1 AND deleted_at IS NULL"
    );
    transaction
        .query_row(&sql, [parent_id.as_bytes().as_slice()], |row| row.get(0))
        .map_err(storage_error)
}

fn load_field_ids(
    transaction: &Transaction<'_>,
    account_id: EntityId,
) -> Result<HashSet<EntityId>, RepositoryError> {
    let mut statement = transaction
        .prepare("SELECT id FROM account_fields WHERE account_id = ?1")
        .map_err(storage_error)?;
    let ids = statement
        .query_map([account_id.as_bytes().as_slice()], |row| {
            row.get::<_, Vec<u8>>(0)
        })
        .map_err(storage_error)?
        .map(|row| entity_id(&row.map_err(storage_error)?))
        .collect();
    ids
}

fn begin_deletion(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: EntityId,
) -> Result<EntityId, RepositoryError> {
    let table = match entity_type {
        "category" => "categories",
        "website" => "websites",
        "account" => "accounts",
        _ => return Err(RepositoryError::InvalidInput),
    };
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = ?1 AND deleted_at IS NULL)");
    let exists: bool = transaction
        .query_row(&sql, [entity_id.as_bytes().as_slice()], |row| row.get(0))
        .map_err(storage_error)?;
    if !exists {
        return Err(match entity_type {
            "category" => RepositoryError::CategoryNotFound,
            "website" => RepositoryError::WebsiteNotFound,
            _ => RepositoryError::AccountNotFound,
        });
    }
    let group_id = EntityId::new_v4();
    transaction
        .execute(
            "INSERT INTO deletion_groups
             (id, root_entity_type, root_entity_id, deleted_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                group_id.as_bytes().as_slice(),
                entity_type,
                entity_id.as_bytes().as_slice(),
                unix_time_millis()?,
            ],
        )
        .map_err(storage_error)?;
    Ok(group_id)
}

fn finish_root_deletion(
    transaction: &Transaction<'_>,
    table: &str,
    entity_id: EntityId,
    group_id: EntityId,
    now: i64,
) -> Result<(), RepositoryError> {
    let sql = format!(
        "UPDATE {table}
         SET deleted_at = ?1, deletion_group_id = ?2, updated_at = ?1
         WHERE id = ?3 AND deleted_at IS NULL"
    );
    let updated = transaction
        .execute(
            &sql,
            params![
                now,
                group_id.as_bytes().as_slice(),
                entity_id.as_bytes().as_slice()
            ],
        )
        .map_err(storage_error)?;
    if updated == 1 {
        Ok(())
    } else {
        Err(RepositoryError::StorageUnavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{repositories::CategoryRepository, storage::create_schema};

    fn test_connection() -> (tempfile::TempDir, Connection) {
        let temp = tempfile::tempdir().unwrap();
        let mut connection = Connection::open(temp.path().join("password-manager.db")).unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        create_schema(&mut connection).unwrap();
        (temp, connection)
    }

    fn example_fields() -> Vec<FieldDraft> {
        vec![
            FieldDraft::validate(
                None,
                Some("username"),
                "用户名",
                "text",
                Some("demo@example.test".into()),
                false,
                false,
            )
            .unwrap(),
            FieldDraft::validate(
                None,
                Some("password"),
                "密码",
                "password",
                Some("fictional-secret".into()),
                false,
                true,
            )
            .unwrap(),
        ]
    }

    #[test]
    fn website_account_and_fields_round_trip_without_listing_secrets() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(
                None,
                category.id,
                "示例站点",
                Some("https://example.test/login"),
            )
            .unwrap();
        let account = repository
            .save_account(None, website.id, "私人账号", example_fields())
            .unwrap();

        let summaries = repository.list_accounts(website.id).unwrap();
        assert_eq!(summaries[0].summary.as_deref(), Some("demo@example.test"));
        assert_eq!(
            account.fields[0].value.as_deref(),
            Some("demo@example.test")
        );
        assert_eq!(account.fields[1].value, None);
        assert_eq!(
            repository.read_field_value(account.fields[1].id).unwrap(),
            "fictional-secret"
        );
    }

    #[test]
    fn failed_account_update_rolls_back_account_and_fields() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "示例", Some("https://example.test"))
            .unwrap();
        let account = repository
            .save_account(None, website.id, "原名称", example_fields())
            .unwrap();
        let duplicate_fields = vec![
            FieldDraft::validate(
                None,
                None,
                "Repeat",
                "text",
                Some("one".into()),
                false,
                false,
            )
            .unwrap(),
            FieldDraft::validate(
                None,
                None,
                "ＲＥＰＥＡＴ",
                "text",
                Some("two".into()),
                false,
                false,
            )
            .unwrap(),
        ];
        assert!(repository
            .save_account(Some(account.id), website.id, "新名称", duplicate_fields)
            .is_err());
        let persisted = repository.get_account(account.id).unwrap();
        assert_eq!(persisted.display_name, "原名称");
        assert_eq!(persisted.fields.len(), 2);
    }

    #[test]
    fn deletion_group_restores_a_complete_category_tree() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "示例", Some("https://example.test"))
            .unwrap();
        repository
            .save_account(None, website.id, "账号", example_fields())
            .unwrap();

        repository.soft_delete_category(category.id).unwrap();
        assert!(repository
            .list_websites(Some(category.id))
            .unwrap()
            .is_empty());
        let trash = repository.list_trash().unwrap();
        assert_eq!(trash.len(), 1);
        repository
            .restore_deletion_group(trash[0].group_id)
            .unwrap();
        assert_eq!(
            repository.list_websites(Some(category.id)).unwrap().len(),
            1
        );
        assert_eq!(repository.list_accounts(website.id).unwrap().len(), 1);
    }

    #[test]
    fn batch_restore_orders_parent_groups_before_children() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("虚构分类")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "虚构站点", Some("https://example.test"))
            .unwrap();
        let account = repository
            .save_account(None, website.id, "虚构账号", example_fields())
            .unwrap();
        repository.soft_delete_account(account.id).unwrap();
        let account_group = repository.list_trash().unwrap()[0].group_id;
        repository.soft_delete_website(website.id).unwrap();
        let website_group = repository
            .list_trash()
            .unwrap()
            .into_iter()
            .find(|item| item.entity_type == "website")
            .unwrap()
            .group_id;

        repository
            .restore_deletion_groups(&[account_group, website_group])
            .unwrap();

        assert!(repository.list_trash().unwrap().is_empty());
        assert_eq!(repository.list_accounts(website.id).unwrap().len(), 1);
    }

    #[test]
    fn failed_batch_restore_rolls_back_every_selected_group() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("虚构分类甲")
            .unwrap();
        let rollback_category = CategoryRepository::new(&mut connection)
            .create("虚构分类乙")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "虚构站点", Some("https://example.test"))
            .unwrap();
        let account = repository
            .save_account(None, website.id, "虚构账号", example_fields())
            .unwrap();
        repository.soft_delete_account(account.id).unwrap();
        repository.soft_delete_website(website.id).unwrap();
        repository
            .soft_delete_category(rollback_category.id)
            .unwrap();
        let trash = repository.list_trash().unwrap();
        let account_group = trash
            .iter()
            .find(|item| item.entity_type == "account")
            .unwrap()
            .group_id;
        let category_group = trash
            .iter()
            .find(|item| item.entity_name == "虚构分类乙")
            .unwrap()
            .group_id;

        assert_eq!(
            repository.restore_deletion_groups(&[category_group, account_group]),
            Err(RepositoryError::ParentUnavailable)
        );
        let remaining: HashSet<_> = repository
            .list_trash()
            .unwrap()
            .into_iter()
            .map(|item| item.group_id)
            .collect();
        assert!(remaining.contains(&category_group));
        assert!(remaining.contains(&account_group));
    }

    #[test]
    fn permanent_category_delete_removes_descendants_and_linked_trash_groups() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("虚构分类")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "虚构站点", Some("https://example.test"))
            .unwrap();
        let account = repository
            .save_account(None, website.id, "虚构账号", example_fields())
            .unwrap();
        repository.soft_delete_account(account.id).unwrap();
        repository.soft_delete_category(category.id).unwrap();
        let category_group = repository
            .list_trash()
            .unwrap()
            .into_iter()
            .find(|item| item.entity_type == "category")
            .unwrap()
            .group_id;

        assert_eq!(
            repository
                .permanently_delete_groups(&[category_group])
                .unwrap(),
            2
        );
        assert!(repository.list_trash().unwrap().is_empty());
        for table in ["categories", "websites", "accounts", "account_fields"] {
            let count: i64 = repository
                .connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} should be empty");
        }
    }

    #[test]
    fn empty_batch_is_rejected() {
        let (_temp, mut connection) = test_connection();
        let mut repository = VaultRepository::new(&mut connection);
        assert_eq!(
            repository.restore_deletion_groups(&[]),
            Err(RepositoryError::InvalidInput)
        );
        assert_eq!(
            repository.permanently_delete_groups(&[]),
            Err(RepositoryError::InvalidInput)
        );
    }

    #[test]
    fn search_finds_safe_fields_but_not_password_values() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "示例", Some("https://example.test"))
            .unwrap();
        repository
            .save_account(None, website.id, "账号", example_fields())
            .unwrap();

        assert_eq!(repository.search("demo@example").unwrap().len(), 1);
        assert!(repository.search("fictional-secret").unwrap().is_empty());
    }

    #[test]
    fn relationships_and_field_order_survive_a_connection_restart() {
        let (temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let (website_id, account_id) = {
            let mut repository = VaultRepository::new(&mut connection);
            let website = repository
                .save_website(None, category.id, "示例", Some("https://example.test"))
                .unwrap();
            let account = repository
                .save_account(None, website.id, "账号", example_fields())
                .unwrap();
            (website.id, account.id)
        };
        drop(connection);

        let mut reopened = Connection::open(temp.path().join("password-manager.db")).unwrap();
        reopened.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let repository = VaultRepository::new(&mut reopened);
        let websites = repository.list_websites(Some(category.id)).unwrap();
        let accounts = repository.list_accounts(website_id).unwrap();
        let detail = repository.get_account(account_id).unwrap();
        assert_eq!(websites[0].id, website_id);
        assert_eq!(accounts[0].id, account_id);
        assert_eq!(detail.fields.len(), 2);
        assert_eq!(detail.fields[0].sort_order, 0);
        assert_eq!(detail.fields[1].sort_order, 1);
    }

    #[test]
    fn websites_and_accounts_are_listed_by_normalized_name() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("虚构排序分类")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let zulu = repository
            .save_website(None, category.id, "Zulu", Some("https://zulu.example.test"))
            .unwrap();
        repository
            .save_website(
                None,
                category.id,
                "Alpha",
                Some("https://alpha.example.test"),
            )
            .unwrap();
        repository
            .save_account(None, zulu.id, "Zulu account", example_fields())
            .unwrap();
        repository
            .save_account(None, zulu.id, "Alpha account", example_fields())
            .unwrap();

        let website_names: Vec<_> = repository
            .list_websites(Some(category.id))
            .unwrap()
            .into_iter()
            .map(|website| website.name)
            .collect();
        let account_names: Vec<_> = repository
            .list_accounts(zulu.id)
            .unwrap()
            .into_iter()
            .map(|account| account.display_name)
            .collect();

        assert_eq!(website_names, vec!["Alpha", "Zulu"]);
        assert_eq!(account_names, vec!["Alpha account", "Zulu account"]);
    }

    #[test]
    fn a_category_from_another_vault_cannot_be_used_as_a_parent() {
        let (_temp, mut connection) = test_connection();
        let foreign_vault = EntityId::new_v4();
        let foreign_category = EntityId::new_v4();
        connection
            .execute(
                "INSERT INTO vault_meta
                 (id, display_name, data_model_version, created_at, updated_at)
                 VALUES (?1, '其他保险库', 1, 1, 1)",
                [foreign_vault.as_bytes().as_slice()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO categories
                 (id, vault_id, name, name_key, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, '外部分类', '外部分类', 0, 1, 1)",
                params![
                    foreign_category.as_bytes().as_slice(),
                    foreign_vault.as_bytes().as_slice()
                ],
            )
            .unwrap();

        let error = VaultRepository::new(&mut connection)
            .save_website(None, foreign_category, "非法网站", None)
            .unwrap_err();
        assert_eq!(error, RepositoryError::CorruptData);
    }

    #[test]
    fn editing_metadata_can_preserve_an_unreturned_sensitive_value() {
        let (_temp, mut connection) = test_connection();
        let category = CategoryRepository::new(&mut connection)
            .create("开发")
            .unwrap();
        let mut repository = VaultRepository::new(&mut connection);
        let website = repository
            .save_website(None, category.id, "示例", Some("https://example.test"))
            .unwrap();
        let account = repository
            .save_account(None, website.id, "原账号", example_fields())
            .unwrap();
        let password_id = account.fields[1].id;
        let edited_fields = vec![
            FieldDraft::validate(
                Some(&account.fields[0].id.as_uuid_string()),
                Some("username"),
                "用户名",
                "text",
                Some("updated@example.test".into()),
                false,
                false,
            )
            .unwrap(),
            FieldDraft::validate(
                Some(&password_id.as_uuid_string()),
                Some("password"),
                "登录密码",
                "password",
                None,
                true,
                true,
            )
            .unwrap(),
        ];
        repository
            .save_account(Some(account.id), website.id, "新账号名称", edited_fields)
            .unwrap();
        assert_eq!(
            repository.read_field_value(password_id).unwrap(),
            "fictional-secret"
        );
    }
}
