use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

mod commands;
mod domain;
#[cfg(windows)]
mod dpapi;
mod password_generator;
mod repositories;
mod settings;
mod storage;
mod website_metadata;

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

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

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

            let open_item = MenuItem::with_id(
                app,
                "tray-open",
                "打开 WebPasswordManager",
                true,
                None::<&str>,
            )?;
            let exit_item = MenuItem::with_id(app, "tray-exit", "退出程序", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &exit_item])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("WebPasswordManager")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray-open" => show_main_window(app),
                    "tray-exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let behavior = window
                    .state::<VaultState>()
                    .0
                    .lock()
                    .map(|session| session.settings.close_behavior)
                    .unwrap_or_default();
                match behavior {
                    settings::CloseBehavior::Ask => {
                        let _ = window.emit("app-close-requested", ());
                    }
                    settings::CloseBehavior::Exit => window.app_handle().exit(0),
                    settings::CloseBehavior::MinimizeToTray => {
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::list_categories,
            commands::create_category,
            commands::rename_category,
            commands::delete_category,
            commands::list_websites,
            commands::save_website,
            commands::resolve_website_name,
            commands::delete_website,
            commands::list_accounts,
            commands::get_account,
            commands::save_account,
            commands::delete_account,
            commands::generate_password,
            commands::search_vault,
            commands::list_trash,
            commands::restore_deletion_group,
            commands::restore_deletion_groups,
            commands::permanently_delete_groups,
            commands::reveal_field,
            commands::copy_field,
            commands::copy_website_url,
            commands::get_website_url,
            commands::get_app_settings,
            commands::update_app_settings,
            commands::apply_close_action,
            commands::list_backups,
            commands::create_backup,
            commands::verify_backup,
            commands::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running local password manager");
}
