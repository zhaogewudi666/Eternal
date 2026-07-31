import {
  BellSimple,
  CaretRight,
  Check,
  Repeat,
} from "@phosphor-icons/react";

function reminderLabel(reminder) {
  if (!reminder) return "";
  if (reminder.repeatEveryMinutes) {
    return `每 ${reminder.repeatEveryMinutes} 分钟`;
  }

  const date = new Date(reminder.nextAtMs);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TaskRow({ task, selected, onSelect, onToggle, onEditReminder }) {
  return (
    <div
      className={`task-row ${selected ? "is-selected" : ""} ${
        task.completed ? "is-completed" : ""
      }`}
      data-task-id={task.id}
      onMouseDown={() => onSelect(task.id)}
    >
      <button
        className="task-checkbox"
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={`${task.completed ? "恢复" : "完成"}：${task.title}`}
        onClick={() => onToggle(task.id)}
      >
        {task.completed && <Check size={12} weight="bold" aria-hidden="true" />}
      </button>
      <span className="task-title">{task.title}</span>
      {task.reminder && (
        <button
          className="reminder-pill"
          type="button"
          aria-label={`编辑提醒：${task.title}`}
          onClick={() => onEditReminder(task.id)}
        >
          {task.reminder.repeatEveryMinutes ? (
            <Repeat size={15} weight="regular" />
          ) : (
            <BellSimple size={15} weight="regular" />
          )}
          <span>{reminderLabel(task.reminder)}</span>
        </button>
      )}
    </div>
  );
}

export function TaskList({
  activeTasks,
  completedTasks,
  selectedId,
  completedOpen,
  completedLocked = false,
  onSelect,
  onToggle,
  onEditReminder,
  onToggleCompleted,
}) {
  return (
    <section className="task-list" aria-label="待办列表">
      <div className="task-group">
        {activeTasks.length ? (
          activeTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              onSelect={onSelect}
              onToggle={onToggle}
              onEditReminder={onEditReminder}
            />
          ))
        ) : (
          <div className="empty-state">现在没有未完成的事情</div>
        )}
      </div>

      {!!completedTasks.length && (
        <div className="completed-section">
          <button
            className="completed-toggle"
            type="button"
            disabled={completedLocked}
            aria-expanded={completedOpen}
            aria-label={
              completedLocked
                ? "搜索到的已完成任务"
                : `${completedOpen ? "隐藏" : "显示"}已完成任务`
            }
            onClick={onToggleCompleted}
          >
            <CaretRight
              size={15}
              className={completedOpen ? "is-open" : ""}
            />
            <span>已完成</span>
            <span className="completed-count">{completedTasks.length}</span>
          </button>
          {completedOpen &&
            completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedId === task.id}
                onSelect={onSelect}
                onToggle={onToggle}
                onEditReminder={onEditReminder}
              />
            ))}
        </div>
      )}
    </section>
  );
}
