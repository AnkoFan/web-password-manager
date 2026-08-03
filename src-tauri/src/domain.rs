use std::{collections::HashSet, fmt};

use unicode_normalization::UnicodeNormalization;
use url::Url;
use uuid::Uuid;

const CATEGORY_NAME_MAX_CHARS: usize = 100;
const WEBSITE_NAME_MAX_CHARS: usize = 200;
const ACCOUNT_NAME_MAX_CHARS: usize = 200;
const FIELD_LABEL_MAX_CHARS: usize = 100;
const FIELD_VALUE_MAX_BYTES: usize = 65_536;
const MULTILINE_VALUE_MAX_BYTES: usize = 1_048_576;
const URL_MAX_CHARS: usize = 2_048;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) struct EntityId([u8; 16]);

impl EntityId {
    pub(crate) fn new_v4() -> Self {
        Self(*Uuid::new_v4().as_bytes())
    }

    pub(crate) fn parse(value: &str) -> Result<Self, DomainError> {
        Uuid::parse_str(value)
            .map(|uuid| Self(*uuid.as_bytes()))
            .map_err(|_| DomainError::InvalidEntityId)
    }

    pub(crate) fn from_slice(value: &[u8]) -> Result<Self, DomainError> {
        let bytes: [u8; 16] = value.try_into().map_err(|_| DomainError::InvalidEntityId)?;
        Ok(Self(bytes))
    }

    pub(crate) fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }

    pub(crate) fn as_uuid_string(&self) -> String {
        Uuid::from_bytes(self.0).to_string()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ValidatedName {
    display: String,
    comparison_key: String,
}

impl ValidatedName {
    pub(crate) fn category(value: &str) -> Result<Self, DomainError> {
        Self::single_line(value, CATEGORY_NAME_MAX_CHARS)
    }

    pub(crate) fn website(value: &str) -> Result<Self, DomainError> {
        Self::single_line(value, WEBSITE_NAME_MAX_CHARS)
    }

    pub(crate) fn account(value: &str) -> Result<Self, DomainError> {
        Self::single_line(value, ACCOUNT_NAME_MAX_CHARS)
    }

    pub(crate) fn field_label(value: &str) -> Result<Self, DomainError> {
        Self::single_line(value, FIELD_LABEL_MAX_CHARS)
    }

    fn single_line(value: &str, max_chars: usize) -> Result<Self, DomainError> {
        let display = value.trim();
        if display.is_empty() {
            return Err(DomainError::NameRequired);
        }
        if display.chars().count() > max_chars {
            return Err(DomainError::NameTooLong { max_chars });
        }
        if display.chars().any(char::is_control) {
            return Err(DomainError::ControlCharacterNotAllowed);
        }

        Ok(Self {
            display: display.to_string(),
            comparison_key: normalize_for_comparison(display),
        })
    }

    pub(crate) fn display(&self) -> &str {
        &self.display
    }

    pub(crate) fn comparison_key(&self) -> &str {
        &self.comparison_key
    }
}

pub(crate) fn normalize_for_comparison(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}

pub(crate) fn validate_optional_url(value: Option<&str>) -> Result<Option<String>, DomainError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > URL_MAX_CHARS {
        return Err(DomainError::UrlTooLong);
    }
    let parsed = Url::parse(value).map_err(|_| DomainError::InvalidUrl)?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(DomainError::UrlSchemeNotAllowed);
    }
    if parsed.host_str().is_none() {
        return Err(DomainError::InvalidUrl);
    }
    Ok(Some(parsed.to_string()))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FieldType {
    Text,
    Password,
    Email,
    Url,
    Multiline,
}

impl FieldType {
    pub(crate) fn parse(value: &str) -> Result<Self, DomainError> {
        match value {
            "text" => Ok(Self::Text),
            "password" => Ok(Self::Password),
            "email" => Ok(Self::Email),
            "url" => Ok(Self::Url),
            "multiline" => Ok(Self::Multiline),
            _ => Err(DomainError::InvalidFieldType),
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Password => "password",
            Self::Email => "email",
            Self::Url => "url",
            Self::Multiline => "multiline",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum SystemRole {
    Username,
    Password,
    Email,
    Note,
}

impl SystemRole {
    pub(crate) fn parse_optional(value: Option<&str>) -> Result<Option<Self>, DomainError> {
        value
            .filter(|value| !value.is_empty())
            .map(|value| match value {
                "username" => Ok(Self::Username),
                "password" => Ok(Self::Password),
                "email" => Ok(Self::Email),
                "note" => Ok(Self::Note),
                _ => Err(DomainError::InvalidSystemRole),
            })
            .transpose()
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Username => "username",
            Self::Password => "password",
            Self::Email => "email",
            Self::Note => "note",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct FieldDraft {
    pub(crate) id: Option<EntityId>,
    pub(crate) system_role: Option<SystemRole>,
    pub(crate) label: ValidatedName,
    pub(crate) field_type: FieldType,
    pub(crate) value: Option<String>,
    pub(crate) keep_existing_value: bool,
    pub(crate) is_sensitive: bool,
}

impl FieldDraft {
    pub(crate) fn validate(
        id: Option<&str>,
        system_role: Option<&str>,
        label: &str,
        field_type: &str,
        value: Option<String>,
        keep_existing_value: bool,
        is_sensitive: bool,
    ) -> Result<Self, DomainError> {
        let id = id.map(EntityId::parse).transpose()?;
        let system_role = SystemRole::parse_optional(system_role)?;
        let field_type = FieldType::parse(field_type)?;
        if keep_existing_value && (id.is_none() || value.is_some()) {
            return Err(DomainError::InvalidFieldValueState);
        }
        if !keep_existing_value && value.is_none() {
            return Err(DomainError::InvalidFieldValueState);
        }
        let max_bytes = if field_type == FieldType::Multiline {
            MULTILINE_VALUE_MAX_BYTES
        } else {
            FIELD_VALUE_MAX_BYTES
        };
        if value.as_ref().is_some_and(|value| value.len() > max_bytes) {
            return Err(DomainError::FieldValueTooLong { max_bytes });
        }
        if (field_type == FieldType::Password || system_role == Some(SystemRole::Password))
            && !is_sensitive
        {
            return Err(DomainError::PasswordMustBeSensitive);
        }
        if system_role == Some(SystemRole::Email)
            && (field_type != FieldType::Email || is_sensitive)
        {
            return Err(DomainError::InvalidSystemFieldConfiguration);
        }
        if system_role == Some(SystemRole::Note)
            && (field_type != FieldType::Multiline || is_sensitive)
        {
            return Err(DomainError::InvalidSystemFieldConfiguration);
        }
        Ok(Self {
            id,
            system_role,
            label: ValidatedName::field_label(label)?,
            field_type,
            value,
            keep_existing_value,
            is_sensitive,
        })
    }
}

pub(crate) fn validate_field_set(fields: &[FieldDraft]) -> Result<(), DomainError> {
    let mut labels = HashSet::new();
    let mut roles = HashSet::new();
    for field in fields {
        if !labels.insert(field.label.comparison_key()) {
            return Err(DomainError::DuplicateFieldLabel);
        }
        if let Some(role) = field.system_role {
            if !roles.insert(role) {
                return Err(DomainError::DuplicateSystemRole);
            }
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Category {
    pub(crate) id: EntityId,
    pub(crate) vault_id: EntityId,
    pub(crate) name: String,
    pub(crate) sort_order: i64,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Website {
    pub(crate) id: EntityId,
    pub(crate) category_id: EntityId,
    pub(crate) name: String,
    pub(crate) primary_url: Option<String>,
    pub(crate) sort_order: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AccountSummary {
    pub(crate) id: EntityId,
    pub(crate) website_id: EntityId,
    pub(crate) display_name: String,
    pub(crate) summary: Option<String>,
    pub(crate) sort_order: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AccountField {
    pub(crate) id: EntityId,
    pub(crate) system_role: Option<SystemRole>,
    pub(crate) label: String,
    pub(crate) field_type: FieldType,
    pub(crate) value: Option<String>,
    pub(crate) is_sensitive: bool,
    pub(crate) sort_order: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AccountDetail {
    pub(crate) id: EntityId,
    pub(crate) website_id: EntityId,
    pub(crate) display_name: String,
    pub(crate) fields: Vec<AccountField>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SearchResult {
    pub(crate) kind: &'static str,
    pub(crate) id: EntityId,
    pub(crate) title: String,
    pub(crate) subtitle: String,
    pub(crate) category_id: EntityId,
    pub(crate) website_id: EntityId,
    pub(crate) account_id: Option<EntityId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TrashItem {
    pub(crate) group_id: EntityId,
    pub(crate) entity_type: String,
    pub(crate) entity_name: String,
    pub(crate) deleted_at: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum DomainError {
    InvalidEntityId,
    NameRequired,
    NameTooLong { max_chars: usize },
    ControlCharacterNotAllowed,
    InvalidUrl,
    UrlTooLong,
    UrlSchemeNotAllowed,
    InvalidFieldType,
    InvalidSystemRole,
    FieldValueTooLong { max_bytes: usize },
    PasswordMustBeSensitive,
    InvalidSystemFieldConfiguration,
    DuplicateFieldLabel,
    DuplicateSystemRole,
    InvalidFieldValueState,
    SearchQueryTooLong,
}

impl fmt::Display for DomainError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidEntityId => formatter.write_str("实体标识无效"),
            Self::NameRequired => formatter.write_str("名称不能为空"),
            Self::NameTooLong { max_chars } => {
                write!(formatter, "名称不能超过 {max_chars} 个字符")
            }
            Self::ControlCharacterNotAllowed => formatter.write_str("名称不能包含控制字符"),
            Self::InvalidUrl => formatter.write_str("网址必须是完整的绝对地址"),
            Self::UrlTooLong => formatter.write_str("网址不能超过 2048 个字符"),
            Self::UrlSchemeNotAllowed => formatter.write_str("只允许 http 或 https 网址"),
            Self::InvalidFieldType => formatter.write_str("字段类型无效"),
            Self::InvalidSystemRole => formatter.write_str("字段角色无效"),
            Self::FieldValueTooLong { max_bytes } => {
                write!(formatter, "字段内容不能超过 {max_bytes} 字节")
            }
            Self::PasswordMustBeSensitive => formatter.write_str("密码字段必须标记为敏感"),
            Self::InvalidSystemFieldConfiguration => {
                formatter.write_str("系统字段类型或敏感属性无效")
            }
            Self::DuplicateFieldLabel => formatter.write_str("同一账号内不能有重复字段名称"),
            Self::DuplicateSystemRole => formatter.write_str("同一账号内不能有重复系统字段"),
            Self::InvalidFieldValueState => formatter.write_str("字段值状态无效"),
            Self::SearchQueryTooLong => formatter.write_str("搜索内容不能超过 500 个字符"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_name_is_trimmed_and_normalized_for_comparison() {
        let name = ValidatedName::category("  Ｗｏｒｋ  ").unwrap();
        assert_eq!(name.display(), "Ｗｏｒｋ");
        assert_eq!(name.comparison_key(), "work");
    }

    #[test]
    fn category_name_rejects_empty_control_and_oversized_values() {
        assert_eq!(
            ValidatedName::category("   ").unwrap_err(),
            DomainError::NameRequired
        );
        assert_eq!(
            ValidatedName::category("work\nprivate").unwrap_err(),
            DomainError::ControlCharacterNotAllowed
        );
        assert!(matches!(
            ValidatedName::category(&"a".repeat(101)),
            Err(DomainError::NameTooLong { max_chars: 100 })
        ));
    }

    #[test]
    fn url_validation_accepts_http_and_rejects_dangerous_schemes() {
        assert_eq!(
            validate_optional_url(Some("https://example.test/login")).unwrap(),
            Some("https://example.test/login".to_string())
        );
        assert_eq!(
            validate_optional_url(Some("javascript:alert(1)")).unwrap_err(),
            DomainError::UrlSchemeNotAllowed
        );
    }

    #[test]
    fn password_fields_are_always_sensitive() {
        let error = FieldDraft::validate(
            None,
            Some("password"),
            "密码",
            "password",
            Some("secret".into()),
            false,
            false,
        )
        .unwrap_err();
        assert_eq!(error, DomainError::PasswordMustBeSensitive);
    }

    #[test]
    fn email_and_note_system_fields_have_fixed_safe_shapes() {
        let email_error = FieldDraft::validate(
            None,
            Some("email"),
            "主邮箱",
            "text",
            Some("demo@example.test".into()),
            false,
            false,
        )
        .unwrap_err();
        assert_eq!(email_error, DomainError::InvalidSystemFieldConfiguration);

        let note_error = FieldDraft::validate(
            None,
            Some("note"),
            "备注",
            "multiline",
            Some("仅供测试".into()),
            false,
            true,
        )
        .unwrap_err();
        assert_eq!(note_error, DomainError::InvalidSystemFieldConfiguration);

        assert!(FieldDraft::validate(
            None,
            Some("email"),
            "主邮箱",
            "email",
            Some("demo@example.test".into()),
            false,
            false,
        )
        .is_ok());
        assert!(FieldDraft::validate(
            None,
            Some("note"),
            "备注",
            "multiline",
            Some("仅供测试".into()),
            false,
            false,
        )
        .is_ok());
    }
}
