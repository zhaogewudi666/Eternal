import { BellSimple, Check, PencilSimple, Repeat, Trash } from "@phosphor-icons/react";
import { useRef, useState } from "react";

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
  onRename,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const committedRef = useRef(false);
  const completed = visualCompleted ?? task.completed;
  const hasReminder = Boolean(task.reminder);
  const reminderName = hasReminder
    ? `编辑提醒：${task.title}`
    : `设置提醒：${task.title}`;

  function startEditing() {
    committedRef.current = false;
    setDraft(task.title);
    setEditing(true);
  }

  function commitEdit() {
    if (!editing || committedRef.current) return;
    committedRef.current = true;
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== task.title) {
      onRename(task.id, trimmed);
    }
  }

  function cancelEdit() {
    committedRef.current = true;
    setDraft(task.title);
    setEditing(false);
  }

  function handleRowClick(event) {
    // Row action buttons manage their own clicks; do not toggle expansion.
    if (event.target.closest("button")) return;
    setExpanded((value) => !value);
  }

  return (
    <div
      className={`task-row ${selected ? "is-selected" : ""} ${
        completed ? "is-completed" : ""
      } ${isTransitioning ? "is-toggling" : ""} ${
        expanded ? "is-expanded" : ""
      }`}
      data-task-id={task.id}
      onMouseDown={() => onSelect(task.id)}
      onClick={handleRowClick}
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
      {editing ? (
        <input
          className="task-title-input"
          aria-label="编辑任务标题"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.stopPropagation();
              commitEdit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelEdit();
            }
          }}
          onBlur={commitEdit}
        />
      ) : (
        <span className="task-title">{task.title}</span>
      )}
      {showStatus && (
        <span
          className={`task-status ${completed ? "is-completed" : ""}`}
        >
          {completed ? "已完成" : "待办"}
        </span>
      )}
      <div className="task-actions">
        {expanded && !editing && (
          <button
            className="row-edit"
            type="button"
            aria-label={`编辑：${task.title}`}
            onClick={startEditing}
          >
            <PencilSimple size={14} weight="regular" aria-hidden="true" />
          </button>
        )}
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
  onRename,
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
                onRename={onRename}
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
  onRename,
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
        onRename={onRename}
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
        onRename={onRename}
      />
    </section>
  );
}
