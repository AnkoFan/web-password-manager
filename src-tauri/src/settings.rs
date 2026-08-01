use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "app-settings.json";
const MAX_SETTINGS_BYTES: u64 = 16 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettings {
    pub(crate) clipboard_clear_seconds: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            clipboard_clear_seconds: 30,
        }
    }
}

impl AppSettings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if !(5..=300).contains(&self.clipboard_clear_seconds) {
            return Err("剪贴板清理时间必须在 5 到 300 秒之间".into());
        }
        Ok(())
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join(SETTINGS_FILE))
        .map_err(|_| "无法确定设置路径".to_string())
}

pub(crate) fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let metadata = fs::metadata(&path).map_err(|_| "无法读取设置".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_SETTINGS_BYTES {
        return Err("设置文件大小无效".into());
    }
    let settings: AppSettings =
        serde_json::from_slice(&fs::read(&path).map_err(|_| "无法读取设置".to_string())?)
            .map_err(|_| "设置文件无效".to_string())?;
    settings.validate()?;
    Ok(settings)
}

pub(crate) fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    settings.validate()?;
    let path = settings_path(app)?;
    let directory = path.parent().ok_or_else(|| "设置路径无效".to_string())?;
    fs::create_dir_all(directory).map_err(|_| "无法创建设置目录".to_string())?;
    let temporary = directory.join("app-settings.json.writing");
    let bytes = serde_json::to_vec_pretty(settings).map_err(|_| "无法生成设置".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "无法写入设置".to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|_| "无法更新设置".to_string())?;
    }
    fs::rename(&temporary, &path).map_err(|_| "无法提交设置".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_reject_invalid_clipboard_timeout() {
        let mut settings = AppSettings::default();
        settings.clipboard_clear_seconds = 301;
        assert!(settings.validate().is_err());
    }
}
