use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use rusqlite::Connection;
use tauri::{Emitter, Manager, WindowEvent};

mod commands;
mod domain;
mod repositories;
mod security;
mod security_controls;
mod storage;

struct VaultSession {
    connection: Option<Connection>,
    last_activity: Option<Instant>,
    settings: security_controls::SecuritySettings,
}

impl Default for VaultSession {
    fn default() -> Self {
        Self {
            connection: None,
            last_activity: None,
            settings: security_controls::SecuritySettings::default(),
        }
    }
}

impl VaultSession {
    fn mark_unlocked(&mut self, connection: Connection) {
        self.connection = Some(connection);
        self.last_activity = Some(Instant::now());
    }

    fn touch(&mut self) {
        if self.connection.is_some() {
            self.last_activity = Some(Instant::now());
        }
    }

    fn lock(&mut self) -> bool {
        self.last_activity = None;
        self.connection.take().is_some()
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
            let settings = security_controls::load_settings(app.handle()).unwrap_or_default();
            if let Ok(mut session) = app.state::<VaultState>().0.lock() {
                session.settings = settings;
            }
            let monitor_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let locked = {
                    let state = monitor_app.state::<VaultState>();
                    let Ok(mut session) = state.0.lock() else {
                        continue;
                    };
                    if session.connection.is_some()
                        && security_controls::idle_timeout_reached(
                            session.last_activity,
                            Instant::now(),
                            &session.settings,
                        )
                    {
                        session.lock()
                    } else {
                        false
                    }
                };
                if locked {
                    let _ = monitor_app.emit("vault-locked", "idle_timeout");
                }
            });
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if !matches!(event, WindowEvent::Focused(false)) {
                return;
            }
            let locked = {
                let state = window.state::<VaultState>();
                let Ok(mut session) = state.0.lock() else {
                    return;
                };
                if session.settings.lock_on_focus_loss {
                    session.lock()
                } else {
                    false
                }
            };
            if locked {
                let _ = window.app_handle().emit("vault-locked", "focus_lost");
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::create_vault,
            commands::unlock_vault,
            commands::lock_vault,
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
            commands::search_vault,
            commands::list_trash,
            commands::restore_deletion_group,
            commands::reveal_field,
            commands::copy_field,
            commands::copy_website_url,
            commands::get_website_url,
            commands::record_activity,
            commands::get_security_settings,
            commands::update_security_settings,
            commands::list_backups,
            commands::create_backup,
            commands::verify_backup,
            commands::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running local vault");
}

#[cfg(test)]
mod tests;
