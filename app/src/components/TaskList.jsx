import { BellSimple, Check, Repeat, Trash } from "@phosphor-icons/react";

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
  visualCompleted,
  isTransitioning,
  onSelect,
  onToggle,
  onEditReminder,
  onRequestDelete,
}) {
  const completed = visualCompleted ?? task.completed;
  const hasReminder = Boolean(task.reminder);
  const reminderName = hasReminder
    ? `编辑提醒：${task.title}`
    : `设置提醒：${task.title}`;

  return (
    <div
      className={`task-row ${selected ? "is-selected" : ""} ${
        completed ? "is-completed" : ""
      } ${isTransitioning ? "is-toggling" : ""}`}
      data-task-id={task.id}
      onMouseDown={() => onSelect(task.id)}
    >
      <button
        className="task-checkbox"
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={`${completed ? "恢复" : "完成"}：${task.title}`}
        onClick={() => onToggle(task.id)}
      >
        {completed && <Check size={12} weight="bold" aria-hidden="true" />}
      </button>
      <span className="task-title">{task.title}</span>
      {showStatus && (
        <span
          className={`task-status ${completed ? "is-completed" : ""}`}
        >
          {completed ? "已完成" : "待办"}
        </span>
      )}
      <div className="task-actions">
        <button
          className={`reminder-control ${hasReminder ? "has-reminder" : ""}`}
          type="button"
          aria-label={reminderName}
          onClick={() => onEditReminder(task.id)}
        >
          {task.reminder?.repeatEveryMinutes ? (
            <Repeat size={15} weight="regular" aria-hidden="true" />
          ) : (
            <BellSimple size={15} weight="regular" aria-hidden="true" />
          )}
          {hasReminder ? <span>{reminderLabel(task.reminder)}</span> : null}
        </button>
        <button
          className="row-delete"
          type="button"
          aria-label={`删除：${task.title}`}
          onClick={() => onRequestDelete(task.id)}
        >
          <Trash size={14} weight="regular" aria-hidden="true" />
        </button>
      </div>
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
  toggleTransition,
  onSelect,
  onToggle,
  onEditReminder,
  onRequestDelete,
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
          tasks.map((task) => {
            const isTransitioning = toggleTransition?.id === task.id;
            const visualCompleted = isTransitioning
              ? toggleTransition.updated.completed
              : task.completed;
            return (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedId === task.id}
                showStatus={showStatus}
                visualCompleted={visualCompleted}
                isTransitioning={isTransitioning}
                onSelect={onSelect}
                onToggle={onToggle}
                onEditReminder={onEditReminder}
                onRequestDelete={onRequestDelete}
              />
            );
          })
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
  toggleTransition = null,
  onSelect,
  onToggle,
  onEditReminder,
  onRequestDelete,
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
        toggleTransition={toggleTransition}
        onSelect={onSelect}
        onToggle={onToggle}
        onEditReminder={onEditReminder}
        onRequestDelete={onRequestDelete}
      />
      <TaskSection
        tasks={completedTasks}
        sectionId="completed"
        sectionRef={completedSectionRef}
        heading={completedTasks.length ? "已完成" : null}
        selectedId={selectedId}
        showStatus={showStatus}
        quiet
        toggleTransition={toggleTransition}
        onSelect={onSelect}
        onToggle={onToggle}
        onEditReminder={onEditReminder}
        onRequestDelete={onRequestDelete}
      />
    </section>
  );
}
