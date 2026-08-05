use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::model::Task;
use crate::platform::{
    apply_global_shortcut, hide_panel as hide_desktop_panel, revert_global_shortcut, WindowState,
};
use crate::service::TaskService;
use crate::settings::SettingsRepository;
use crate::shortcut::RecordingGate;

pub struct AppState {
    pub(crate) service: Mutex<TaskService>,
    tasks_revision: AtomicU64,
}

impl AppState {
    pub fn new(service: TaskService) -> Self {
        Self {
            service: Mutex::new(service),
            tasks_revision: AtomicU64::new(0),
        }
    }

    pub fn tasks_revision(&self) -> u64 {
        self.tasks_revision.load(Ordering::SeqCst)
    }

    pub fn bump_and_emit_tasks_changed(&self, app: &AppHandle) {
        let revision = self.tasks_revision.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = app.emit("tasks-changed", TasksChangedPayload { revision });
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

    pub fn panel_pinned(&self) -> Result<bool, String> {
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| "设置暂时不可用".to_string())?;
        Ok(runtime.settings.panel_pinned())
    }

    pub fn set_panel_pinned(
        &self,
        pinned: bool,
        window_state: &WindowState,
    ) -> Result<bool, String> {
        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "设置暂时不可用".to_string())?;
        runtime
            .settings
            .set_panel_pinned(pinned)
            .map_err(|error| format!("钉板设置未能保存：{error}"))?;
        window_state.set_pinned(pinned);
        Ok(pinned)
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TasksChangedPayload {
    revision: u64,
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
pub fn create_task(
    title: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let timestamp = now_ms()?;
    let task = with_service(&state, |service| service.create(&title, timestamp))?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn toggle_task(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<Task, String> {
    let timestamp = now_ms()?;
    let task = with_service(&state, |service| service.toggle(&id, timestamp))?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn set_reminder(
    id: String,
    next_at_ms: i64,
    repeat_every_minutes: Option<u32>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let task = with_service(&state, |service| {
        service.set_reminder(&id, next_at_ms, repeat_every_minutes)
    })?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn clear_reminder(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let task = with_service(&state, |service| service.clear_reminder(&id))?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn rename_task(
    id: String,
    title: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let task = with_service(&state, |service| service.rename(&id, &title))?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn delete_task(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    with_service(&state, |service| service.delete(&id))?;
    state.bump_and_emit_tasks_changed(&app);
    Ok(())
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
pub fn get_panel_pinned(state: State<'_, SettingsState>) -> Result<bool, String> {
    state.panel_pinned()
}

#[tauri::command]
pub fn set_panel_pinned(
    pinned: bool,
    settings: State<'_, SettingsState>,
    window_state: State<'_, WindowState>,
) -> Result<bool, String> {
    settings.set_panel_pinned(pinned, &window_state)
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) -> Result<(), String> {
    hide_desktop_panel(&app).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::atomic::Ordering;

    use crate::model::Task;
    use crate::platform::WindowState;
    use crate::repository::TaskRepository;
    use crate::service::TaskService;
    use crate::settings::SettingsRepository;

    use super::{AppState, SettingsState};

    fn test_path(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "eternal-command-settings-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        root.join("settings.json")
    }

    #[test]
    fn saving_a_pin_updates_runtime_only_after_it_is_durable() {
        let path = test_path("pin-success");
        let state = SettingsState::new(SettingsRepository::load_or_default(path.clone()), None);
        let window_state = WindowState::new(false);

        assert!(state
            .set_panel_pinned(true, &window_state)
            .expect("pin save succeeds"));

        assert!(window_state.is_pinned());
        assert!(SettingsRepository::load_or_default(path).panel_pinned());
    }

    #[test]
    fn a_failed_pin_save_keeps_the_runtime_state_unchanged() {
        let unwritable_path = test_path("pin-failure-parent");
        fs::create_dir_all(&unwritable_path).expect("make settings path a directory");
        let state = SettingsState::new(SettingsRepository::load_or_default(unwritable_path), None);
        let window_state = WindowState::new(false);

        let error = state
            .set_panel_pinned(true, &window_state)
            .expect_err("directory cannot be replaced by settings file");

        assert!(error.contains("无法") || !error.is_empty());
        assert!(!window_state.is_pinned());
        assert!(!state.panel_pinned().expect("read runtime state"));
    }

    #[test]
    fn task_mutations_bump_a_monotonic_revision() {
        let root =
            std::env::temp_dir().join(format!("eternal-command-revision-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("dir");
        let repository = TaskRepository::empty(root.join("tasks.json"));
        let state = AppState::new(TaskService::new(repository));
        assert_eq!(state.tasks_revision(), 0);

        {
            let mut service = state.service.lock().expect("lock");
            let _ = service.create("修订", 1).expect("create");
        }
        state.tasks_revision.fetch_add(1, Ordering::SeqCst);
        assert_eq!(state.tasks_revision(), 1);

        let _tasks: Vec<Task> = state.service.lock().expect("lock").list();
        assert_eq!(state.tasks_revision(), 1);
    }
}
