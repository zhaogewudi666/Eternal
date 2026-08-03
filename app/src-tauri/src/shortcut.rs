use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};

/// The accelerator Eternal registers when the user has never chosen one.
pub const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutError {
    Empty,
    UnknownToken(String),
    MissingKey,
    MultipleKeys,
    MissingModifier,
    WeakModifier,
    Reserved,
    Conflict(String),
    ReleaseFailed(String),
}

impl fmt::Display for ShortcutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(formatter, "请先按下想要使用的快捷键组合。"),
            Self::UnknownToken(token) => {
                write!(formatter, "无法识别按键“{token}”，请换一个组合。")
            }
            Self::MissingKey => write!(
                formatter,
                "快捷键需要一个非修饰键，例如 Space、字母或数字。"
            ),
            Self::MultipleKeys => {
                write!(formatter, "快捷键只能包含一个非修饰键。")
            }
            Self::MissingModifier => write!(
                formatter,
                "快捷键需要配合 ⌘/Ctrl、Alt 等修饰键，避免与正常输入冲突。"
            ),
            Self::WeakModifier => write!(
                formatter,
                "只用 Shift 会影响正常输入，请再加上 ⌘/Ctrl 或 Alt。"
            ),
            Self::Reserved => write!(
                formatter,
                "该组合已用于 Eternal 内部操作，请换一个全局快捷键。"
            ),
            Self::Conflict(reason) => {
                write!(
                    formatter,
                    "新的快捷键无法注册，可能已被其他应用占用：{reason}"
                )
            }
            Self::ReleaseFailed(reason) => {
                write!(formatter, "无法释放原快捷键，已保留原设置：{reason}")
            }
        }
    }
}

impl std::error::Error for ShortcutError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token {
    Primary,
    Alt,
    Shift,
}

fn classify_modifier(token: &str) -> Option<Token> {
    match token {
        "commandorcontrol" | "cmdorctrl" | "command" | "cmd" | "control" | "ctrl" | "super"
        | "meta" | "win" => Some(Token::Primary),
        "alt" | "option" | "opt" => Some(Token::Alt),
        "shift" => Some(Token::Shift),
        _ => None,
    }
}

fn normalize_key(token: &str) -> Option<String> {
    if let Some(number) = token.strip_prefix('f') {
        if !number.is_empty() && number.chars().all(|character| character.is_ascii_digit()) {
            if let Ok(index) = number.parse::<u8>() {
                if (1..=24).contains(&index) {
                    return Some(format!("F{index}"));
                }
            }
        }
    }

    let mut characters = token.chars();
    if let (Some(character), None) = (characters.next(), characters.next()) {
        if character.is_ascii_alphabetic() {
            return Some(character.to_ascii_uppercase().to_string());
        }
        if character.is_ascii_digit() {
            return Some(character.to_string());
        }
    }

    let named = match token {
        "space" => "Space",
        "enter" | "return" => "Enter",
        "tab" => "Tab",
        "backspace" => "Backspace",
        "delete" | "del" => "Delete",
        "escape" | "esc" => "Escape",
        "up" | "arrowup" => "Up",
        "down" | "arrowdown" => "Down",
        "left" | "arrowleft" => "Left",
        "right" | "arrowright" => "Right",
        "home" => "Home",
        "end" => "End",
        "pageup" => "PageUp",
        "pagedown" => "PageDown",
        "insert" => "Insert",
        "plus" => "Plus",
        "minus" => "Minus",
        "equal" => "Equal",
        "comma" => "Comma",
        "period" => "Period",
        "slash" => "Slash",
        "backslash" => "Backslash",
        "semicolon" => "Semicolon",
        "quote" => "Quote",
        "backquote" => "Backquote",
        "bracketleft" => "BracketLeft",
        "bracketright" => "BracketRight",
        _ => return None,
    };

    Some(named.to_string())
}

fn is_function_key(key: &str) -> bool {
    key.strip_prefix('F')
        .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
}

/// Turns any accepted spelling of an accelerator into Eternal's canonical form,
/// rejecting combinations that would be unusable as a global shortcut.
pub fn normalize(input: &str) -> Result<String, ShortcutError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ShortcutError::Empty);
    }

    let mut primary = false;
    let mut alt = false;
    let mut shift = false;
    let mut keys: Vec<String> = Vec::new();

    for raw in trimmed.split('+') {
        let token = raw.trim();
        if token.is_empty() {
            return Err(ShortcutError::UnknownToken(raw.to_string()));
        }

        let lowered = token.to_ascii_lowercase();
        match classify_modifier(&lowered) {
            Some(Token::Primary) => primary = true,
            Some(Token::Alt) => alt = true,
            Some(Token::Shift) => shift = true,
            None => match normalize_key(&lowered) {
                Some(key) => keys.push(key),
                None => return Err(ShortcutError::UnknownToken(token.to_string())),
            },
        }
    }

    let key = match keys.len() {
        0 => return Err(ShortcutError::MissingKey),
        1 => keys.remove(0),
        _ => return Err(ShortcutError::MultipleKeys),
    };

    if !is_function_key(&key) {
        if !primary && !alt && !shift {
            return Err(ShortcutError::MissingModifier);
        }
        if !primary && !alt {
            return Err(ShortcutError::WeakModifier);
        }
    }

    if key == "Escape"
        || (primary && !alt && !shift && matches!(key.as_str(), "1" | "2" | "F"))
        || (primary && shift && !alt && key == "P")
    {
        // ⌘/Ctrl+Shift+P is the in-panel pin toggle; keep the global show/hide
        // accelerator free of that internal chord.
        return Err(ShortcutError::Reserved);
    }

    let mut parts = Vec::new();
    if primary {
        parts.push("CommandOrControl".to_string());
    }
    if alt {
        parts.push("Alt".to_string());
    }
    if shift {
        parts.push("Shift".to_string());
    }
    parts.push(key);

    Ok(parts.join("+"))
}

/// The side-effecting half of a rebind, kept behind a trait so the transactional
/// core can be tested without a running Tauri application.
pub trait ShortcutBinder {
    fn register(&self, accelerator: &str) -> Result<(), String>;
    fn unregister(&self, accelerator: &str) -> Result<(), String>;
}

/// Replaces the accelerator Eternal currently holds with `requested`, leaving the
/// live binding untouched whenever the new accelerator cannot be validated,
/// claimed, or swapped in cleanly.
///
/// `active` is what is really registered right now, which is not always the
/// stored preference: a startup registration can fail, and then nothing is held
/// and there is nothing to release.
pub fn rebind(
    binder: &dyn ShortcutBinder,
    active: Option<&str>,
    requested: &str,
) -> Result<String, ShortcutError> {
    let next = normalize(requested)?;
    let canonical_active =
        active.map(|current| normalize(current).unwrap_or_else(|_| current.to_string()));
    if canonical_active.as_deref() == Some(next.as_str()) {
        return Ok(next);
    }

    binder.register(&next).map_err(ShortcutError::Conflict)?;

    if let Some(current) = canonical_active {
        if let Err(error) = binder.unregister(&current) {
            let _ = binder.unregister(&next);
            return Err(ShortcutError::ReleaseFailed(error));
        }
    }

    Ok(next)
}

/// Undoes a rebind whose new accelerator could not be persisted. Returns the
/// accelerator that is registered once it finishes, which stays `applied` when
/// the system refuses to hand the previous one back.
pub fn revert(
    binder: &dyn ShortcutBinder,
    applied: &str,
    previous: Option<&str>,
) -> Option<String> {
    match previous {
        Some(previous) => match rebind(binder, Some(applied), previous) {
            Ok(restored) => Some(restored),
            Err(_) => Some(applied.to_string()),
        },
        None => match binder.unregister(applied) {
            Ok(()) => None,
            Err(_) => Some(applied.to_string()),
        },
    }
}

/// Suppresses the global shortcut while the settings panel is capturing keys, so
/// pressing the existing combination cannot toggle the panel away mid-recording.
#[derive(Debug, Default)]
pub struct RecordingGate {
    recording: AtomicBool,
}

impl RecordingGate {
    pub fn set_recording(&self, recording: bool) {
        self.recording.store(recording, Ordering::SeqCst);
    }

    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }

    pub fn should_toggle_panel(&self) -> bool {
        !self.is_recording()
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::{
        normalize, rebind, revert, RecordingGate, ShortcutBinder, ShortcutError, DEFAULT_SHORTCUT,
    };

    #[derive(Default)]
    struct FakeBinder {
        registered: RefCell<Vec<String>>,
        calls: RefCell<Vec<String>>,
        register_error: Option<String>,
        unregister_error: Option<String>,
    }

    impl FakeBinder {
        fn holding(accelerator: &str) -> Self {
            Self {
                registered: RefCell::new(vec![accelerator.to_string()]),
                ..Self::default()
            }
        }

        fn registered(&self) -> Vec<String> {
            self.registered.borrow().clone()
        }

        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl ShortcutBinder for FakeBinder {
        fn register(&self, accelerator: &str) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("register:{accelerator}"));
            if let Some(error) = &self.register_error {
                return Err(error.clone());
            }
            self.registered.borrow_mut().push(accelerator.to_string());
            Ok(())
        }

        fn unregister(&self, accelerator: &str) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("unregister:{accelerator}"));
            if let Some(error) = &self.unregister_error {
                return Err(error.clone());
            }
            self.registered
                .borrow_mut()
                .retain(|held| held != accelerator);
            Ok(())
        }
    }

    #[test]
    fn the_default_shortcut_is_already_canonical() {
        assert_eq!(
            normalize(DEFAULT_SHORTCUT).expect("default is valid"),
            DEFAULT_SHORTCUT
        );
    }

    #[test]
    fn accepts_platform_spellings_and_orders_modifiers_canonically() {
        assert_eq!(
            normalize("shift + cmd + space").expect("valid"),
            "CommandOrControl+Shift+Space"
        );
        assert_eq!(
            normalize("Ctrl+Alt+k").expect("valid"),
            "CommandOrControl+Alt+K"
        );
        assert_eq!(
            normalize("Option+Super+ArrowUp").expect("valid"),
            "CommandOrControl+Alt+Up"
        );
        assert_eq!(
            normalize("cmd+shift+f5").expect("valid"),
            "CommandOrControl+Shift+F5"
        );
    }

    #[test]
    fn collapses_repeated_modifiers_into_one() {
        assert_eq!(
            normalize("Command+Ctrl+Cmd+Shift+J").expect("valid"),
            "CommandOrControl+Shift+J"
        );
    }

    #[test]
    fn rejects_a_combination_without_any_real_key() {
        assert_eq!(
            normalize("CommandOrControl+Shift"),
            Err(ShortcutError::MissingKey)
        );
        assert_eq!(normalize("  "), Err(ShortcutError::Empty));
    }

    #[test]
    fn rejects_more_than_one_non_modifier_key() {
        assert_eq!(
            normalize("CommandOrControl+A+B"),
            Err(ShortcutError::MultipleKeys)
        );
    }

    #[test]
    fn rejects_a_bare_key_that_would_swallow_typing() {
        assert_eq!(normalize("Space"), Err(ShortcutError::MissingModifier));
        assert_eq!(normalize("Shift+A"), Err(ShortcutError::WeakModifier));
    }

    #[test]
    fn allows_a_bare_function_key() {
        assert_eq!(normalize("f13").expect("valid"), "F13");
    }

    #[test]
    fn rejects_tokens_it_cannot_map_to_a_key() {
        assert_eq!(
            normalize("CommandOrControl+Sparkle"),
            Err(ShortcutError::UnknownToken("Sparkle".to_string()))
        );
        assert_eq!(
            normalize("cmd+f99"),
            Err(ShortcutError::UnknownToken("f99".to_string()))
        );
    }

    #[test]
    fn rejects_shortcuts_reserved_for_panel_navigation() {
        for accelerator in [
            "CommandOrControl+1",
            "CommandOrControl+2",
            "CommandOrControl+F",
            "CommandOrControl+Escape",
            "CommandOrControl+Shift+P",
        ] {
            assert_eq!(normalize(accelerator), Err(ShortcutError::Reserved));
        }

        assert_eq!(
            normalize("CommandOrControl+Shift+F").expect("modified F is available"),
            "CommandOrControl+Shift+F"
        );
        assert_eq!(
            normalize("CommandOrControl+Shift+Space").expect("global show/hide stays free"),
            "CommandOrControl+Shift+Space"
        );
    }

    #[test]
    fn every_rejection_explains_itself_in_the_panel_language() {
        for error in [
            ShortcutError::Empty,
            ShortcutError::MissingKey,
            ShortcutError::MultipleKeys,
            ShortcutError::MissingModifier,
            ShortcutError::WeakModifier,
            ShortcutError::Reserved,
            ShortcutError::UnknownToken("Sparkle".to_string()),
            ShortcutError::Conflict("busy".to_string()),
            ShortcutError::ReleaseFailed("stuck".to_string()),
        ] {
            let message = error.to_string();
            assert!(!message.is_empty(), "{error:?} needs a message");
            assert!(
                message.chars().any(|character| character as u32 > 0x2E80),
                "{error:?} should explain itself in Chinese"
            );
        }
    }

    #[test]
    fn a_successful_rebind_claims_the_new_key_before_releasing_the_old_one() {
        let binder = FakeBinder::holding(DEFAULT_SHORTCUT);

        let applied =
            rebind(&binder, Some(DEFAULT_SHORTCUT), "ctrl+alt+e").expect("rebind succeeds");

        assert_eq!(applied, "CommandOrControl+Alt+E");
        assert_eq!(binder.registered(), vec!["CommandOrControl+Alt+E"]);
        assert_eq!(
            binder.calls(),
            vec![
                "register:CommandOrControl+Alt+E",
                "unregister:CommandOrControl+Shift+Space",
            ]
        );
    }

    #[test]
    fn a_conflicting_shortcut_leaves_the_old_binding_in_place() {
        let binder = FakeBinder {
            register_error: Some("已被占用".to_string()),
            ..FakeBinder::holding(DEFAULT_SHORTCUT)
        };

        let error = rebind(&binder, Some(DEFAULT_SHORTCUT), "ctrl+alt+e").unwrap_err();

        assert_eq!(error, ShortcutError::Conflict("已被占用".to_string()));
        assert_eq!(binder.registered(), vec![DEFAULT_SHORTCUT]);
        assert_eq!(binder.calls(), vec!["register:CommandOrControl+Alt+E"]);
    }

    #[test]
    fn a_failed_release_rolls_the_new_shortcut_back() {
        let binder = FakeBinder {
            unregister_error: Some("系统拒绝释放".to_string()),
            ..FakeBinder::holding(DEFAULT_SHORTCUT)
        };

        let error = rebind(&binder, Some(DEFAULT_SHORTCUT), "ctrl+alt+e").unwrap_err();

        assert_eq!(
            error,
            ShortcutError::ReleaseFailed("系统拒绝释放".to_string())
        );
        assert_eq!(
            binder.calls(),
            vec![
                "register:CommandOrControl+Alt+E",
                "unregister:CommandOrControl+Shift+Space",
                "unregister:CommandOrControl+Alt+E",
            ]
        );
    }

    #[test]
    fn an_invalid_request_never_touches_the_registered_shortcut() {
        let binder = FakeBinder::holding(DEFAULT_SHORTCUT);

        let error = rebind(&binder, Some(DEFAULT_SHORTCUT), "Shift+A").unwrap_err();

        assert_eq!(error, ShortcutError::WeakModifier);
        assert!(binder.calls().is_empty());
        assert_eq!(binder.registered(), vec![DEFAULT_SHORTCUT]);
    }

    #[test]
    fn re_selecting_the_current_shortcut_does_not_unregister_it() {
        let binder = FakeBinder::holding(DEFAULT_SHORTCUT);

        let applied = rebind(&binder, Some(DEFAULT_SHORTCUT), "shift + cmd + space")
            .expect("rebind succeeds");

        assert_eq!(applied, DEFAULT_SHORTCUT);
        assert!(binder.calls().is_empty());
        assert_eq!(binder.registered(), vec![DEFAULT_SHORTCUT]);
    }

    #[test]
    fn a_startup_failure_leaves_nothing_to_release_when_the_user_picks_a_new_key() {
        let binder = FakeBinder::default();

        let applied = rebind(&binder, None, "ctrl+alt+e").expect("rebind succeeds");

        assert_eq!(applied, "CommandOrControl+Alt+E");
        assert_eq!(binder.calls(), vec!["register:CommandOrControl+Alt+E"]);
        assert_eq!(binder.registered(), vec!["CommandOrControl+Alt+E"]);
    }

    #[test]
    fn a_startup_failure_can_be_repaired_by_re_selecting_the_stored_shortcut() {
        let binder = FakeBinder::default();

        let applied = rebind(&binder, None, DEFAULT_SHORTCUT).expect("rebind succeeds");

        assert_eq!(applied, DEFAULT_SHORTCUT);
        assert_eq!(binder.registered(), vec![DEFAULT_SHORTCUT]);
    }

    #[test]
    fn reverting_a_rebind_puts_the_previous_shortcut_back() {
        let binder = FakeBinder::holding("CommandOrControl+Alt+E");

        let live = revert(&binder, "CommandOrControl+Alt+E", Some(DEFAULT_SHORTCUT));

        assert_eq!(live.as_deref(), Some(DEFAULT_SHORTCUT));
        assert_eq!(binder.registered(), vec![DEFAULT_SHORTCUT]);
    }

    #[test]
    fn reverting_without_a_previous_shortcut_releases_the_new_one() {
        let binder = FakeBinder::holding("CommandOrControl+Alt+E");

        let live = revert(&binder, "CommandOrControl+Alt+E", None);

        assert_eq!(live, None);
        assert!(binder.registered().is_empty());
    }

    #[test]
    fn a_revert_that_cannot_reclaim_the_previous_shortcut_keeps_the_new_one_live() {
        let binder = FakeBinder {
            register_error: Some("已被占用".to_string()),
            ..FakeBinder::holding("CommandOrControl+Alt+E")
        };

        let live = revert(&binder, "CommandOrControl+Alt+E", Some(DEFAULT_SHORTCUT));

        assert_eq!(live.as_deref(), Some("CommandOrControl+Alt+E"));
        assert_eq!(binder.registered(), vec!["CommandOrControl+Alt+E"]);
    }

    #[test]
    fn recording_suspends_the_panel_toggle_until_it_finishes() {
        let gate = RecordingGate::default();
        assert!(gate.should_toggle_panel());

        gate.set_recording(true);
        assert!(gate.is_recording());
        assert!(!gate.should_toggle_panel());

        gate.set_recording(false);
        assert!(gate.should_toggle_panel());
    }
}
