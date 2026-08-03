use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::model::Task;

const SCHEMA_VERSION: u32 = 1;
const DATA_STATE_SCHEMA_VERSION: u32 = 1;
const UNKNOWN_VERSION_LABEL: &str = "unknown";

#[derive(Debug)]
pub struct TaskRepository {
    path: PathBuf,
    tasks: Vec<Task>,
    /// When set, every write is refused so a higher/unknown on-disk schema cannot
    /// be replaced by an empty in-memory schema-1 snapshot.
    write_blocked: Option<u32>,
}

#[derive(Debug)]
pub enum RepositoryError {
    Io(std::io::Error),
    Decode(serde_json::Error),
    Encode(serde_json::Error),
    UnsupportedSchema(u32),
    Snapshot(String),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法保存待办数据：{error}"),
            Self::Decode(error) => write!(formatter, "无法读取待办数据：{error}"),
            Self::Encode(error) => write!(formatter, "无法编码待办数据：{error}"),
            Self::UnsupportedSchema(version) => write!(
                formatter,
                "待办数据版本 {version} 高于当前支持的 {SCHEMA_VERSION}，已保留原文件未改写"
            ),
            Self::Snapshot(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for RepositoryError {}

impl From<std::io::Error> for RepositoryError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapReport {
    pub recovery_message: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoreFile {
    schema_version: u32,
    tasks: Vec<Task>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DataStateFile {
    schema_version: u32,
    last_app_version: String,
    task_schema_version: u32,
}

impl TaskRepository {
    pub fn empty(path: PathBuf) -> Self {
        Self {
            path,
            tasks: Vec::new(),
            write_blocked: None,
        }
    }

    /// Empty in-memory view that refuses every disk write (higher-schema safety).
    pub fn empty_write_blocked(path: PathBuf, schema_version: u32) -> Self {
        Self {
            path,
            tasks: Vec::new(),
            write_blocked: Some(schema_version),
        }
    }

    /// Non-destructive startup fallback after a hard repository bootstrap error.
    ///
    /// - Higher schema → write-blocked with the reported version.
    /// - Existing `tasks.json` → write-blocked so an empty in-memory list cannot
    ///   rewrite the only on-disk copy.
    /// - Missing canonical file (fresh install) → writable empty repository.
    pub fn for_startup_failure(path: PathBuf, error: &RepositoryError) -> Self {
        match error {
            RepositoryError::UnsupportedSchema(version) => {
                Self::empty_write_blocked(path, *version)
            }
            _ if path.exists() => {
                let version = probe_existing_schema_version(&path)
                    .filter(|version| *version > SCHEMA_VERSION)
                    .unwrap_or(SCHEMA_VERSION.saturating_add(1));
                Self::empty_write_blocked(path, version)
            }
            _ => Self::empty(path),
        }
    }

    pub fn is_write_blocked(&self) -> bool {
        self.write_blocked.is_some()
    }

    /// Fail fast when this repository must not mutate on-disk task data.
    pub fn ensure_writable(&self) -> Result<(), RepositoryError> {
        if let Some(version) = self.write_blocked {
            return Err(RepositoryError::UnsupportedSchema(version));
        }
        Ok(())
    }

    pub fn load(path: PathBuf) -> Result<Self, RepositoryError> {
        if !path.exists() {
            return Ok(Self::empty(path));
        }

        let bytes = fs::read(&path)?;
        // Probe schemaVersion before full Task deserialization so unknown high
        // schemas (even with incompatible task fields) never look like "corrupt".
        if let Some(version) = probe_schema_version_from_bytes(&bytes) {
            if version > SCHEMA_VERSION {
                return Err(RepositoryError::UnsupportedSchema(version));
            }
        }

        let store: StoreFile = serde_json::from_slice(&bytes).map_err(RepositoryError::Decode)?;
        if store.schema_version > SCHEMA_VERSION {
            return Err(RepositoryError::UnsupportedSchema(store.schema_version));
        }

        Ok(Self {
            path,
            tasks: store.tasks,
            write_blocked: None,
        })
    }

    /// Load tasks with upgrade snapshots, non-destructive recovery, and data-state bookkeeping.
    pub fn bootstrap(
        app_data_dir: PathBuf,
        app_version: &str,
        recovery_timestamp_ms: i64,
    ) -> Result<(Self, BootstrapReport), RepositoryError> {
        let tasks_path = app_data_dir.join("tasks.json");
        let data_state_path = app_data_dir.join("data-state.json");
        let backups_dir = app_data_dir.join("backups");

        let previous_version = read_data_state(&data_state_path)
            .map(|state| state.last_app_version)
            .unwrap_or_else(|| UNKNOWN_VERSION_LABEL.to_string());
        let needs_snapshot = tasks_path.exists()
            && (read_data_state(&data_state_path).is_none() || previous_version != app_version);

        let mut recovery_message = None;
        if needs_snapshot {
            match create_pre_upgrade_snapshot(
                &tasks_path,
                &backups_dir,
                &previous_version,
                recovery_timestamp_ms,
            ) {
                Ok(_) => {}
                Err(error) => {
                    // Fail-closed: do not migrate/load into a writable state, and never
                    // rewrite the canonical tasks.json after a failed upgrade snapshot.
                    // Skip data-state bookkeeping entirely (do not claim schema-1 success).
                    let message = error.to_string();
                    let blocked_version = probe_existing_schema_version(&tasks_path)
                        .filter(|version| *version > SCHEMA_VERSION)
                        .unwrap_or(SCHEMA_VERSION.saturating_add(1));
                    return Ok((
                        Self::empty_write_blocked(tasks_path, blocked_version),
                        BootstrapReport {
                            recovery_message: Some(message),
                        },
                    ));
                }
            }
        }

        let (mut repository, load_message) =
            match Self::load_or_recover(tasks_path.clone(), recovery_timestamp_ms) {
                Ok((repository, backup)) => {
                    let message = backup.map(|path| {
                        let backup_name = path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("损坏数据备份");
                        format!("原待办文件无法读取，已保留为 {backup_name}，现在使用空列表启动。")
                    });
                    (repository, message)
                }
                Err(RepositoryError::UnsupportedSchema(version)) => {
                    // Empty write-blocked view: never replace a higher-schema file with
                    // schema-1 data, and never write data-state claiming a successful load.
                    return Ok((
                        Self::empty_write_blocked(tasks_path, version),
                        BootstrapReport {
                            recovery_message: Some(
                                RepositoryError::UnsupportedSchema(version).to_string(),
                            ),
                        },
                    ));
                }
                Err(error) => return Err(error),
            };
        if recovery_message.is_none() {
            recovery_message = load_message;
        }

        // Canonical missing: try application-owned snapshots only (never foreign paths).
        if !tasks_path.exists() && repository.tasks().is_empty() {
            if let Some(message) =
                try_recover_from_owned_backups(&tasks_path, &backups_dir, recovery_timestamp_ms)?
            {
                recovery_message = Some(message);
            }
        } else if repository.tasks().is_empty() && !tasks_path.exists() {
            // Unreachable branch kept for clarity; handled above.
        }

        if tasks_path.exists() {
            // Reload after a possible recovery copy so memory matches the canonical file.
            match Self::load(tasks_path.clone()) {
                Ok(reloaded) => repository = reloaded,
                Err(RepositoryError::UnsupportedSchema(version)) => {
                    return Ok((
                        Self::empty_write_blocked(tasks_path, version),
                        BootstrapReport {
                            recovery_message: Some(recovery_message.unwrap_or_else(|| {
                                RepositoryError::UnsupportedSchema(version).to_string()
                            })),
                        },
                    ));
                }
                Err(RepositoryError::Decode(_)) => {}
                Err(error) => return Err(error),
            }
        }

        // Reached only when upgrade snapshot was not required or succeeded, and
        // higher-schema paths already returned write-blocked without data-state.
        // Bookkeeping failure must not discard loaded tasks or touch tasks.json.
        if let Err(error) = write_data_state(
            &data_state_path,
            &DataStateFile {
                schema_version: DATA_STATE_SCHEMA_VERSION,
                last_app_version: app_version.to_string(),
                task_schema_version: SCHEMA_VERSION,
            },
        ) {
            if recovery_message.is_none() {
                recovery_message =
                    Some(format!("数据状态记账失败，已加载的待办仍保留可用：{error}"));
            }
        }

        Ok((repository, BootstrapReport { recovery_message }))
    }

    pub fn load_or_recover(
        path: PathBuf,
        recovery_timestamp_ms: i64,
    ) -> Result<(Self, Option<PathBuf>), RepositoryError> {
        match Self::load(path.clone()) {
            Ok(repository) => Ok((repository, None)),
            Err(RepositoryError::UnsupportedSchema(version)) => {
                Err(RepositoryError::UnsupportedSchema(version))
            }
            Err(RepositoryError::Decode(_)) => {
                // Defense in depth: never rename a higher-schema file as corrupt,
                // even if full Task decode failed before the schema probe path ran.
                if let Some(version) = probe_existing_schema_version(&path) {
                    if version > SCHEMA_VERSION {
                        return Err(RepositoryError::UnsupportedSchema(version));
                    }
                }

                let stem = path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .unwrap_or("tasks");
                let extension = path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .unwrap_or("json");
                let mut backup = path.with_file_name(format!(
                    "{stem}.corrupt-{recovery_timestamp_ms}.{extension}"
                ));
                let mut suffix = 1_u32;
                while backup.exists() {
                    backup = path.with_file_name(format!(
                        "{stem}.corrupt-{recovery_timestamp_ms}-{suffix}.{extension}"
                    ));
                    suffix = suffix.saturating_add(1);
                }
                // Preserve the only corrupt copy by rename; never overwrite it.
                fs::rename(&path, &backup)?;
                Ok((Self::empty(path), Some(backup)))
            }
            Err(error) => Err(error),
        }
    }

    pub fn tasks(&self) -> &[Task] {
        &self.tasks
    }

    pub fn replace_and_save(&mut self, tasks: Vec<Task>) -> Result<(), RepositoryError> {
        if let Some(version) = self.write_blocked {
            return Err(RepositoryError::UnsupportedSchema(version));
        }

        // Defense in depth: never downgrade/overwrite an on-disk higher schema,
        // even if this repository was constructed via empty() after a failed load.
        if let Some(version) = probe_existing_schema_version(&self.path) {
            if version > SCHEMA_VERSION {
                self.write_blocked = Some(version);
                return Err(RepositoryError::UnsupportedSchema(version));
            }
        }

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let store = StoreFile {
            schema_version: SCHEMA_VERSION,
            tasks: tasks.clone(),
        };
        let mut file = AtomicWriteFile::open(&self.path)?;
        serde_json::to_writer_pretty(&mut file, &store).map_err(RepositoryError::Encode)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        file.commit()?;

        self.tasks = tasks;
        Ok(())
    }
}

/// Read only `schemaVersion` so higher-schema files with unknown task fields still probe.
fn probe_existing_schema_version(path: &Path) -> Option<u32> {
    if !path.exists() {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    probe_schema_version_from_bytes(&bytes)
}

/// Probe `schemaVersion` without requiring Task-compatible payload fields.
fn probe_schema_version_from_bytes(bytes: &[u8]) -> Option<u32> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SchemaProbe {
        schema_version: u32,
    }
    serde_json::from_slice::<SchemaProbe>(bytes)
        .ok()
        .map(|probe| probe.schema_version)
}

fn read_data_state(path: &Path) -> Option<DataStateFile> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_data_state(path: &Path, state: &DataStateFile) -> Result<(), RepositoryError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = AtomicWriteFile::open(path)?;
    serde_json::to_writer_pretty(&mut file, state).map_err(RepositoryError::Encode)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    file.commit()?;
    Ok(())
}

fn create_pre_upgrade_snapshot(
    tasks_path: &Path,
    backups_dir: &Path,
    previous_version: &str,
    timestamp_ms: i64,
) -> Result<PathBuf, RepositoryError> {
    let source_bytes = fs::read(tasks_path).map_err(|error| {
        RepositoryError::Snapshot(format!(
            "升级前备份失败，已中止加载以保护原待办文件：{error}"
        ))
    })?;

    // Byte-idempotent: reuse an existing upgrade snapshot with identical content so
    // blocked higher-schema / repeated boot paths do not accumulate unbounded copies.
    if let Some(existing) = find_identical_pre_upgrade_snapshot(backups_dir, &source_bytes) {
        return Ok(existing);
    }

    fs::create_dir_all(backups_dir).map_err(|error| {
        RepositoryError::Snapshot(format!(
            "升级前备份失败，已中止加载以保护原待办文件：{error}"
        ))
    })?;
    let safe_version = previous_version
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let mut backup = backups_dir.join(format!(
        "tasks-pre-upgrade-{safe_version}-{timestamp_ms}.json"
    ));
    let mut suffix = 1_u32;
    while backup.exists() {
        backup = backups_dir.join(format!(
            "tasks-pre-upgrade-{safe_version}-{timestamp_ms}-{suffix}.json"
        ));
        suffix = suffix.saturating_add(1);
    }

    // Copy only — never move or delete the source task file.
    fs::write(&backup, &source_bytes).map_err(|error| {
        RepositoryError::Snapshot(format!(
            "升级前备份失败，已中止加载以保护原待办文件：{error}"
        ))
    })?;
    if let Ok(file) = fs::File::open(&backup) {
        let _ = file.sync_all();
    }
    Ok(backup)
}

fn find_identical_pre_upgrade_snapshot(backups_dir: &Path, source_bytes: &[u8]) -> Option<PathBuf> {
    if !backups_dir.is_dir() {
        return None;
    }
    let entries = fs::read_dir(backups_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        if !name.starts_with("tasks-pre-upgrade-") || !name.ends_with(".json") {
            continue;
        }
        if let Ok(existing) = fs::read(&path) {
            if existing == source_bytes {
                return Some(path);
            }
        }
    }
    None
}

fn try_recover_from_owned_backups(
    tasks_path: &Path,
    backups_dir: &Path,
    _timestamp_ms: i64,
) -> Result<Option<String>, RepositoryError> {
    if tasks_path.exists() || !backups_dir.is_dir() {
        return Ok(None);
    }

    let mut readable = Vec::new();
    let entries = fs::read_dir(backups_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let Ok(store) = serde_json::from_slice::<StoreFile>(&bytes) else {
            continue;
        };
        if store.schema_version > SCHEMA_VERSION {
            continue;
        }
        readable.push((path, bytes, store.tasks));
    }

    if readable.is_empty() {
        return Ok(None);
    }

    if readable.len() == 1 {
        let (path, bytes, _) = readable.remove(0);
        if let Some(parent) = tasks_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(tasks_path, &bytes)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("snapshot");
        return Ok(Some(format!(
            "规范待办文件缺失，已从应用备份 {name} 恢复；原备份仍保留。"
        )));
    }

    // Multiple distinct snapshots: never auto-merge.
    let mut unique_payloads = readable
        .iter()
        .map(|(_, bytes, _)| bytes.clone())
        .collect::<Vec<_>>();
    unique_payloads.sort();
    unique_payloads.dedup();
    if unique_payloads.len() == 1 {
        let (path, bytes, _) = readable.remove(0);
        if let Some(parent) = tasks_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(tasks_path, &bytes)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("snapshot");
        return Ok(Some(format!(
            "规范待办文件缺失，已从应用备份 {name} 恢复；原备份仍保留。"
        )));
    }

    Ok(Some(
        "规范待办文件缺失，且存在多份内容不同的应用备份；为避免覆盖，Eternal 未自动恢复。请手动从 backups 目录选择一份后放回 tasks.json。"
            .to_string(),
    ))
}

/// Pure policy for the secondary-instance plugin callback.
pub fn secondary_instance_should_focus_existing_main() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use crate::model::{Reminder, Task};

    use super::{
        create_pre_upgrade_snapshot, read_data_state,
        secondary_instance_should_focus_existing_main, RepositoryError, TaskRepository,
        SCHEMA_VERSION,
    };

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "eternal-repository-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        root
    }

    fn test_path(name: &str) -> PathBuf {
        test_root(name).join("tasks.json")
    }

    #[test]
    fn saves_and_reloads_task_order_and_reminders() {
        let path = test_path("roundtrip");
        let mut first = Task::new("第一项", 100).expect("valid task");
        first.reminder = Some(Reminder {
            next_at_ms: 5_000,
            repeat_every_minutes: Some(30),
            last_fired_at_ms: None,
        });
        let second = Task::new("第二项", 200).expect("valid task");

        let mut repository = TaskRepository::load(path.clone()).expect("empty repository");
        repository
            .replace_and_save(vec![first.clone(), second.clone()])
            .expect("save succeeds");

        let reloaded = TaskRepository::load(path).expect("reload succeeds");
        assert_eq!(reloaded.tasks(), &[first, second]);
    }

    #[test]
    fn corrupted_json_returns_an_error_without_overwriting_the_file() {
        let path = test_path("corrupt");
        fs::write(&path, b"{ definitely not json").expect("write fixture");

        let error = TaskRepository::load(path.clone()).unwrap_err();

        assert!(error.to_string().contains("无法读取待办数据"));
        assert_eq!(
            fs::read_to_string(path).expect("fixture remains"),
            "{ definitely not json"
        );
    }

    #[test]
    fn recovers_corrupted_json_into_a_timestamped_backup() {
        let path = test_path("recover");
        let original = b"{ definitely not json";
        fs::write(&path, original).expect("write fixture");

        let (repository, backup) =
            TaskRepository::load_or_recover(path.clone(), 1_234).expect("recovery succeeds");
        let backup = backup.expect("corrupt data should be backed up");

        assert!(repository.tasks().is_empty());
        assert!(!path.exists());
        assert_eq!(
            backup.file_name().and_then(|name| name.to_str()),
            Some("tasks.corrupt-1234.json")
        );
        assert_eq!(fs::read(backup).expect("backup remains readable"), original);
    }

    #[test]
    fn recovery_never_overwrites_an_existing_backup() {
        let path = test_path("recover-collision");
        let first_backup = path.with_file_name("tasks.corrupt-1234.json");
        fs::write(&first_backup, b"older backup").expect("write existing backup");
        fs::write(&path, b"{ newest corrupt data").expect("write fixture");

        let (_, backup) = TaskRepository::load_or_recover(path, 1_234).expect("recovery succeeds");
        let backup = backup.expect("corrupt data should be backed up");

        assert_eq!(
            backup.file_name().and_then(|name| name.to_str()),
            Some("tasks.corrupt-1234-1.json")
        );
        assert_eq!(
            fs::read(first_backup).expect("first backup remains"),
            b"older backup"
        );
        assert_eq!(
            fs::read(backup).expect("second backup remains"),
            b"{ newest corrupt data"
        );
    }

    #[test]
    fn unknown_higher_schema_versions_fail_without_rewriting_the_file() {
        let path = test_path("higher-schema");
        let payload = format!(
            r#"{{"schemaVersion":{},"tasks":[{{"id":"a","title":"保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}}]}}"#,
            SCHEMA_VERSION + 3
        );
        fs::write(&path, &payload).expect("write fixture");

        let error = TaskRepository::load(path.clone()).unwrap_err();
        assert!(error.to_string().contains("高于当前支持"));
        assert_eq!(fs::read_to_string(path).expect("source preserved"), payload);
    }

    #[test]
    fn pre_upgrade_snapshot_copies_without_moving_the_source() {
        let root = test_root("snapshot");
        let tasks_path = root.join("tasks.json");
        let backups = root.join("backups");
        fs::write(&tasks_path, br#"{"schemaVersion":1,"tasks":[]}"#).expect("write tasks");

        let backup =
            create_pre_upgrade_snapshot(&tasks_path, &backups, "0.2.3", 99).expect("snapshot");

        assert!(tasks_path.exists(), "source must remain");
        assert_eq!(
            fs::read(&tasks_path).expect("source readable"),
            fs::read(&backup).expect("backup readable")
        );
        assert!(backup
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .contains("tasks-pre-upgrade-0.2.3-99"));
    }

    #[test]
    fn bootstrap_is_idempotent_for_the_same_app_version() {
        let root = test_root("bootstrap-idempotent");
        let tasks_path = root.join("tasks.json");
        fs::write(
            &tasks_path,
            r#"{"schemaVersion":1,"tasks":[{"id":"a","title":"keep","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#,
        )
        .expect("write tasks");

        let (first, _) = TaskRepository::bootstrap(root.clone(), "0.2.4", 100).expect("first boot");
        assert_eq!(first.tasks().len(), 1);
        let backups_after_first = fs::read_dir(root.join("backups"))
            .expect("backups dir")
            .count();

        let (second, _) =
            TaskRepository::bootstrap(root.clone(), "0.2.4", 200).expect("second boot");
        assert_eq!(second.tasks().len(), 1);
        let backups_after_second = fs::read_dir(root.join("backups"))
            .expect("backups dir")
            .count();
        assert_eq!(
            backups_after_first, backups_after_second,
            "same version must not create another snapshot"
        );
        assert_eq!(
            read_data_state(&root.join("data-state.json"))
                .expect("data state")
                .last_app_version,
            "0.2.4"
        );
    }

    #[test]
    fn bootstrap_restores_a_single_owned_snapshot_when_canonical_is_missing() {
        let root = test_root("restore-one");
        let backups = root.join("backups");
        fs::create_dir_all(&backups).expect("backups");
        let snapshot = backups.join("tasks-pre-upgrade-0.2.3-1.json");
        fs::write(
            &snapshot,
            r#"{"schemaVersion":1,"tasks":[{"id":"restored","title":"restored-item","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#,
        )
        .expect("write snapshot");
        // data-state proves a prior run existed, even if tasks.json is gone.
        fs::write(
            root.join("data-state.json"),
            br#"{"schemaVersion":1,"lastAppVersion":"0.2.3","taskSchemaVersion":1}"#,
        )
        .expect("write data state");

        let (repository, report) =
            TaskRepository::bootstrap(root.clone(), "0.2.4", 300).expect("bootstrap");

        assert_eq!(repository.tasks().len(), 1);
        assert_eq!(repository.tasks()[0].title, "restored-item");
        assert!(root.join("tasks.json").exists());
        assert!(snapshot.exists(), "snapshot must be kept");
        assert!(report
            .recovery_message
            .as_deref()
            .unwrap_or_default()
            .contains("恢复"));
    }

    #[test]
    fn bootstrap_does_not_auto_merge_conflicting_snapshots() {
        let root = test_root("restore-conflict");
        let backups = root.join("backups");
        fs::create_dir_all(&backups).expect("backups");
        fs::write(
            backups.join("a.json"),
            r#"{"schemaVersion":1,"tasks":[{"id":"a","title":"A","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#,
        )
        .expect("a");
        fs::write(
            backups.join("b.json"),
            r#"{"schemaVersion":1,"tasks":[{"id":"b","title":"B","completed":false,"createdAtMs":2,"completedAtMs":null,"reminder":null}]}"#,
        )
        .expect("b");

        let (repository, report) =
            TaskRepository::bootstrap(root.clone(), "0.2.4", 400).expect("bootstrap");

        assert!(repository.tasks().is_empty());
        assert!(!root.join("tasks.json").exists());
        assert!(report
            .recovery_message
            .as_deref()
            .unwrap_or_default()
            .contains("多份"));
        assert!(backups.join("a.json").exists());
        assert!(backups.join("b.json").exists());
    }

    #[test]
    fn secondary_instance_policy_focuses_the_existing_main_panel() {
        assert!(secondary_instance_should_focus_existing_main());
    }

    #[test]
    fn bootstrap_higher_schema_preserves_bytes_and_blocks_later_writes() {
        let root = test_root("bootstrap-higher-schema-write-block");
        let tasks_path = root.join("tasks.json");
        let payload = format!(
            r#"{{"schemaVersion":{},"tasks":[{{"id":"future","title":"高版本任务","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null,"futureField":true}}]}}"#,
            SCHEMA_VERSION + 5
        );
        fs::write(&tasks_path, &payload).expect("write higher-schema fixture");
        let original_bytes = fs::read(&tasks_path).expect("read original bytes");

        let (mut repository, report) =
            TaskRepository::bootstrap(root.clone(), "0.2.4", 500).expect("bootstrap must start");

        assert!(
            repository.tasks().is_empty(),
            "unsupported schema must not load unknown tasks into memory"
        );
        assert!(
            repository.is_write_blocked(),
            "repository must enter write-blocked mode after higher-schema bootstrap"
        );
        assert!(
            report
                .recovery_message
                .as_deref()
                .unwrap_or_default()
                .contains("高于当前支持"),
            "user must be told the higher schema was preserved"
        );
        assert_eq!(
            fs::read(&tasks_path).expect("source still readable"),
            original_bytes,
            "higher-schema tasks.json must remain byte-for-byte identical after bootstrap"
        );

        let write_error = repository
            .replace_and_save(vec![Task::new("不应落盘", 1).expect("task")])
            .expect_err("writes must be blocked");
        assert!(
            write_error.to_string().contains("高于当前支持")
                || write_error.to_string().contains("禁止写入"),
            "blocked write error should mention schema protection, got: {write_error}"
        );
        assert_eq!(
            fs::read(&tasks_path).expect("source still readable after blocked write"),
            original_bytes,
            "blocked mutation must not create or overwrite tasks.json"
        );
        // Never write data-state claiming we successfully loaded the current schema.
        if let Some(state) = read_data_state(&root.join("data-state.json")) {
            assert_ne!(
                state.task_schema_version, SCHEMA_VERSION,
                "must not record successful schema-1 load for an unreadable higher schema"
            );
        }
    }

    #[test]
    fn empty_repository_pointing_at_higher_schema_file_still_refuses_writes() {
        let path = test_path("empty-over-higher-schema");
        let payload = format!(
            r#"{{"schemaVersion":{},"tasks":[{{"id":"a","title":"保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}}]}}"#,
            SCHEMA_VERSION + 2
        );
        fs::write(&path, &payload).expect("write fixture");
        let original = fs::read(&path).expect("read original");

        let mut repository = TaskRepository::empty(path.clone());
        let error = repository
            .replace_and_save(vec![Task::new("覆盖风险", 1).expect("task")])
            .expect_err("must refuse overwrite of higher schema");

        assert!(error.to_string().contains("高于当前支持"));
        assert_eq!(fs::read(path).expect("preserved"), original);
    }

    #[test]
    fn bootstrap_data_state_bookkeeping_failure_keeps_loaded_tasks_and_does_not_touch_tasks_json() {
        let root = test_root("bootstrap-data-state-write-fail");
        let tasks_path = root.join("tasks.json");
        let payload = r#"{"schemaVersion":1,"tasks":[{"id":"keep","title":"记账失败仍保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#;
        fs::write(&tasks_path, payload).expect("write tasks");
        let original_bytes = fs::read(&tasks_path).expect("read original tasks");

        // Force write_data_state to fail: AtomicWriteFile cannot open a directory path.
        fs::create_dir_all(root.join("data-state.json")).expect("block data-state path");

        let (mut repository, report) = TaskRepository::bootstrap(root.clone(), "0.2.4", 600)
            .expect(
                "bootstrap must still return the loaded repository when only bookkeeping fails",
            );

        assert_eq!(repository.tasks().len(), 1);
        assert_eq!(repository.tasks()[0].title, "记账失败仍保留");
        assert!(
            !repository.is_write_blocked(),
            "successfully loaded tasks must remain writable"
        );
        assert_eq!(
            fs::read(&tasks_path).expect("tasks still readable"),
            original_bytes,
            "data-state bookkeeping failure must not modify tasks.json"
        );
        assert!(
            report
                .recovery_message
                .as_deref()
                .unwrap_or_default()
                .contains("数据状态")
                || report.recovery_message.is_some(),
            "user should get a non-fatal recovery hint about bookkeeping"
        );

        // Later task mutations must still be allowed (only metadata failed).
        let task = Task::new("新任务", 2).expect("task");
        repository
            .replace_and_save(vec![task])
            .expect("loaded repository must remain writable after bookkeeping failure");
        assert!(tasks_path.exists());
    }

    #[test]
    fn startup_fallback_blocks_writes_when_canonical_tasks_file_exists() {
        let path = test_path("startup-fallback-existing");
        let payload = r#"{"schemaVersion":1,"tasks":[{"id":"a","title":"保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#;
        fs::write(&path, payload).expect("write fixture");
        let original = fs::read(&path).expect("read original");

        let error = RepositoryError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "simulated hard read failure",
        ));
        let mut repository = TaskRepository::for_startup_failure(path.clone(), &error);

        assert!(
            repository.is_write_blocked(),
            "existing tasks.json must force write-blocked startup fallback"
        );
        assert!(repository.tasks().is_empty());

        let write_error = repository
            .replace_and_save(vec![Task::new("不应落盘", 1).expect("task")])
            .expect_err("writes must be blocked over an existing canonical file");
        assert!(
            write_error.to_string().contains("高于当前支持")
                || write_error.to_string().contains("禁止写入")
                || write_error.to_string().contains("保留"),
            "blocked write should surface protection messaging, got: {write_error}"
        );
        assert_eq!(
            fs::read(&path).expect("canonical preserved"),
            original,
            "hard-failure fallback must not rewrite existing tasks.json"
        );
    }

    #[test]
    fn startup_fallback_remains_writable_when_canonical_tasks_file_is_missing() {
        let path = test_path("startup-fallback-missing");
        assert!(!path.exists());

        let error = RepositoryError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "simulated missing path cascade",
        ));
        let mut repository = TaskRepository::for_startup_failure(path.clone(), &error);

        assert!(
            !repository.is_write_blocked(),
            "fresh install without tasks.json must stay writable"
        );
        repository
            .replace_and_save(vec![Task::new("首条", 1).expect("task")])
            .expect("first save on fresh install must succeed");
        assert!(path.exists());
    }

    #[test]
    fn startup_fallback_higher_schema_still_blocks_with_reported_version() {
        let path = test_path("startup-fallback-higher-schema");
        let version = SCHEMA_VERSION + 7;
        let payload = format!(
            r#"{{"schemaVersion":{version},"tasks":[{{"id":"f","title":"未来","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}}]}}"#
        );
        fs::write(&path, &payload).expect("write fixture");
        let original = fs::read(&path).expect("original");

        let error = RepositoryError::UnsupportedSchema(version);
        let mut repository = TaskRepository::for_startup_failure(path.clone(), &error);

        assert!(repository.is_write_blocked());
        let write_error = repository
            .replace_and_save(vec![Task::new("x", 1).expect("task")])
            .expect_err("blocked");
        assert!(write_error.to_string().contains(&version.to_string()));
        assert_eq!(fs::read(path).expect("preserved"), original);
    }

    #[test]
    fn higher_schema_with_incompatible_task_fields_is_not_renamed_corrupt() {
        let path = test_path("higher-schema-incompatible-fields");
        let version = SCHEMA_VERSION + 9;
        // title is an object — incompatible with current Task — but schema must win.
        let payload = format!(
            r#"{{"schemaVersion":{version},"tasks":[{{"id":"future","title":{{"text":"未来任务","locale":"zh"}},"completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null,"priority":"critical"}}]}}"#
        );
        fs::write(&path, &payload).expect("write fixture");
        let original_bytes = fs::read(&path).expect("original");

        let load_error = TaskRepository::load(path.clone()).expect_err("must refuse high schema");
        assert!(
            matches!(load_error, RepositoryError::UnsupportedSchema(v) if v == version),
            "load must surface UnsupportedSchema before Task decode, got: {load_error}"
        );
        assert_eq!(
            fs::read(&path).expect("canonical after load"),
            original_bytes,
            "load must not rename or rewrite the canonical higher-schema file"
        );

        let recover_error = TaskRepository::load_or_recover(path.clone(), 7_777)
            .expect_err("recovery must not treat high schema as corrupt");
        assert!(
            matches!(recover_error, RepositoryError::UnsupportedSchema(v) if v == version),
            "load_or_recover must not rename high schema to corrupt-*, got: {recover_error}"
        );
        assert!(
            path.exists(),
            "canonical tasks.json must remain at the original path"
        );
        assert_eq!(
            fs::read(&path).expect("canonical after recover"),
            original_bytes
        );
        let parent = path.parent().expect("parent");
        let corrupt_like = fs::read_dir(parent)
            .expect("list parent")
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().contains("corrupt"));
        assert!(
            !corrupt_like,
            "must never create a tasks.corrupt-* sibling for higher-schema data"
        );
    }

    #[test]
    fn bootstrap_higher_schema_with_incompatible_fields_stays_in_place_and_write_blocked() {
        let root = test_root("bootstrap-higher-schema-incompatible");
        let tasks_path = root.join("tasks.json");
        let version = SCHEMA_VERSION + 11;
        let payload = format!(
            r#"{{"schemaVersion":{version},"tasks":[{{"id":"x","title":{{"nested":true}},"completed":"yes","createdAtMs":"soon"}}]}}"#
        );
        fs::write(&tasks_path, &payload).expect("write fixture");
        let original_bytes = fs::read(&tasks_path).expect("original");

        let (mut repository, report) =
            TaskRepository::bootstrap(root.clone(), "0.3.0", 8_001).expect("bootstrap starts");

        assert!(repository.tasks().is_empty());
        assert!(repository.is_write_blocked());
        assert!(
            report
                .recovery_message
                .as_deref()
                .unwrap_or_default()
                .contains("高于当前支持"),
            "must report unsupported schema, got: {:?}",
            report.recovery_message
        );
        assert_eq!(
            fs::read(&tasks_path).expect("canonical preserved"),
            original_bytes,
            "bootstrap must not rename higher-schema file to corrupt"
        );
        assert!(
            !root
                .read_dir()
                .expect("root")
                .flatten()
                .any(|entry| entry.file_name().to_string_lossy().contains("corrupt")),
            "no corrupt sibling next to tasks.json"
        );
        repository
            .replace_and_save(vec![Task::new("不应落盘", 1).expect("task")])
            .expect_err("writes blocked");
        assert_eq!(fs::read(&tasks_path).expect("still same"), original_bytes);
        if let Some(state) = read_data_state(&root.join("data-state.json")) {
            assert_ne!(
                state.task_schema_version, SCHEMA_VERSION,
                "must not claim successful schema-1 load for blocked higher schema"
            );
        }
    }

    #[test]
    fn bootstrap_snapshot_failure_is_fail_closed_and_preserves_canonical_bytes() {
        let root = test_root("bootstrap-snapshot-fail-closed");
        let tasks_path = root.join("tasks.json");
        let payload = r#"{"schemaVersion":1,"tasks":[{"id":"keep","title":"快照失败须保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#;
        fs::write(&tasks_path, payload).expect("write tasks");
        let original_bytes = fs::read(&tasks_path).expect("original");

        // Force pre-upgrade snapshot failure: backups path is a file, not a directory.
        fs::write(root.join("backups"), b"not-a-directory").expect("block backups dir");

        let (mut repository, report) = TaskRepository::bootstrap(root.clone(), "0.3.1", 9_001)
            .expect("bootstrap should surface a protected startup result, not panic");

        assert!(
            repository.is_write_blocked(),
            "snapshot failure must not leave a writable loaded repository"
        );
        assert!(
            repository.tasks().is_empty(),
            "fail-closed path must not load tasks into a migratable in-memory state"
        );
        assert_eq!(
            fs::read(&tasks_path).expect("canonical readable"),
            original_bytes,
            "snapshot failure must not overwrite or rename tasks.json"
        );
        let message = report.recovery_message.unwrap_or_default();
        assert!(
            message.contains("升级前备份失败") || message.contains("中止"),
            "user must get a clear snapshot-failure recovery message, got: {message}"
        );
        repository
            .replace_and_save(vec![Task::new("不应落盘", 2).expect("task")])
            .expect_err("writes must stay blocked after snapshot failure");
        assert_eq!(
            fs::read(&tasks_path).expect("canonical after blocked write"),
            original_bytes
        );
        // Do not claim a successful current-schema load via data-state.
        if let Some(state) = read_data_state(&root.join("data-state.json")) {
            assert_ne!(
                state.task_schema_version, SCHEMA_VERSION,
                "snapshot failure must not record successful schema-1 bookkeeping"
            );
            assert_ne!(
                state.last_app_version, "0.3.1",
                "must not advance lastAppVersion when upgrade snapshot failed"
            );
        }
    }

    #[test]
    fn bootstrap_higher_schema_does_not_create_duplicate_upgrade_snapshots() {
        let root = test_root("bootstrap-higher-schema-snapshot-idempotent");
        let tasks_path = root.join("tasks.json");
        let version = SCHEMA_VERSION + 4;
        let payload = format!(
            r#"{{"schemaVersion":{version},"tasks":[{{"id":"future","title":{{"text":"幂等"}},"completed":false,"createdAtMs":1}}]}}"#
        );
        fs::write(&tasks_path, &payload).expect("write fixture");

        let (_repo1, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.2", 10_001).expect("first boot");
        let backups_dir = root.join("backups");
        let count_after_first = if backups_dir.is_dir() {
            fs::read_dir(&backups_dir).expect("backups").count()
        } else {
            0
        };
        assert!(
            count_after_first >= 1,
            "first blocked higher-schema boot may still take one upgrade snapshot"
        );

        let (_repo2, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.2", 10_002).expect("second boot");
        let count_after_second = fs::read_dir(&backups_dir).expect("backups").count();
        assert_eq!(
            count_after_first, count_after_second,
            "same app version and identical source bytes must not create another upgrade snapshot"
        );

        // Still blocked; still not claiming schema-1 success.
        let (repo3, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.2", 10_003).expect("third boot");
        assert!(repo3.is_write_blocked());
        if let Some(state) = read_data_state(&root.join("data-state.json")) {
            assert_ne!(state.task_schema_version, SCHEMA_VERSION);
        }
        assert_eq!(
            fs::read_dir(&backups_dir).expect("backups").count(),
            count_after_first
        );
    }

    #[test]
    fn bootstrap_snapshot_failure_retries_without_unbounded_identical_snapshots() {
        let root = test_root("bootstrap-snapshot-fail-idempotent");
        let tasks_path = root.join("tasks.json");
        let payload = r#"{"schemaVersion":1,"tasks":[{"id":"a","title":"保留","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#;
        fs::write(&tasks_path, payload).expect("write tasks");

        // First boots: snapshot path blocked → fail-closed, no successful snapshot files.
        fs::write(root.join("backups"), b"not-a-directory").expect("block backups");
        let (repo1, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.3", 11_001).expect("fail-closed boot 1");
        assert!(repo1.is_write_blocked());
        let (repo2, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.3", 11_002).expect("fail-closed boot 2");
        assert!(repo2.is_write_blocked());
        assert!(
            root.join("backups").is_file(),
            "failed snapshot path must not accumulate backup files while still blocked"
        );

        // Unblock backups: exactly one successful upgrade snapshot for these source bytes.
        fs::remove_file(root.join("backups")).expect("remove blocker");
        let (repo3, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.3", 11_003).expect("successful snapshot");
        // Schema-1 load can proceed after snapshot succeeds.
        assert!(!repo3.is_write_blocked());
        assert_eq!(repo3.tasks().len(), 1);
        let backups_after_success = fs::read_dir(root.join("backups"))
            .expect("backups dir")
            .count();
        assert_eq!(backups_after_success, 1, "one snapshot after recovery");

        let (repo4, _) =
            TaskRepository::bootstrap(root.clone(), "0.3.3", 11_004).expect("idempotent boot");
        assert_eq!(repo4.tasks().len(), 1);
        assert_eq!(
            fs::read_dir(root.join("backups"))
                .expect("backups dir")
                .count(),
            backups_after_success,
            "same version must not re-snapshot after data-state records success"
        );
    }
}
