use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::repository::RepositoryError;
use crate::shortcut::DEFAULT_SHORTCUT;

const SCHEMA_VERSION: u32 = 1;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    schema_version: u32,
    global_shortcut: String,
}

/// Durable panel preferences. Reading never fails: an unreadable or nonsensical
/// settings file falls back to the shipped defaults instead of blocking startup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsRepository {
    path: PathBuf,
    global_shortcut: String,
}

impl SettingsRepository {
    pub fn load_or_default(path: PathBuf) -> Self {
        let global_shortcut = read_global_shortcut(&path).unwrap_or_else(|| {
            crate::shortcut::normalize(DEFAULT_SHORTCUT)
                .unwrap_or_else(|_| DEFAULT_SHORTCUT.to_string())
        });

        Self {
            path,
            global_shortcut,
        }
    }

    pub fn global_shortcut(&self) -> &str {
        &self.global_shortcut
    }

    pub fn set_global_shortcut(&mut self, accelerator: String) -> Result<(), RepositoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let file_contents = SettingsFile {
            schema_version: SCHEMA_VERSION,
            global_shortcut: accelerator.clone(),
        };
        let mut file = AtomicWriteFile::open(&self.path)?;
        serde_json::to_writer_pretty(&mut file, &file_contents).map_err(RepositoryError::Encode)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        file.commit()?;

        self.global_shortcut = accelerator;
        Ok(())
    }
}

/// Returns the stored accelerator only when the file is readable, parseable, and
/// still describes a shortcut Eternal can register.
fn read_global_shortcut(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let stored: SettingsFile = serde_json::from_slice(&bytes).ok()?;
    crate::shortcut::normalize(&stored.global_shortcut).ok()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use crate::shortcut::DEFAULT_SHORTCUT;

    use super::SettingsRepository;

    fn test_path(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("eternal-settings-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create test directory");
        root.join("settings.json")
    }

    #[test]
    fn a_first_launch_starts_from_the_default_shortcut() {
        let path = test_path("first-launch");

        let settings = SettingsRepository::load_or_default(path.clone());

        assert_eq!(settings.global_shortcut(), DEFAULT_SHORTCUT);
        assert!(!path.exists(), "reading must not create a settings file");
    }

    #[test]
    fn a_chosen_shortcut_survives_a_restart() {
        let path = test_path("roundtrip");
        let mut settings = SettingsRepository::load_or_default(path.clone());

        settings
            .set_global_shortcut("CommandOrControl+Alt+E".to_string())
            .expect("save succeeds");

        let reloaded = SettingsRepository::load_or_default(path);
        assert_eq!(reloaded.global_shortcut(), "CommandOrControl+Alt+E");
    }

    #[test]
    fn a_corrupted_settings_file_falls_back_without_destroying_it() {
        let path = test_path("corrupt");
        fs::write(&path, b"{ definitely not json").expect("write fixture");

        let settings = SettingsRepository::load_or_default(path.clone());

        assert_eq!(settings.global_shortcut(), DEFAULT_SHORTCUT);
        assert_eq!(
            fs::read_to_string(&path).expect("fixture remains"),
            "{ definitely not json"
        );
    }

    #[test]
    fn an_unusable_stored_shortcut_falls_back_to_the_default() {
        let path = test_path("invalid-shortcut");
        fs::write(
            &path,
            br#"{"schemaVersion":1,"globalShortcut":"Shift+Shift"}"#,
        )
        .expect("write fixture");

        let settings = SettingsRepository::load_or_default(path);

        assert_eq!(settings.global_shortcut(), DEFAULT_SHORTCUT);
    }

    #[test]
    fn a_stored_shortcut_is_canonicalised_on_load() {
        let path = test_path("canonicalise");
        fs::write(
            &path,
            br#"{"schemaVersion":1,"globalShortcut":"shift + cmd + space"}"#,
        )
        .expect("write fixture");

        let settings = SettingsRepository::load_or_default(path);

        assert_eq!(settings.global_shortcut(), DEFAULT_SHORTCUT);
    }

    #[test]
    fn saving_creates_the_parent_directory() {
        let root = std::env::temp_dir().join(format!("eternal-settings-{}", uuid::Uuid::new_v4()));
        let path = root.join("nested").join("settings.json");
        let mut settings = SettingsRepository::load_or_default(path.clone());

        settings
            .set_global_shortcut("CommandOrControl+Alt+E".to_string())
            .expect("save succeeds");

        assert!(path.exists());
        assert_eq!(
            SettingsRepository::load_or_default(path).global_shortcut(),
            "CommandOrControl+Alt+E"
        );
    }
}
