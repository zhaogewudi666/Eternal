use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use crate::model::Task;
use crate::platform::save_panel_position;
use crate::service::TaskService;

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
pub fn hide_panel(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    save_panel_position(&app);
    window.hide().map_err(|error| error.to_string())
}
