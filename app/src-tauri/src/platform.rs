use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

use crate::commands::AppState;
use crate::reminders::collect_due;
use crate::shortcut::{rebind, revert, RecordingGate, ShortcutBinder, ShortcutError};
use crate::window_position::{clamp_to_visible, MonitorBounds, Point, Size};

const REMINDER_POLL_INTERVAL: Duration = Duration::from_secs(15);
const FOCUS_LOSS_HIDE_DELAY: Duration = Duration::from_millis(200);
pub const WIDGET_LABEL: &str = "widget";
pub const MAIN_LABEL: &str = "main";
const WIDGET_WIDTH: f64 = 240.0;
const WIDGET_HEIGHT: f64 = 340.0;

#[derive(Default)]
pub struct WindowState {
    auto_hide: Mutex<AutoHideState>,
}

#[derive(Default)]
struct AutoHideState {
    next_token: u64,
    pending: Option<u64>,
    pinned: bool,
}

impl WindowState {
    pub fn new(pinned: bool) -> Self {
        Self {
            auto_hide: Mutex::new(AutoHideState {
                pinned,
                ..AutoHideState::default()
            }),
        }
    }

    pub fn begin_auto_hide(&self) -> Option<u64> {
        let Ok(mut auto_hide) = self.auto_hide.lock() else {
            return None;
        };
        if auto_hide.pinned {
            return None;
        }
        auto_hide.next_token = auto_hide.next_token.wrapping_add(1);
        let token = auto_hide.next_token;
        auto_hide.pending = Some(token);
        Some(token)
    }

    pub fn cancel_auto_hide(&self) {
        if let Ok(mut auto_hide) = self.auto_hide.lock() {
            auto_hide.pending = None;
        }
    }

    pub fn take_pending_auto_hide(&self, token: u64) -> bool {
        let Ok(mut auto_hide) = self.auto_hide.lock() else {
            return false;
        };
        if auto_hide.pending == Some(token) {
            auto_hide.pending = None;
            true
        } else {
            false
        }
    }

    pub fn is_pinned(&self) -> bool {
        self.auto_hide
            .lock()
            .map(|auto_hide| auto_hide.pinned)
            .unwrap_or(false)
    }

    pub fn set_pinned(&self, pinned: bool) {
        if let Ok(mut auto_hide) = self.auto_hide.lock() {
            auto_hide.pinned = pinned;
            if pinned {
                auto_hide.pending = None;
            }
        }
    }
}

pub(crate) fn now_ms() -> Option<i64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    i64::try_from(millis).ok()
}

#[derive(Clone, Serialize)]
struct PanelShownPayload {
    reason: &'static str,
}

pub fn show_panel(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        // macOS keeps the whole process hidden after `hide_panel`, so the window
        // would stay invisible until the application itself is unhidden.
        #[cfg(target_os = "macos")]
        app.show()?;
        window.show()?;
        window.set_focus()?;
        // Explicit reopen signal for the frontend — not ordinary temporary focus.
        let _ = app.emit("panel-shown", PanelShownPayload { reason: "show" });
    }
    Ok(())
}

/// Hides the panel without changing application activation. This is the safe
/// path after the user has already focused another application.
pub fn conceal_panel(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return Ok(());
    };

    save_window_positions(app);
    window.hide()?;

    if let Some(gate) = app.try_state::<RecordingGate>() {
        gate.set_recording(false);
    }

    Ok(())
}

fn widget_is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(WIDGET_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// Hides the panel and, on macOS, hands the keyboard focus back to whichever
/// application the user came from instead of leaving the menu bar app active.
/// When the desktop widget remains visible, only `main` is hidden.
pub fn hide_panel(app: &AppHandle) -> tauri::Result<()> {
    conceal_panel(app)?;

    #[cfg(target_os = "macos")]
    if !widget_is_visible(app) {
        app.hide()?;
    }

    Ok(())
}

pub fn save_panel_position(app: &AppHandle) {
    save_window_positions(app);
}

pub fn save_window_positions(app: &AppHandle) {
    // Plugin persists each labeled window (main + widget) by its label.
    if let Err(error) = app.save_window_state(StateFlags::POSITION) {
        log::error!("failed to save window positions: {error}");
    }
}

pub fn toggle_panel(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return Ok(());
    };

    if window.is_visible()? {
        hide_panel(app)
    } else {
        show_panel(app)
    }
}

/// Desired desktop-widget window policy used by tests and builders.
pub fn widget_window_policy() -> WidgetWindowPolicy {
    WidgetWindowPolicy {
        label: WIDGET_LABEL,
        width: WIDGET_WIDTH,
        height: WIDGET_HEIGHT,
        always_on_bottom: true,
        always_on_top: false,
        skip_taskbar: true,
        decorations: false,
        resizable: false,
        focused_on_create: false,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct WidgetWindowPolicy {
    pub label: &'static str,
    pub width: f64,
    pub height: f64,
    pub always_on_bottom: bool,
    pub always_on_top: bool,
    pub skip_taskbar: bool,
    pub decorations: bool,
    pub resizable: bool,
    pub focused_on_create: bool,
}

/// Creates or shows the opt-in desktop widget. Idempotent when already open.
pub fn ensure_widget_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WIDGET_LABEL) {
        window.show()?;
        let _ = window.set_always_on_bottom(true);
        return Ok(());
    }

    let policy = widget_window_policy();
    let window = WebviewWindowBuilder::new(
        app,
        policy.label,
        WebviewUrl::App("index.html?window=widget".into()),
    )
    .title("Eternal 桌面组件")
    .inner_size(policy.width, policy.height)
    .min_inner_size(policy.width, policy.height)
    .max_inner_size(policy.width, policy.height)
    .resizable(policy.resizable)
    .decorations(policy.decorations)
    .transparent(true)
    .always_on_bottom(policy.always_on_bottom)
    .skip_taskbar(policy.skip_taskbar)
    .visible(false)
    .focused(policy.focused_on_create)
    .build()?;

    let _ = window.restore_state(StateFlags::POSITION);
    clamp_panel_position(&window)?;
    window.show()?;
    let _ = window.set_always_on_bottom(true);
    Ok(())
}

/// Hides and destroys the widget window after persisting its position.
pub fn close_widget_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(WIDGET_LABEL) else {
        return Ok(());
    };
    save_window_positions(app);
    window.hide()?;
    window.close()?;
    Ok(())
}

pub fn set_widget_visible(app: &AppHandle, enabled: bool) -> tauri::Result<()> {
    if enabled {
        ensure_widget_window(app)
    } else {
        close_widget_window(app)
    }
}

fn toggle_panel_from_tray(app: &AppHandle) -> tauri::Result<()> {
    app.state::<WindowState>().cancel_auto_hide();
    toggle_panel(app)
}

/// Binds Eternal's panel toggle to an accelerator through the global shortcut
/// plugin. The pure transaction lives in `shortcut::rebind`; this only performs
/// the side effects it asks for.
pub struct AppShortcutBinder<'a> {
    app: &'a AppHandle,
}

impl<'a> AppShortcutBinder<'a> {
    pub fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }
}

impl ShortcutBinder for AppShortcutBinder<'_> {
    fn register(&self, accelerator: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .on_shortcut(accelerator, |app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                let recording = app
                    .try_state::<RecordingGate>()
                    .is_some_and(|gate| gate.is_recording());
                if recording {
                    return;
                }
                let _ = toggle_panel(app);
            })
            .map_err(|error| error.to_string())
    }

    fn unregister(&self, accelerator: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .unregister(accelerator)
            .map_err(|error| error.to_string())
    }
}

/// Swaps the live global shortcut, keeping `current` registered on any failure.
pub fn apply_global_shortcut(
    app: &AppHandle,
    active: Option<&str>,
    requested: &str,
) -> Result<String, ShortcutError> {
    rebind(&AppShortcutBinder::new(app), active, requested)
}

/// Restores the binding that was live before a successful rebind whose settings
/// write later failed, and reports what is actually registered after recovery.
pub fn revert_global_shortcut(
    app: &AppHandle,
    applied: &str,
    previous: Option<&str>,
) -> Option<String> {
    revert(&AppShortcutBinder::new(app), applied, previous)
}

/// Claims the stored accelerator during startup, when nothing is registered yet.
pub fn register_global_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    AppShortcutBinder::new(app).register(accelerator)
}

pub fn schedule_focus_loss_hide(window: tauri::Window) {
    let Some(state) = window.app_handle().try_state::<WindowState>() else {
        return;
    };
    let Some(token) = state.begin_auto_hide() else {
        return;
    };

    thread::spawn(move || {
        thread::sleep(FOCUS_LOSS_HIDE_DELAY);
        let Some(state) = window.app_handle().try_state::<WindowState>() else {
            return;
        };
        if state.take_pending_auto_hide(token) {
            let _ = conceal_panel(window.app_handle());
        }
    });
}

pub fn cancel_focus_loss_hide(window: &tauri::Window) {
    if let Some(state) = window.app_handle().try_state::<WindowState>() {
        state.cancel_auto_hide();
    }
}

/// Wires tray/menu bar, window position, and the reminder scheduler.
/// When `show_initial_panel` is false (login-item / `--autostart`), the panel
/// stays hidden and unfocused while the rest of the desktop shell still runs.
pub fn setup_desktop(
    app: &mut App,
    show_initial_panel: bool,
    widget_enabled: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let show_item = MenuItem::with_id(app, "show", "显示 Eternal", true, None::<&str>)?;
    let widget_item = MenuItem::with_id(
        app,
        "toggle-widget",
        if widget_enabled {
            "隐藏桌面组件"
        } else {
            "显示桌面组件"
        },
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 Eternal", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &widget_item, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("eternal")
        .tooltip("Eternal 待办")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_panel(app);
            }
            "toggle-widget" => {
                if let Some(settings) = app.try_state::<crate::commands::SettingsState>() {
                    let currently = settings.widget_enabled().unwrap_or(false);
                    let desired = !currently;
                    match settings.set_widget_enabled(desired) {
                        Ok(_) => {
                            if let Err(error) = set_widget_visible(app, desired) {
                                log::error!("failed to toggle widget from tray: {error}");
                                let _ = settings.set_widget_enabled(currently);
                            }
                        }
                        Err(error) => log::error!("failed to persist widget setting: {error}"),
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle_panel_from_tray(tray.app_handle());
            }
        });

    #[cfg(target_os = "macos")]
    {
        tray = tray.icon(tauri::include_image!("icons/tray-icon-64.png"));
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;

    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        window.restore_state(StateFlags::POSITION)?;
        clamp_panel_position(&window)?;
    }

    start_reminder_scheduler(app.handle().clone());
    if widget_enabled {
        if let Err(error) = ensure_widget_window(app.handle()) {
            log::error!("failed to open desktop widget on startup: {error}");
        }
    }
    if show_initial_panel {
        show_panel(app.handle())?;
    }
    Ok(())
}

fn clamp_panel_position(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let monitors = window
        .available_monitors()?
        .into_iter()
        .map(|monitor| MonitorBounds {
            origin: Point {
                x: monitor.position().x,
                y: monitor.position().y,
            },
            size: Size {
                width: monitor.size().width,
                height: monitor.size().height,
            },
        })
        .collect::<Vec<_>>();

    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let current = Point {
        x: position.x,
        y: position.y,
    };
    let safe = clamp_to_visible(
        current,
        Size {
            width: size.width,
            height: size.height,
        },
        &monitors,
    );

    if safe != current {
        window.set_position(tauri::PhysicalPosition::new(safe.x, safe.y))?;
    }

    Ok(())
}

fn start_reminder_scheduler(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(REMINDER_POLL_INTERVAL);

        let Some(timestamp) = now_ms() else {
            continue;
        };
        let state = app.state::<AppState>();
        let due = {
            let Ok(mut service) = state.service.lock() else {
                log::error!("task service mutex was poisoned");
                continue;
            };
            let mut tasks = service.list();
            let due = collect_due(&mut tasks, timestamp);
            if due.is_empty() {
                due
            } else if let Err(error) = service.replace_all(tasks) {
                log::error!("failed to persist reminder state: {error}");
                Vec::new()
            } else {
                state.bump_and_emit_tasks_changed(&app);
                due
            }
        };

        for reminder in due {
            if let Err(error) = app
                .notification()
                .builder()
                .title("Eternal 提醒")
                .body(reminder.title)
                .show()
            {
                log::error!("failed to show reminder notification: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::WindowState;

    #[test]
    fn tray_click_cancels_a_pending_focus_loss_hide() {
        let state = WindowState::default();
        let token = state
            .begin_auto_hide()
            .expect("unpinned panel schedules hide");

        state.cancel_auto_hide();

        assert!(!state.take_pending_auto_hide(token));
    }

    #[test]
    fn an_uncancelled_focus_loss_hides_only_once() {
        let state = WindowState::default();
        let token = state
            .begin_auto_hide()
            .expect("unpinned panel schedules hide");

        assert!(state.take_pending_auto_hide(token));
        assert!(!state.take_pending_auto_hide(token));
    }

    #[test]
    fn a_pinned_panel_never_schedules_focus_loss_hide() {
        let state = WindowState::new(true);

        assert!(state.begin_auto_hide().is_none());
        assert!(state.is_pinned());
    }

    #[test]
    fn pinning_cancels_a_focus_loss_hide_that_is_already_pending() {
        let state = WindowState::new(false);
        let token = state
            .begin_auto_hide()
            .expect("unpinned panel schedules hide");

        state.set_pinned(true);

        assert!(state.is_pinned());
        assert!(!state.take_pending_auto_hide(token));
    }

    #[test]
    fn desktop_widget_policy_is_always_on_bottom_and_compact() {
        let policy = super::widget_window_policy();
        assert_eq!(policy.label, "widget");
        assert_eq!(policy.width, 240.0);
        assert_eq!(policy.height, 340.0);
        assert!(policy.always_on_bottom);
        assert!(!policy.always_on_top);
        assert!(policy.skip_taskbar);
        assert!(!policy.decorations);
        assert!(!policy.resizable);
        assert!(!policy.focused_on_create);
    }
}
