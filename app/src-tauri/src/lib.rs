pub mod commands;
pub mod model;
pub mod platform;
pub mod reminders;
pub mod repository;
pub mod service;
pub mod window_position;

use std::path::PathBuf;

use commands::AppState;
use platform::{
    cancel_focus_loss_hide, now_ms, save_panel_position, schedule_focus_loss_hide, setup_desktop,
    toggle_panel, WindowState,
};
use repository::TaskRepository;
use service::TaskService;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
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
            app.manage(AppState::new(TaskService::new(repository)));
            app.manage(WindowState::default());

            if let Some(message) = recovery_message {
                let _ = app
                    .notification()
                    .builder()
                    .title("Eternal 已安全恢复")
                    .body(message)
                    .show();
            }

            if let Err(error) = app.global_shortcut().on_shortcut(
                "CommandOrControl+Shift+Space",
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = toggle_panel(app);
                    }
                },
            ) {
                log::error!("failed to register global shortcut: {error}");
                let _ = app
                    .notification()
                    .builder()
                    .title("Eternal 快捷键不可用")
                    .body("⌘/Ctrl+Shift+Space 已被其他应用占用，仍可从状态栏打开 Eternal。")
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
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                save_panel_position(window.app_handle());
                let _ = window.hide();
            }
            tauri::WindowEvent::Focused(false) => schedule_focus_loss_hide(window.clone()),
            tauri::WindowEvent::Focused(true) => cancel_focus_loss_hide(window),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
