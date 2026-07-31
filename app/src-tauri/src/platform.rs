use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

use crate::commands::AppState;
use crate::reminders::collect_due;
use crate::window_position::{clamp_to_visible, MonitorBounds, Point, Size};

const REMINDER_POLL_INTERVAL: Duration = Duration::from_secs(15);
const FOCUS_LOSS_HIDE_DELAY: Duration = Duration::from_millis(200);

#[derive(Default)]
pub struct WindowState {
    auto_hide: Mutex<AutoHideState>,
}

#[derive(Default)]
struct AutoHideState {
    next_token: u64,
    pending: Option<u64>,
}

impl WindowState {
    pub fn begin_auto_hide(&self) -> u64 {
        let Ok(mut auto_hide) = self.auto_hide.lock() else {
            return 0;
        };
        auto_hide.next_token = auto_hide.next_token.wrapping_add(1);
        let token = auto_hide.next_token;
        auto_hide.pending = Some(token);
        token
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
}

pub(crate) fn now_ms() -> Option<i64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    i64::try_from(millis).ok()
}

pub fn show_panel(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

pub fn save_panel_position(app: &AppHandle) {
    if let Err(error) = app.save_window_state(StateFlags::POSITION) {
        log::error!("failed to save panel position: {error}");
    }
}

pub fn toggle_panel(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible()? {
            save_panel_position(app);
            window.hide()?;
        } else {
            window.show()?;
            window.set_focus()?;
        }
    }
    Ok(())
}

fn toggle_panel_from_tray(app: &AppHandle) -> tauri::Result<()> {
    app.state::<WindowState>().cancel_auto_hide();
    toggle_panel(app)
}

pub fn schedule_focus_loss_hide(window: tauri::Window) {
    let Some(state) = window.app_handle().try_state::<WindowState>() else {
        return;
    };
    let token = state.begin_auto_hide();

    thread::spawn(move || {
        thread::sleep(FOCUS_LOSS_HIDE_DELAY);
        let Some(state) = window.app_handle().try_state::<WindowState>() else {
            return;
        };
        if state.take_pending_auto_hide(token) {
            save_panel_position(window.app_handle());
            let _ = window.hide();
        }
    });
}

pub fn cancel_focus_loss_hide(window: &tauri::Window) {
    if let Some(state) = window.app_handle().try_state::<WindowState>() {
        state.cancel_auto_hide();
    }
}

pub fn setup_desktop(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let show_item = MenuItem::with_id(app, "show", "显示 Eternal", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 Eternal", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("eternal")
        .tooltip("Eternal 待办")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_panel(app);
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

    if let Some(window) = app.get_webview_window("main") {
        window.restore_state(StateFlags::POSITION)?;
        clamp_panel_position(&window)?;
    }

    start_reminder_scheduler(app.handle().clone());
    show_panel(app.handle())?;
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
        let token = state.begin_auto_hide();

        state.cancel_auto_hide();

        assert!(!state.take_pending_auto_hide(token));
    }

    #[test]
    fn an_uncancelled_focus_loss_hides_only_once() {
        let state = WindowState::default();
        let token = state.begin_auto_hide();

        assert!(state.take_pending_auto_hide(token));
        assert!(!state.take_pending_auto_hide(token));
    }
}
