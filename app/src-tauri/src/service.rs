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
        let task = Task::new(title, now_ms)?;
        let mut tasks = self.repository.tasks().to_vec();
        tasks.insert(0, task.clone());
        self.repository
            .replace_and_save(tasks)
            .map_err(to_message)?;
        Ok(task)
    }

    pub fn toggle(&mut self, id: &str, now_ms: i64) -> Result<Task, String> {
        self.update_task(id, |task| task.toggle(now_ms))
    }

    pub fn set_reminder(
        &mut self,
        id: &str,
        next_at_ms: i64,
        repeat_every_minutes: Option<u32>,
    ) -> Result<Task, String> {
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
        self.update_task(id, |task| task.reminder = None)
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
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
        self.repository.replace_and_save(tasks).map_err(to_message)
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
}
