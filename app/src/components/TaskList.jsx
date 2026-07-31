import { BellSimple, Check, Repeat } from "@phosphor-icons/react";

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

function TaskRow({
  task,
  selected,
  showStatus,
  onSelect,
  onToggle,
  onEditReminder,
}) {
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
      {showStatus && (
        <span
          className={`task-status ${task.completed ? "is-completed" : ""}`}
        >
          {task.completed ? "已完成" : "待办"}
        </span>
      )}
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

function TaskSection({
  tasks,
  sectionId,
  sectionRef,
  heading,
  emptyMessage,
  selectedId,
  showStatus,
  quiet,
  onSelect,
  onToggle,
  onEditReminder,
}) {
  if (!tasks.length && !emptyMessage) return null;

  return (
    <div
      className={`task-section ${quiet ? "is-quiet" : ""}`}
      data-section={sectionId}
      ref={sectionRef}
    >
      {heading ? <h2 className="task-section-heading">{heading}</h2> : null}
      <div className="task-group">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              showStatus={showStatus}
              onSelect={onSelect}
              onToggle={onToggle}
              onEditReminder={onEditReminder}
            />
          ))
        ) : (
          <div className="empty-state">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}

export function TaskList({
  activeTasks,
  completedTasks,
  emptyActiveMessage,
  emptySearchMessage,
  selectedId,
  showStatus = false,
  isSearching = false,
  activeSectionRef,
  completedSectionRef,
  onSelect,
  onToggle,
  onEditReminder,
}) {
  const hasAny = activeTasks.length > 0 || completedTasks.length > 0;

  if (isSearching && !hasAny) {
    return (
      <section className="task-list" aria-label="搜索结果">
        <div className="empty-state">{emptySearchMessage}</div>
      </section>
    );
  }

  if (!isSearching && !hasAny) {
    return (
      <section className="task-list" aria-label="任务列表">
        <div className="empty-state">{emptyActiveMessage}</div>
      </section>
    );
  }

  return (
    <section
      className="task-list"
      aria-label={isSearching ? "搜索结果" : "任务列表"}
    >
      <TaskSection
        tasks={activeTasks}
        sectionId="active"
        sectionRef={activeSectionRef}
        selectedId={selectedId}
        showStatus={showStatus}
        quiet={false}
        onSelect={onSelect}
        onToggle={onToggle}
        onEditReminder={onEditReminder}
      />
      <TaskSection
        tasks={completedTasks}
        sectionId="completed"
        sectionRef={completedSectionRef}
        heading={completedTasks.length ? "已完成" : null}
        selectedId={selectedId}
        showStatus={showStatus}
        quiet
        onSelect={onSelect}
        onToggle={onToggle}
        onEditReminder={onEditReminder}
      />
    </section>
  );
}
