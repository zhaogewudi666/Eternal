use std::fmt;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::model::Task;

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug)]
pub struct TaskRepository {
    path: PathBuf,
    tasks: Vec<Task>,
}

#[derive(Debug)]
pub enum RepositoryError {
    Io(std::io::Error),
    Decode(serde_json::Error),
    Encode(serde_json::Error),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法保存待办数据：{error}"),
            Self::Decode(error) => write!(formatter, "无法读取待办数据：{error}"),
            Self::Encode(error) => write!(formatter, "无法编码待办数据：{error}"),
        }
    }
}

impl std::error::Error for RepositoryError {}

impl From<std::io::Error> for RepositoryError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoreFile {
    schema_version: u32,
    tasks: Vec<Task>,
}

impl TaskRepository {
    pub fn empty(path: PathBuf) -> Self {
        Self {
            path,
            tasks: Vec::new(),
        }
    }

    pub fn load(path: PathBuf) -> Result<Self, RepositoryError> {
        if !path.exists() {
            return Ok(Self::empty(path));
        }

        let bytes = fs::read(&path)?;
        let store: StoreFile = serde_json::from_slice(&bytes).map_err(RepositoryError::Decode)?;

        Ok(Self {
            path,
            tasks: store.tasks,
        })
    }

    pub fn load_or_recover(
        path: PathBuf,
        recovery_timestamp_ms: i64,
    ) -> Result<(Self, Option<PathBuf>), RepositoryError> {
        match Self::load(path.clone()) {
            Ok(repository) => Ok((repository, None)),
            Err(RepositoryError::Decode(_)) => {
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use crate::model::{Reminder, Task};

    use super::TaskRepository;

    fn test_path(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "eternal-repository-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        root.join("tasks.json")
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
}
