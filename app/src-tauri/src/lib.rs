pub mod commands;
pub mod model;
pub mod platform;
pub mod reminders;
pub mod repository;
pub mod service;
pub mod settings;
pub mod shortcut;
pub mod window_position;

use std::path::PathBuf;

use commands::{AppState, SettingsState};
use platform::{
    cancel_focus_loss_hide, hide_panel, now_ms, register_global_shortcut, schedule_focus_loss_hide,
    setup_desktop, WindowState,
};
use repository::TaskRepository;
use service::TaskService;
use settings::SettingsRepository;
use shortcut::RecordingGate;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_path: PathBuf = app.path().app_data_dir()?.join("tasks.json");
            let (repository, recovery_message) = match TaskRepository::load_or_recover(
                data_path.clone(),
                now_ms().unwrap_or_default(),
            ) {
                Ok((repository, Some(backup))) => {
                    let backup_name = backup
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("损坏数据备份");
                    (
                        repository,
                        Some(format!(
                            "原待办文件无法读取，已保留为 {backup_name}，现在使用空列表启动。"
                        )),
                    )
                }
                Ok((repository, None)) => (repository, None),
                Err(error) => {
                    log::error!("failed to load task data: {error}");
                    (
                        TaskRepository::empty(data_path),
                        Some(
                            "暂时无法读取原待办文件；Eternal 未修改它，并使用空列表启动。"
                                .to_string(),
                        ),
                    )
                }
            };
            let settings =
                SettingsRepository::load_or_default(app.path().app_data_dir()?.join("settings.json"));
            let stored_shortcut = settings.global_shortcut().to_string();

            let active_shortcut =
                match register_global_shortcut(app.handle(), &stored_shortcut) {
                    Ok(()) => Some(stored_shortcut.clone()),
                    Err(error) => {
                        log::error!(
                            "failed to register global shortcut {stored_shortcut}: {error}"
                        );
                        let _ = app
                            .notification()
                            .builder()
                            .title("Eternal 快捷键不可用")
                            .body(format!(
                                "{stored_shortcut} 已被其他应用占用，仍可从状态栏打开 Eternal，或在设置中换一个组合。"
                            ))
                            .show();
                        None
                    }
                };

            app.manage(AppState::new(TaskService::new(repository)));
            app.manage(SettingsState::new(settings, active_shortcut));
            app.manage(WindowState::default());
            app.manage(RecordingGate::default());

            if let Some(message) = recovery_message {
                let _ = app
                    .notification()
                    .builder()
                    .title("Eternal 已安全恢复")
                    .body(message)
                    .show();
            }

            setup_desktop(app)
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks,
            commands::create_task,
            commands::toggle_task,
            commands::set_reminder,
            commands::clear_reminder,
            commands::hide_panel,
            commands::get_global_shortcut,
            commands::set_global_shortcut,
            commands::set_shortcut_recording,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = hide_panel(window.app_handle());
            }
            tauri::WindowEvent::Focused(false) => schedule_focus_loss_hide(window.clone()),
            tauri::WindowEvent::Focused(true) => cancel_focus_loss_hide(window),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
