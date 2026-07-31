import { useEffect, useState } from "react";

function toLocalInputValue(timestamp) {
  const date = new Date(timestamp || Date.now() + 15 * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ReminderEditor({ task, onSave, onClear, onClose }) {
  const [at, setAt] = useState(toLocalInputValue(task.reminder?.nextAtMs));
  const [repeat, setRepeat] = useState(
    String(task.reminder?.repeatEveryMinutes || ""),
  );
  const [currentTime, setCurrentTime] = useState(Date.now);

  useEffect(() => {
    setAt(toLocalInputValue(task.reminder?.nextAtMs));
    setRepeat(String(task.reminder?.repeatEveryMinutes || ""));
  }, [task]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const timestamp = new Date(at).getTime();
  const canSave = Number.isFinite(timestamp) && timestamp > currentTime;

  return (
    <section className="popover reminder-editor" aria-label="编辑提醒">
      <header className="popover-header">
        <div>
          <strong>提醒</strong>
          <span>{task.title}</span>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          取消
        </button>
      </header>
      <label className="field">
        <span>时间</span>
        <input
          type="datetime-local"
          autoFocus
          value={at}
          onChange={(event) => setAt(event.target.value)}
        />
      </label>
      <label className="field">
        <span>重复</span>
        <select value={repeat} onChange={(event) => setRepeat(event.target.value)}>
          <option value="">仅一次</option>
          <option value="15">每 15 分钟</option>
          <option value="30">每 30 分钟</option>
          <option value="60">每小时</option>
          <option value="120">每 2 小时</option>
          <option value="1440">每天</option>
        </select>
      </label>
      <div className="popover-actions">
        {task.reminder && (
          <button className="danger-button" type="button" onClick={onClear}>
            移除提醒
          </button>
        )}
        <button
          className="primary-button"
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave(
              timestamp,
              repeat ? Number.parseInt(repeat, 10) : null,
            )
          }
        >
          保存
        </button>
      </div>
    </section>
  );
}
