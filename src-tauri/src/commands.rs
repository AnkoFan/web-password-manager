use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroize;

use super::{VaultSession, VaultState};
use crate::{
    domain::{
        AccountDetail, AccountField, AccountSummary, Category, EntityId, FieldDraft, SearchResult,
        TrashItem, Website,
    },
    repositories::{CategoryRepository, RepositoryError, VaultRepository},
    settings::{save_settings, AppSettings},
    storage::{
        create_backup as create_backup_files, list_backups as load_backups,
        open_or_create_database, restore_backup as restore_backup_files, vault_paths,
        verify_backup as verify_backup_files, BackupInfo,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultStatus {
    exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommandError {
    code: &'static str,
    message: String,
}

impl CommandError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

fn require_connection<'a>(
    state: &'a State<'_, VaultState>,
) -> Result<std::sync::MutexGuard<'a, VaultSession>, CommandError> {
    let session = state
        .0
        .lock()
        .map_err(|_| CommandError::new("session_unavailable", "本地数据库状态不可用"))?;
    if session.connection.is_none() {
        return Err(CommandError::new(
            "storage_unavailable",
            "本地数据库尚未初始化",
        ));
    }
    Ok(session)
}

fn repository_error(error: RepositoryError) -> CommandError {
    let code = match error {
        RepositoryError::Domain(_) => "invalid_input",
        RepositoryError::CategoryAlreadyExists => "category_already_exists",
        RepositoryError::CategoryNotFound => "category_not_found",
        RepositoryError::WebsiteNotFound => "website_not_found",
        RepositoryError::AccountAlreadyExists => "account_already_exists",
        RepositoryError::AccountNotFound => "account_not_found",
        RepositoryError::FieldNotFound => "field_not_found",
        RepositoryError::DeletionGroupNotFound => "deletion_group_not_found",
        RepositoryError::ParentUnavailable => "parent_unavailable",
        RepositoryError::InvalidInput => "invalid_input",
        RepositoryError::CorruptData => "corrupt_data",
        RepositoryError::StorageUnavailable => "storage_unavailable",
    };
    CommandError::new(code, error.to_string())
}

fn parse_id(value: &str) -> Result<EntityId, CommandError> {
    EntityId::parse(value)
        .map_err(|error| CommandError::new("invalid_entity_id", error.to_string()))
}

#[tauri::command]
pub(crate) fn vault_status(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<VaultStatus, CommandError> {
    let paths =
        vault_paths(&app).map_err(|message| CommandError::new("storage_unavailable", message))?;
    let mut session = state
        .0
        .lock()
        .map_err(|_| CommandError::new("session_unavailable", "本地数据库状态不可用"))?;
    session.connection = Some(
        open_or_create_database(&paths)
            .map_err(|message| CommandError::new("storage_unavailable", message))?,
    );
    Ok(VaultStatus { exists: true })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CategoryView {
    id: String,
    name: String,
    sort_order: i64,
}

impl From<Category> for CategoryView {
    fn from(value: Category) -> Self {
        let _ = (value.vault_id, value.created_at, value.updated_at);
        Self {
            id: value.id.as_uuid_string(),
            name: value.name,
            sort_order: value.sort_order,
        }
    }
}

#[tauri::command]
pub(crate) fn list_categories(
    state: State<'_, VaultState>,
) -> Result<Vec<CategoryView>, CommandError> {
    let mut session = require_connection(&state)?;
    CategoryRepository::new(session.connection.as_mut().expect("checked above"))
        .list_active()
        .map(|values| values.into_iter().map(CategoryView::from).collect())
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn create_category(
    name: String,
    state: State<'_, VaultState>,
) -> Result<CategoryView, CommandError> {
    let mut session = require_connection(&state)?;
    CategoryRepository::new(session.connection.as_mut().expect("checked above"))
        .create(&name)
        .map(CategoryView::from)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn rename_category(
    category_id: String,
    name: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let category_id = parse_id(&category_id)?;
    let mut session = require_connection(&state)?;
    CategoryRepository::new(session.connection.as_mut().expect("checked above"))
        .rename(category_id, &name)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn delete_category(
    category_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let category_id = parse_id(&category_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .soft_delete_category(category_id)
        .map_err(repository_error)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebsiteDraftInput {
    id: Option<String>,
    category_id: String,
    name: String,
    primary_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebsiteView {
    id: String,
    category_id: String,
    name: String,
    primary_url: Option<String>,
    sort_order: i64,
}

impl From<Website> for WebsiteView {
    fn from(value: Website) -> Self {
        Self {
            id: value.id.as_uuid_string(),
            category_id: value.category_id.as_uuid_string(),
            name: value.name,
            primary_url: value.primary_url,
            sort_order: value.sort_order,
        }
    }
}

#[tauri::command]
pub(crate) fn list_websites(
    category_id: Option<String>,
    state: State<'_, VaultState>,
) -> Result<Vec<WebsiteView>, CommandError> {
    let category_id = category_id.as_deref().map(parse_id).transpose()?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .list_websites(category_id)
        .map(|values| values.into_iter().map(WebsiteView::from).collect())
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn save_website(
    draft: WebsiteDraftInput,
    state: State<'_, VaultState>,
) -> Result<WebsiteView, CommandError> {
    let website_id = draft.id.as_deref().map(parse_id).transpose()?;
    let category_id = parse_id(&draft.category_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .save_website(
            website_id,
            category_id,
            &draft.name,
            draft.primary_url.as_deref(),
        )
        .map(WebsiteView::from)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn delete_website(
    website_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let website_id = parse_id(&website_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .soft_delete_website(website_id)
        .map_err(repository_error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountSummaryView {
    id: String,
    website_id: String,
    display_name: String,
    summary: Option<String>,
    sort_order: i64,
}

impl From<AccountSummary> for AccountSummaryView {
    fn from(value: AccountSummary) -> Self {
        Self {
            id: value.id.as_uuid_string(),
            website_id: value.website_id.as_uuid_string(),
            display_name: value.display_name,
            summary: value.summary,
            sort_order: value.sort_order,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountFieldView {
    id: String,
    system_role: Option<&'static str>,
    label: String,
    field_type: &'static str,
    value: Option<String>,
    is_sensitive: bool,
    sort_order: i64,
}

impl From<AccountField> for AccountFieldView {
    fn from(value: AccountField) -> Self {
        Self {
            id: value.id.as_uuid_string(),
            system_role: value.system_role.map(|role| role.as_str()),
            label: value.label,
            field_type: value.field_type.as_str(),
            value: value.value,
            is_sensitive: value.is_sensitive,
            sort_order: value.sort_order,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountDetailView {
    id: String,
    website_id: String,
    display_name: String,
    fields: Vec<AccountFieldView>,
}

impl From<AccountDetail> for AccountDetailView {
    fn from(value: AccountDetail) -> Self {
        Self {
            id: value.id.as_uuid_string(),
            website_id: value.website_id.as_uuid_string(),
            display_name: value.display_name,
            fields: value
                .fields
                .into_iter()
                .map(AccountFieldView::from)
                .collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountFieldInput {
    id: Option<String>,
    system_role: Option<String>,
    label: String,
    field_type: String,
    value: Option<String>,
    #[serde(default)]
    keep_existing_value: bool,
    is_sensitive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountDraftInput {
    id: Option<String>,
    website_id: String,
    display_name: String,
    fields: Vec<AccountFieldInput>,
}

impl AccountFieldInput {
    fn validate(self) -> Result<FieldDraft, CommandError> {
        FieldDraft::validate(
            self.id.as_deref(),
            self.system_role.as_deref(),
            &self.label,
            &self.field_type,
            self.value,
            self.keep_existing_value,
            self.is_sensitive,
        )
        .map_err(|error| CommandError::new("invalid_input", error.to_string()))
    }
}

#[tauri::command]
pub(crate) fn list_accounts(
    website_id: String,
    state: State<'_, VaultState>,
) -> Result<Vec<AccountSummaryView>, CommandError> {
    let website_id = parse_id(&website_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .list_accounts(website_id)
        .map(|values| values.into_iter().map(AccountSummaryView::from).collect())
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn get_account(
    account_id: String,
    state: State<'_, VaultState>,
) -> Result<AccountDetailView, CommandError> {
    let account_id = parse_id(&account_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .get_account(account_id)
        .map(AccountDetailView::from)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn save_account(
    draft: AccountDraftInput,
    state: State<'_, VaultState>,
) -> Result<AccountDetailView, CommandError> {
    let account_id = draft.id.as_deref().map(parse_id).transpose()?;
    let website_id = parse_id(&draft.website_id)?;
    let fields = draft
        .fields
        .into_iter()
        .map(AccountFieldInput::validate)
        .collect::<Result<Vec<_>, _>>()?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .save_account(account_id, website_id, &draft.display_name, fields)
        .map(AccountDetailView::from)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn delete_account(
    account_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let account_id = parse_id(&account_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .soft_delete_account(account_id)
        .map_err(repository_error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchResultView {
    kind: &'static str,
    id: String,
    title: String,
    subtitle: String,
    category_id: String,
    website_id: String,
    account_id: Option<String>,
}

impl From<SearchResult> for SearchResultView {
    fn from(value: SearchResult) -> Self {
        Self {
            kind: value.kind,
            id: value.id.as_uuid_string(),
            title: value.title,
            subtitle: value.subtitle,
            category_id: value.category_id.as_uuid_string(),
            website_id: value.website_id.as_uuid_string(),
            account_id: value.account_id.map(|id| id.as_uuid_string()),
        }
    }
}

#[tauri::command]
pub(crate) fn search_vault(
    query: String,
    state: State<'_, VaultState>,
) -> Result<Vec<SearchResultView>, CommandError> {
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .search(&query)
        .map(|values| values.into_iter().map(SearchResultView::from).collect())
        .map_err(repository_error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrashItemView {
    group_id: String,
    entity_type: String,
    entity_name: String,
    deleted_at: i64,
}

impl From<TrashItem> for TrashItemView {
    fn from(value: TrashItem) -> Self {
        Self {
            group_id: value.group_id.as_uuid_string(),
            entity_type: value.entity_type,
            entity_name: value.entity_name,
            deleted_at: value.deleted_at,
        }
    }
}

#[tauri::command]
pub(crate) fn list_trash(state: State<'_, VaultState>) -> Result<Vec<TrashItemView>, CommandError> {
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .list_trash()
        .map(|values| values.into_iter().map(TrashItemView::from).collect())
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn restore_deletion_group(
    group_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let group_id = parse_id(&group_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .restore_deletion_group(group_id)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn reveal_field(
    field_id: String,
    state: State<'_, VaultState>,
) -> Result<String, CommandError> {
    let field_id = parse_id(&field_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .read_field_value(field_id)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn copy_field(
    app: AppHandle,
    field_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let field_id = parse_id(&field_id)?;
    let mut session = require_connection(&state)?;
    let mut value = VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .read_field_value(field_id)
        .map_err(repository_error)?;
    let result = app
        .clipboard()
        .write_text(value.clone())
        .map_err(|_| CommandError::new("clipboard_write_failed", "无法写入剪贴板"));
    if result.is_ok() {
        schedule_conditional_clipboard_clear(
            app.clone(),
            clipboard_digest(value.as_bytes()),
            session.settings.clipboard_clear_seconds,
        );
    }
    value.zeroize();
    result
}

#[tauri::command]
pub(crate) fn copy_website_url(
    app: AppHandle,
    website_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let website_id = parse_id(&website_id)?;
    let mut session = require_connection(&state)?;
    let mut url = VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .website_url(website_id)
        .map_err(repository_error)?;
    app.clipboard()
        .write_text(url.clone())
        .map_err(|_| CommandError::new("clipboard_write_failed", "无法写入剪贴板"))?;
    schedule_conditional_clipboard_clear(
        app,
        clipboard_digest(url.as_bytes()),
        session.settings.clipboard_clear_seconds,
    );
    url.zeroize();
    Ok(())
}

fn clipboard_digest(value: &[u8]) -> [u8; 32] {
    Sha256::digest(value).into()
}

fn schedule_conditional_clipboard_clear(
    app: AppHandle,
    expected_digest: [u8; 32],
    delay_seconds: u64,
) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(delay_seconds));
        let Ok(mut current) = app.clipboard().read_text() else {
            return;
        };
        if clipboard_digest(current.as_bytes()) == expected_digest {
            let _ = app.clipboard().clear();
        }
        current.zeroize();
    });
}

#[tauri::command]
pub(crate) fn get_website_url(
    website_id: String,
    state: State<'_, VaultState>,
) -> Result<String, CommandError> {
    let website_id = parse_id(&website_id)?;
    let mut session = require_connection(&state)?;
    VaultRepository::new(session.connection.as_mut().expect("checked above"))
        .website_url(website_id)
        .map_err(repository_error)
}

#[tauri::command]
pub(crate) fn get_app_settings(state: State<'_, VaultState>) -> Result<AppSettings, CommandError> {
    state
        .0
        .lock()
        .map(|session| session.settings.clone())
        .map_err(|_| CommandError::new("session_unavailable", "保险库状态不可用"))
}

#[tauri::command]
pub(crate) fn update_app_settings(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, VaultState>,
) -> Result<AppSettings, CommandError> {
    settings
        .validate()
        .map_err(|message| CommandError::new("invalid_security_settings", message))?;
    save_settings(&app, &settings)
        .map_err(|message| CommandError::new("settings_write_failed", message))?;
    let mut session = state
        .0
        .lock()
        .map_err(|_| CommandError::new("session_unavailable", "应用设置状态不可用"))?;
    session.settings = settings.clone();
    Ok(settings)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupView {
    id: String,
    created_at: i64,
    schema_version: i64,
}

impl From<BackupInfo> for BackupView {
    fn from(value: BackupInfo) -> Self {
        Self {
            id: value.id,
            created_at: value.created_at,
            schema_version: value.schema_version,
        }
    }
}

#[tauri::command]
pub(crate) fn list_backups(app: AppHandle) -> Result<Vec<BackupView>, CommandError> {
    let paths =
        vault_paths(&app).map_err(|message| CommandError::new("storage_unavailable", message))?;
    load_backups(&paths)
        .map(|values| values.into_iter().map(BackupView::from).collect())
        .map_err(|_| CommandError::new("backup_list_failed", "无法读取本机备份"))
}

#[tauri::command]
pub(crate) fn create_backup(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<BackupView, CommandError> {
    let paths =
        vault_paths(&app).map_err(|message| CommandError::new("storage_unavailable", message))?;
    let session = require_connection(&state)?;
    create_backup_files(&paths, session.connection.as_ref().expect("checked above"))
        .map(BackupView::from)
        .map_err(|_| CommandError::new("backup_create_failed", "无法创建本地数据库备份"))
}

#[tauri::command]
pub(crate) fn verify_backup(app: AppHandle, backup_id: String) -> Result<BackupView, CommandError> {
    vault_paths(&app)
        .and_then(|paths| verify_backup_files(&paths, &backup_id))
        .map(BackupView::from)
        .map_err(|_| CommandError::new("backup_verify_failed", "无法验证备份，备份已损坏"))
}

#[tauri::command]
pub(crate) fn restore_backup(
    app: AppHandle,
    backup_id: String,
    state: State<'_, VaultState>,
) -> Result<(), CommandError> {
    let result: Result<(), String> = (|| {
        let paths = vault_paths(&app)?;
        let mut session = state.0.lock().map_err(|_| "本地数据库状态不可用")?;
        let current = session
            .connection
            .take()
            .ok_or_else(|| "本地数据库尚未初始化".to_string())?;
        drop(current);
        match restore_backup_files(&paths, &backup_id) {
            Ok(connection) => {
                session.connection = Some(connection);
                Ok(())
            }
            Err(error) => {
                session.connection = open_or_create_database(&paths).ok();
                Err(error)
            }
        }
    })();
    result.map_err(|_| {
        CommandError::new(
            "backup_restore_failed",
            "恢复失败，当前本地数据库未被备份内容覆盖",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_errors_have_stable_external_codes() {
        assert_eq!(
            repository_error(RepositoryError::AccountNotFound).code,
            "account_not_found"
        );
        assert_eq!(
            repository_error(RepositoryError::ParentUnavailable).code,
            "parent_unavailable"
        );
    }

    #[test]
    fn malformed_ids_are_rejected_at_the_command_boundary() {
        assert_eq!(
            parse_id("not-a-uuid").unwrap_err().code,
            "invalid_entity_id"
        );
    }

    #[test]
    fn clipboard_digest_only_matches_the_original_value() {
        assert_eq!(
            clipboard_digest(b"fictional-secret"),
            clipboard_digest(b"fictional-secret")
        );
        assert_ne!(
            clipboard_digest(b"fictional-secret"),
            clipboard_digest(b"user-replaced-content")
        );
    }
}
