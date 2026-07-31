use serde::Serialize;

use crate::model::Task;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueReminder {
    pub task_id: String,
    pub title: String,
}

pub fn collect_due(tasks: &mut [Task], now_ms: i64) -> Vec<DueReminder> {
    let mut due = Vec::new();

    for task in tasks {
        if task.completed {
            continue;
        }

        let Some(reminder) = task.reminder.as_mut() else {
            continue;
        };

        if reminder.next_at_ms > now_ms || reminder.last_fired_at_ms == Some(now_ms) {
            continue;
        }

        due.push(DueReminder {
            task_id: task.id.clone(),
            title: task.title.clone(),
        });

        match reminder.repeat_every_minutes.filter(|minutes| *minutes > 0) {
            Some(minutes) => {
                let interval_ms = i64::from(minutes) * 60_000;
                while reminder.next_at_ms <= now_ms {
                    reminder.next_at_ms += interval_ms;
                }
                reminder.last_fired_at_ms = Some(now_ms);
            }
            None => {
                task.reminder = None;
            }
        }
    }

    due
}

#[cfg(test)]
mod tests {
    use crate::model::{Reminder, Task};

    use super::collect_due;

    fn task_with_reminder(reminder: Reminder) -> Task {
        let mut task = Task::new("喝水", 100).expect("valid task");
        task.reminder = Some(reminder);
        task
    }

    #[test]
    fn one_time_reminder_fires_once_and_is_cleared() {
        let mut tasks = vec![task_with_reminder(Reminder {
            next_at_ms: 1_000,
            repeat_every_minutes: None,
            last_fired_at_ms: None,
        })];

        let due = collect_due(&mut tasks, 1_000);

        assert_eq!(due.len(), 1);
        assert_eq!(due[0].title, "喝水");
        assert_eq!(tasks[0].reminder, None);
        assert!(collect_due(&mut tasks, 2_000).is_empty());
    }

    #[test]
    fn repeating_reminder_advances_beyond_now_without_duplicate_firing() {
        let mut tasks = vec![task_with_reminder(Reminder {
            next_at_ms: 1_000,
            repeat_every_minutes: Some(1),
            last_fired_at_ms: None,
        })];

        let due = collect_due(&mut tasks, 121_000);

        assert_eq!(due.len(), 1);
        let reminder = tasks[0].reminder.as_ref().expect("reminder remains");
        assert_eq!(reminder.last_fired_at_ms, Some(121_000));
        assert_eq!(reminder.next_at_ms, 181_000);
        assert!(collect_due(&mut tasks, 121_000).is_empty());
    }

    #[test]
    fn completed_tasks_do_not_fire_reminders() {
        let mut task = task_with_reminder(Reminder {
            next_at_ms: 1_000,
            repeat_every_minutes: None,
            last_fired_at_ms: None,
        });
        task.toggle(900);
        let mut tasks = vec![task];

        assert!(collect_due(&mut tasks, 1_000).is_empty());
        assert!(tasks[0].reminder.is_some());
    }
}
