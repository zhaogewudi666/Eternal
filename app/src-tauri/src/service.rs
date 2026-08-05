use crate::model::{Reminder, Task};
use crate::repository::TaskRepository;

#[derive(Debug)]
pub struct TaskService {
    repository: TaskRepository,
}

impl TaskService {
    pub fn new(repository: TaskRepository) -> Self {
        Self { repository }
    }

    pub fn list(&self) -> Vec<Task> {
        self.repository.tasks().to_vec()
    }

    pub fn create(&mut self, title: &str, now_ms: i64) -> Result<Task, String> {
        self.ensure_writable()?;
        let task = Task::new(title, now_ms)?;
        let mut tasks = self.repository.tasks().to_vec();
        tasks.insert(0, task.clone());
        self.repository
            .replace_and_save(tasks)
            .map_err(to_message)?;
        Ok(task)
    }

    pub fn toggle(&mut self, id: &str, now_ms: i64) -> Result<Task, String> {
        self.ensure_writable()?;
        self.update_task(id, |task| task.toggle(now_ms))
    }

    pub fn set_reminder(
        &mut self,
        id: &str,
        next_at_ms: i64,
        repeat_every_minutes: Option<u32>,
    ) -> Result<Task, String> {
        self.ensure_writable()?;
        if repeat_every_minutes == Some(0) {
            return Err("重复间隔必须大于 0 分钟".to_string());
        }
        if next_at_ms <= 0 {
            return Err("提醒时间无效".to_string());
        }

        self.update_task(id, |task| {
            task.reminder = Some(Reminder {
                next_at_ms,
                repeat_every_minutes,
                last_fired_at_ms: None,
            });
        })
    }

    pub fn clear_reminder(&mut self, id: &str) -> Result<Task, String> {
        self.ensure_writable()?;
        self.update_task(id, |task| task.reminder = None)
    }

    pub fn rename(&mut self, id: &str, title: &str) -> Result<Task, String> {
        self.ensure_writable()?;
        let title = title.trim();
        if title.is_empty() {
            return Err("待办内容不能为空".to_string());
        }
        self.update_task(id, |task| task.title = title.to_string())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        self.ensure_writable()?;
        let mut tasks = self.repository.tasks().to_vec();
        let before = tasks.len();
        tasks.retain(|task| task.id != id);
        if tasks.len() == before {
            return Err("找不到这项待办".to_string());
        }
        self.repository
            .replace_and_save(tasks)
            .map_err(to_message)?;
        Ok(())
    }

    pub fn replace_all(&mut self, tasks: Vec<Task>) -> Result<(), String> {
        self.ensure_writable()?;
        self.repository.replace_and_save(tasks).map_err(to_message)
    }

    fn ensure_writable(&self) -> Result<(), String> {
        self.repository.ensure_writable().map_err(to_message)
    }

    fn update_task(&mut self, id: &str, update: impl FnOnce(&mut Task)) -> Result<Task, String> {
        let mut tasks = self.repository.tasks().to_vec();
        let task = tasks
            .iter_mut()
            .find(|task| task.id == id)
            .ok_or_else(|| "找不到这项待办".to_string())?;
        update(task);
        let updated = task.clone();
        self.repository
            .replace_and_save(tasks)
            .map_err(to_message)?;
        Ok(updated)
    }
}

fn to_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::repository::TaskRepository;

    use super::TaskService;

    fn service() -> TaskService {
        let root = std::env::temp_dir().join(format!("eternal-service-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create test directory");
        let repository =
            TaskRepository::load(root.join("tasks.json")).expect("empty repository loads");
        TaskService::new(repository)
    }

    #[test]
    fn creates_new_tasks_at_the_top_and_lists_them_in_order() {
        let mut service = service();
        service.create("第一项", 100).expect("create first");
        let newest = service.create("第二项", 200).expect("create second");

        let tasks = service.list();
        assert_eq!(tasks[0].id, newest.id);
        assert_eq!(
            tasks
                .iter()
                .map(|task| task.title.as_str())
                .collect::<Vec<_>>(),
            vec!["第二项", "第一项"]
        );
    }

    #[test]
    fn toggles_a_task_and_persists_the_new_state() {
        let mut service = service();
        let task = service.create("提交周报", 100).expect("create task");

        let updated = service.toggle(&task.id, 200).expect("toggle task");

        assert!(updated.completed);
        assert_eq!(service.list()[0].completed_at_ms, Some(200));
    }

    #[test]
    fn sets_and_clears_a_valid_reminder() {
        let mut service = service();
        let task = service.create("喝水", 100).expect("create task");

        let updated = service
            .set_reminder(&task.id, 5_000, Some(30))
            .expect("set reminder");
        assert_eq!(
            updated
                .reminder
                .as_ref()
                .and_then(|reminder| reminder.repeat_every_minutes),
            Some(30)
        );

        let cleared = service.clear_reminder(&task.id).expect("clear reminder");
        assert_eq!(cleared.reminder, None);
    }

    #[test]
    fn rejects_zero_minute_repeating_reminders() {
        let mut service = service();
        let task = service.create("喝水", 100).expect("create task");

        let error = service.set_reminder(&task.id, 5_000, Some(0)).unwrap_err();

        assert_eq!(error, "重复间隔必须大于 0 分钟");
    }

    #[test]
    fn deletes_a_task_and_persists_the_remaining_list() {
        let mut service = service();
        let first = service.create("第一项", 100).expect("create first");
        let second = service.create("第二项", 200).expect("create second");

        service.delete(&first.id).expect("delete first");

        let tasks = service.list();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, second.id);
        assert_eq!(tasks[0].title, "第二项");
    }

    #[test]
    fn renames_a_task_title_and_preserves_other_fields() {
        let mut service = service();
        let task = service.create("旧标题", 100).expect("create task");
        service
            .set_reminder(&task.id, 5_000, Some(30))
            .expect("set reminder");

        let updated = service.rename(&task.id, "  新标题  ").expect("rename");

        assert_eq!(updated.title, "新标题");
        assert_eq!(updated.id, task.id);
        assert!(!updated.completed);
        assert_eq!(updated.created_at_ms, 100);
        assert_eq!(
            updated
                .reminder
                .as_ref()
                .and_then(|reminder| reminder.repeat_every_minutes),
            Some(30)
        );
        assert_eq!(service.list()[0].title, "新标题");
    }

    #[test]
    fn rejects_blank_renames_without_touching_storage() {
        let mut service = service();
        let task = service.create("保持不变", 100).expect("create task");

        let error = service.rename(&task.id, "   ").unwrap_err();

        assert_eq!(error, "待办内容不能为空");
        assert_eq!(service.list()[0].title, "保持不变");
    }

    #[test]
    fn rename_returns_a_missing_id_error_without_changing_storage() {
        let mut service = service();
        let task = service.create("仍在", 100).expect("create task");

        let error = service.rename("missing-id", "新名字").unwrap_err();

        assert_eq!(error, "找不到这项待办");
        assert_eq!(service.list()[0].title, "仍在");
    }

    #[test]
    fn delete_returns_a_missing_id_error_without_changing_storage() {
        let mut service = service();
        let task = service.create("仍在", 100).expect("create task");

        let error = service.delete("missing-id").unwrap_err();

        assert_eq!(error, "找不到这项待办");
        assert_eq!(service.list().len(), 1);
        assert_eq!(service.list()[0].id, task.id);
    }

    #[test]
    fn deleting_a_task_also_removes_its_reminder() {
        let mut service = service();
        let task = service.create("带提醒", 100).expect("create task");
        service
            .set_reminder(&task.id, 5_000, Some(30))
            .expect("set reminder");
        let other = service.create("保留", 200).expect("create other");

        service.delete(&task.id).expect("delete reminded task");

        let tasks = service.list();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, other.id);
        assert_eq!(tasks[0].reminder, None);
        assert!(service
            .list()
            .iter()
            .all(|candidate| candidate.id != task.id));
    }

    #[test]
    fn higher_schema_bootstrap_blocks_all_service_mutations_without_touching_file() {
        let root = std::env::temp_dir().join(format!(
            "eternal-service-higher-schema-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let tasks_path = root.join("tasks.json");
        // Current supported schema is 1; any higher version must stay write-blocked.
        let payload = r#"{"schemaVersion":99,"tasks":[{"id":"keep","title":"高版本","completed":false,"createdAtMs":1,"completedAtMs":null,"reminder":null}]}"#;
        fs::write(&tasks_path, &payload).expect("write fixture");
        let original = fs::read(&tasks_path).expect("original bytes");

        let (repository, report) =
            TaskRepository::bootstrap(root.clone(), "0.2.4", 900).expect("bootstrap");
        assert!(report.recovery_message.is_some());
        let mut service = TaskService::new(repository);

        let create_error = service.create("新任务", 100).expect_err("create blocked");
        assert!(
            create_error.contains("高于当前支持") || create_error.contains("禁止写入"),
            "create error: {create_error}"
        );
        assert_eq!(fs::read(&tasks_path).expect("after create"), original);

        let toggle_error = service.toggle("keep", 200).expect_err("toggle blocked");
        assert!(
            toggle_error.contains("高于当前支持")
                || toggle_error.contains("禁止写入")
                || toggle_error.contains("找不到这项待办"),
            "toggle error: {toggle_error}"
        );
        assert_eq!(fs::read(&tasks_path).expect("after toggle"), original);

        let delete_error = service.delete("keep").expect_err("delete blocked");
        assert!(
            delete_error.contains("高于当前支持")
                || delete_error.contains("禁止写入")
                || delete_error.contains("找不到这项待办"),
            "delete error: {delete_error}"
        );
        assert_eq!(fs::read(&tasks_path).expect("after delete"), original);

        let replace_error = service
            .replace_all(vec![])
            .expect_err("replace_all blocked");
        assert!(
            replace_error.contains("高于当前支持") || replace_error.contains("禁止写入"),
            "replace_all error: {replace_error}"
        );
        assert_eq!(fs::read(&tasks_path).expect("after replace_all"), original);
        assert_eq!(service.list().len(), 0);
    }
}
