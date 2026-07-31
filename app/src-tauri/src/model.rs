use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub next_at_ms: i64,
    pub repeat_every_minutes: Option<u32>,
    pub last_fired_at_ms: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub created_at_ms: i64,
    pub completed_at_ms: Option<i64>,
    pub reminder: Option<Reminder>,
}

impl Task {
    pub fn new(title: &str, now_ms: i64) -> Result<Self, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("待办内容不能为空".to_string());
        }

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            completed: false,
            created_at_ms: now_ms,
            completed_at_ms: None,
            reminder: None,
        })
    }

    pub fn toggle(&mut self, now_ms: i64) {
        self.completed = !self.completed;
        self.completed_at_ms = self.completed.then_some(now_ms);
    }
}

#[cfg(test)]
mod tests {
    use super::Task;

    #[test]
    fn rejects_blank_task_titles() {
        let result = Task::new("   ", 1_000);

        assert_eq!(result.unwrap_err(), "待办内容不能为空");
    }

    #[test]
    fn creates_an_incomplete_task_with_a_trimmed_title() {
        let task = Task::new("  提交周报  ", 1_000).expect("task should be valid");

        assert_eq!(task.title, "提交周报");
        assert!(!task.completed);
        assert_eq!(task.created_at_ms, 1_000);
        assert_eq!(task.completed_at_ms, None);
        assert_eq!(task.reminder, None);
    }

    #[test]
    fn toggling_a_task_records_and_clears_completion_time() {
        let mut task = Task::new("提交周报", 1_000).expect("task should be valid");

        task.toggle(2_000);
        assert!(task.completed);
        assert_eq!(task.completed_at_ms, Some(2_000));

        task.toggle(3_000);
        assert!(!task.completed);
        assert_eq!(task.completed_at_ms, None);
    }
}
