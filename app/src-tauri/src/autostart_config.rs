//! Production helpers for silent login-item launches via the official plugin.

/// Argument registered with `tauri-plugin-autostart` on macOS and Windows.
pub const AUTOSTART_FLAG: &str = "--autostart";

/// True when the process was started through the OS login-item registration.
pub fn is_autostart_launch<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == AUTOSTART_FLAG)
}

/// Manual launches show the panel once after desktop setup; autostart stays silent.
pub fn should_show_initial_panel<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    !is_autostart_launch(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_autostart_flag_among_process_args() {
        assert!(!is_autostart_launch([
            "/Applications/Eternal.app/Contents/MacOS/app"
        ]));
        assert!(!is_autostart_launch(["app.exe", "--something-else"]));
        assert!(is_autostart_launch(["app", AUTOSTART_FLAG]));
        assert!(is_autostart_launch([
            r"C:\Users\x\AppData\Local\Eternal\Eternal.exe",
            AUTOSTART_FLAG
        ]));
        assert!(is_autostart_launch(["app", "--verbose", AUTOSTART_FLAG]));
    }

    #[test]
    fn shows_initial_panel_only_for_manual_launch() {
        assert!(should_show_initial_panel(["app"]));
        assert!(!should_show_initial_panel(["app", AUTOSTART_FLAG]));
        assert!(!should_show_initial_panel([AUTOSTART_FLAG]));
    }

    #[test]
    fn cargo_pins_exact_autostart_plugin_not_caret() {
        let cargo = include_str!("../Cargo.toml");
        assert!(
            cargo.contains("tauri-plugin-autostart = \"=2.5.1\""),
            "must pin tauri-plugin-autostart with exact =2.5.1"
        );
        // Discriminating check: a bare "2.5.1" caret line must not be present.
        let has_caret = cargo.lines().any(|line| {
            let trimmed = line.trim();
            trimmed == "tauri-plugin-autostart = \"2.5.1\""
                || trimmed.starts_with("tauri-plugin-autostart = \"2.")
                    && !trimmed.contains("\"=2.")
        });
        assert!(
            !has_caret,
            "caret-style tauri-plugin-autostart requirement is not exact"
        );
    }
}
