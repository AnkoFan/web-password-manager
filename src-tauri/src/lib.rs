use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

mod commands;
mod domain;
#[cfg(windows)]
mod dpapi;
mod password_generator;
mod repositories;
mod settings;
mod storage;

struct VaultSession {
    connection: Option<Connection>,
    settings: settings::AppSettings,
}

impl Default for VaultSession {
    fn default() -> Self {
        Self {
            connection: None,
            settings: settings::AppSettings::default(),
        }
    }
}

struct VaultState(Mutex<VaultSession>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultState(Mutex::new(VaultSession::default())))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = settings::load_settings(app.handle()).unwrap_or_default();
            if let Ok(mut session) = app.state::<VaultState>().0.lock() {
                session.settings = settings;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::list_categories,
            commands::create_category,
            commands::rename_category,
            commands::delete_category,
            commands::list_websites,
            commands::save_website,
            commands::delete_website,
            commands::list_accounts,
            commands::get_account,
            commands::save_account,
            commands::delete_account,
            commands::generate_password,
            commands::search_vault,
            commands::list_trash,
            commands::restore_deletion_group,
            commands::reveal_field,
            commands::copy_field,
            commands::copy_website_url,
            commands::get_website_url,
            commands::get_app_settings,
            commands::update_app_settings,
            commands::list_backups,
            commands::create_backup,
            commands::verify_backup,
            commands::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running local password manager");
}
