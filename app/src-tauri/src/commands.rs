use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::model::Task;
use crate::platform::{
    apply_global_shortcut, hide_panel as hide_desktop_panel, revert_global_shortcut,
};
use crate::service::TaskService;
use crate::settings::SettingsRepository;
use crate::shortcut::RecordingGate;

pub struct AppState {
    pub(crate) service: Mutex<TaskService>,
}

impl AppState {
    pub fn new(service: TaskService) -> Self {
        Self {
            service: Mutex::new(service),
        }
    }
}

pub struct SettingsState {
    runtime: Mutex<ShortcutRuntime>,
}

impl SettingsState {
    pub fn new(settings: SettingsRepository, active_shortcut: Option<String>) -> Self {
        Self {
            runtime: Mutex::new(ShortcutRuntime {
                settings,
                active_shortcut,
            }),
        }
    }
}

struct ShortcutRuntime {
    settings: SettingsRepository,
    active_shortcut: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutStatus {
    accelerator: String,
    registered: bool,
}

fn now_ms() -> Result<i64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间无效：{error}"))?;
    i64::try_from(elapsed.as_millis()).map_err(|_| "系统时间超出支持范围".to_string())
}

fn with_service<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&mut TaskService) -> Result<T, String>,
) -> Result<T, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "待办服务暂时不可用".to_string())?;
    operation(&mut service)
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    with_service(&state, |service| Ok(service.list()))
}

#[tauri::command]
pub fn create_task(title: String, state: State<'_, AppState>) -> Result<Task, String> {
    let timestamp = now_ms()?;
    with_service(&state, |service| service.create(&title, timestamp))
}

#[tauri::command]
pub fn toggle_task(id: String, state: State<'_, AppState>) -> Result<Task, String> {
    let timestamp = now_ms()?;
    with_service(&state, |service| service.toggle(&id, timestamp))
}

#[tauri::command]
pub fn set_reminder(
    id: String,
    next_at_ms: i64,
    repeat_every_minutes: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    with_service(&state, |service| {
        service.set_reminder(&id, next_at_ms, repeat_every_minutes)
    })
}

#[tauri::command]
pub fn clear_reminder(id: String, state: State<'_, AppState>) -> Result<Task, String> {
    with_service(&state, |service| service.clear_reminder(&id))
}

#[tauri::command]
pub fn delete_task(id: String, state: State<'_, AppState>) -> Result<(), String> {
    with_service(&state, |service| service.delete(&id))
}

#[tauri::command]
pub fn get_global_shortcut(
    state: State<'_, SettingsState>,
) -> Result<GlobalShortcutStatus, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "设置暂时不可用".to_string())?;
    Ok(GlobalShortcutStatus {
        accelerator: runtime
            .active_shortcut
            .clone()
            .unwrap_or_else(|| runtime.settings.global_shortcut().to_string()),
        registered: runtime.active_shortcut.is_some(),
    })
}

/// Validates, rebinds, and persists a new panel accelerator. Any failure leaves
/// the previously registered and stored shortcut untouched whenever the
/// operating system allows the rollback.
#[tauri::command]
pub fn set_global_shortcut(
    accelerator: String,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<String, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "设置暂时不可用".to_string())?;
    let previous = runtime.active_shortcut.clone();

    let applied = apply_global_shortcut(&app, previous.as_deref(), &accelerator)
        .map_err(|error| error.to_string())?;
    if previous.as_deref() == Some(applied.as_str()) {
        return Ok(applied);
    }

    if let Err(error) = runtime.settings.set_global_shortcut(applied.clone()) {
        let live = revert_global_shortcut(&app, &applied, previous.as_deref());
        let recovered = live == previous;
        runtime.active_shortcut = live.clone();

        if recovered {
            return Err(format!("快捷键未能保存，已恢复原设置：{error}"));
        }

        let live_label = live.as_deref().unwrap_or("未设置");
        return Err(format!(
            "快捷键未能保存，且系统未能恢复原组合。当前临时使用 {live_label}；重启后会再读取已保存的设置。原因：{error}"
        ));
    }

    runtime.active_shortcut = Some(applied.clone());
    Ok(applied)
}

/// Silences the panel toggle while the settings popover captures keys.
#[tauri::command]
pub fn set_shortcut_recording(recording: bool, gate: State<'_, RecordingGate>) {
    gate.set_recording(recording);
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) -> Result<(), String> {
    hide_desktop_panel(&app).map_err(|error| error.to_string())
}
