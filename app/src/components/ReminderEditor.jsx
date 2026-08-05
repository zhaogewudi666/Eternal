import { useEffect, useRef, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";

import {
  reminderPresetAt,
  toLocalInputValue,
} from "../model/reminder-time";

const PRESETS = [
  { id: "15m", label: "15 分钟" },
  { id: "1h", label: "1 小时" },
  { id: "tonight", label: "今晚" },
  { id: "tomorrow", label: "明天" },
];

export function ReminderEditor({ task, onSave, onClear, onClose, onRename }) {
  const [at, setAt] = useState(toLocalInputValue(task.reminder?.nextAtMs));
  const [repeat, setRepeat] = useState(
    String(task.reminder?.repeatEveryMinutes || ""),
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleCommittedRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const timeInputRef = useRef(null);

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

  function applyPreset(presetId) {
    setAt(toLocalInputValue(reminderPresetAt(presetId, Date.now())));
    // Keep keyboard confirmation on the time field after filling a preset.
    timeInputRef.current?.focus();
  }

  function trySave() {
    if (!canSave) return;
    onSave(timestamp, repeat ? Number.parseInt(repeat, 10) : null);
  }

  function startEditingTitle() {
    titleCommittedRef.current = false;
    setTitleDraft(task.title);
    setEditingTitle(true);
  }

  function commitTitle() {
    if (!editingTitle || titleCommittedRef.current) return;
    titleCommittedRef.current = true;
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (trimmed && trimmed !== task.title) {
      onRename?.(task.id, trimmed);
    }
  }

  function cancelTitle() {
    titleCommittedRef.current = true;
    setTitleDraft(task.title);
    setEditingTitle(false);
  }

  function handleKeyDown(event) {
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    // Native <select> uses Enter to commit an option — do not save then.
    // Buttons activate via their own click path; avoid double-firing save.
    const tag = event.target?.tagName;
    if (tag === "SELECT" || tag === "BUTTON") return;

    event.preventDefault();
    event.stopPropagation();
    trySave();
  }

  return (
    <section
      className="popover reminder-editor"
      aria-label="编辑提醒"
      onKeyDown={handleKeyDown}
    >
      <header className="popover-header">
        <div className="title-edit">
          <strong>提醒</strong>
          {editingTitle ? (
            <input
              className="title-input"
              aria-label="编辑任务标题"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTitle();
                }
              }}
              onBlur={commitTitle}
            />
          ) : (
            <span>{task.title}</span>
          )}
        </div>
        <div className="popover-header-actions">
          {!editingTitle && (
            <button
              className="title-edit-button"
              type="button"
              aria-label="编辑标题"
              onClick={startEditingTitle}
            >
              <PencilSimple size={13} weight="regular" aria-hidden="true" />
            </button>
          )}
          <button className="text-button" type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </header>
      <div className="reminder-presets" role="group" aria-label="快捷时间">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-chip"
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>时间</span>
        <input
          ref={timeInputRef}
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
          onClick={trySave}
        >
          保存
        </button>
      </div>
    </section>
  );
}
