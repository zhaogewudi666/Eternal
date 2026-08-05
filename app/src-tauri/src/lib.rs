pub mod autostart_config;
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

use autostart_config::{should_show_initial_panel, AUTOSTART_FLAG};
use commands::{AppState, SettingsState};
use platform::{
    cancel_focus_loss_hide, hide_panel, now_ms, register_global_shortcut, schedule_focus_loss_hide,
    setup_desktop, show_panel, WindowState,
};
use repository::{secondary_instance_should_focus_existing_main, TaskRepository};
use service::TaskService;
use settings::SettingsRepository;
use shortcut::RecordingGate;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Single-instance must register before any window/task setup side effects.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if secondary_instance_should_focus_existing_main() {
                let _ = show_panel(app);
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_process::init());

    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir: PathBuf = app.path().app_data_dir()?;
            let app_version = app.package_info().version.to_string();
            let (repository, recovery_message) = match TaskRepository::bootstrap(
                app_data_dir.clone(),
                &app_version,
                now_ms().unwrap_or_default(),
            ) {
                Ok((repository, report)) => (repository, report.recovery_message),
                Err(error) => {
                    log::error!("failed to load task data: {error}");
                    let tasks_path = app_data_dir.join("tasks.json");
                    // Never fall back to a writable empty repository over an existing
                    // canonical file (higher schema or hard read failure) — that path
                    // used to rewrite on-disk data and lose user tasks.
                    let repository = TaskRepository::for_startup_failure(tasks_path, &error);
                    (repository, Some(error.to_string()))
                }
            };
            let settings =
                SettingsRepository::load_or_default(app_data_dir.join("settings.json"));
            let stored_shortcut = settings.global_shortcut().to_string();
            let panel_pinned = settings.panel_pinned();

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
            app.manage(WindowState::new(panel_pinned));
            app.manage(RecordingGate::default());

            if let Some(message) = recovery_message {
                let _ = app
                    .notification()
                    .builder()
                    .title("Eternal 数据提示")
                    .body(message)
                    .show();
            }

            let show_initial_panel = should_show_initial_panel(std::env::args());
            setup_desktop(app, show_initial_panel)
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks,
            commands::create_task,
            commands::toggle_task,
            commands::delete_task,
            commands::set_reminder,
            commands::clear_reminder,
            commands::rename_task,
            commands::hide_panel,
            commands::get_global_shortcut,
            commands::set_global_shortcut,
            commands::set_shortcut_recording,
            commands::get_panel_pinned,
            commands::set_panel_pinned,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = hide_panel(window.app_handle());
                }
                tauri::WindowEvent::Focused(false) => schedule_focus_loss_hide(window.clone()),
                tauri::WindowEvent::Focused(true) => cancel_focus_loss_hide(window),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
