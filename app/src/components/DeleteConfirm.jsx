export function DeleteConfirm({ task, onConfirm, onClose }) {
  if (!task) return null;

  const descriptionId = "delete-confirm-description";

  return (
    <section
      className="popover delete-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      aria-describedby={descriptionId}
    >
      <header className="popover-header">
        <div>
          <strong id="delete-confirm-title">删除任务</strong>
          <span id={descriptionId}>
            将永久移除「{task.title}」及其提醒
          </span>
        </div>
      </header>
      <div className="popover-actions">
        <button className="text-button" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="primary-button danger-confirm"
          type="button"
          autoFocus
          onClick={onConfirm}
        >
          删除
        </button>
      </div>
    </section>
  );
}
