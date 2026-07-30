use std::{
    fs,
    path::PathBuf,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "security-settings.json";
const MAX_SETTINGS_BYTES: u64 = 16 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SecuritySettings {
    pub(crate) auto_lock_minutes: u64,
    pub(crate) clipboard_clear_seconds: u64,
    pub(crate) lock_on_focus_loss: bool,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            auto_lock_minutes: 5,
            clipboard_clear_seconds: 30,
            lock_on_focus_loss: true,
        }
    }
}

impl SecuritySettings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if !(1..=60).contains(&self.auto_lock_minutes) {
            return Err("自动锁定时间必须在 1 到 60 分钟之间".into());
        }
        if !(5..=300).contains(&self.clipboard_clear_seconds) {
            return Err("剪贴板清理时间必须在 5 到 300 秒之间".into());
        }
        Ok(())
    }

    pub(crate) fn auto_lock_duration(&self) -> Duration {
        Duration::from_secs(self.auto_lock_minutes * 60)
    }
}

pub(crate) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join(SETTINGS_FILE))
        .map_err(|_| "无法确定安全设置路径".to_string())
}

pub(crate) fn load_settings(app: &AppHandle) -> Result<SecuritySettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(SecuritySettings::default());
    }
    let metadata = fs::metadata(&path).map_err(|_| "无法读取安全设置".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_SETTINGS_BYTES {
        return Err("安全设置文件大小无效".into());
    }
    let settings: SecuritySettings =
        serde_json::from_slice(&fs::read(&path).map_err(|_| "无法读取安全设置".to_string())?)
            .map_err(|_| "安全设置文件无效".to_string())?;
    settings.validate()?;
    Ok(settings)
}

pub(crate) fn save_settings(app: &AppHandle, settings: &SecuritySettings) -> Result<(), String> {
    settings.validate()?;
    let path = settings_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "安全设置路径无效".to_string())?;
    fs::create_dir_all(directory).map_err(|_| "无法创建安全设置目录".to_string())?;
    let temporary = directory.join("security-settings.json.writing");
    let bytes = serde_json::to_vec_pretty(settings).map_err(|_| "无法生成安全设置".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "无法写入安全设置".to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|_| "无法更新安全设置".to_string())?;
    }
    fs::rename(&temporary, &path).map_err(|_| "无法提交安全设置".to_string())
}

pub(crate) fn idle_timeout_reached(
    last_activity: Option<Instant>,
    now: Instant,
    settings: &SecuritySettings,
) -> bool {
    last_activity
        .and_then(|last| now.checked_duration_since(last))
        .is_some_and(|elapsed| elapsed >= settings.auto_lock_duration())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_reject_unsafe_ranges() {
        let mut settings = SecuritySettings::default();
        settings.auto_lock_minutes = 0;
        assert!(settings.validate().is_err());
        settings.auto_lock_minutes = 5;
        settings.clipboard_clear_seconds = 301;
        assert!(settings.validate().is_err());
    }

    #[test]
    fn idle_timeout_uses_last_activity_and_configured_duration() {
        let now = Instant::now();
        let settings = SecuritySettings {
            auto_lock_minutes: 1,
            ..SecuritySettings::default()
        };
        assert!(!idle_timeout_reached(None, now, &settings));
        assert!(!idle_timeout_reached(
            Some(now - Duration::from_secs(59)),
            now,
            &settings
        ));
        assert!(idle_timeout_reached(
            Some(now - Duration::from_secs(60)),
            now,
            &settings
        ));
    }
}
