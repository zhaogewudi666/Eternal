import { Check, Infinity, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listTasks,
  openMainPanel,
  setWidgetEnabled,
  subscribeTasksChanged,
  toggleTask,
} from "./lib/tauri-bridge";

export function Widget() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState(null);

  const reload = useCallback(() => {
    listTasks()
      .then((loaded) => setTasks(Array.isArray(loaded) ? loaded : []))
      .catch((reason) => setError(String(reason?.message || reason)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let localRevision = 0;
    return subscribeTasksChanged((payload) => {
      const revision = Number(payload?.revision || 0);
      if (revision <= localRevision) return;
      localRevision = revision;
      reload();
    });
  }, [reload]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.completed),
    [tasks],
  );

  async function handleToggle(id) {
    if (pendingId) return;
    setPendingId(id);
    const previous = tasks;
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              completed: !task.completed,
              completedAtMs: task.completed ? null : Date.now(),
            }
          : task,
      ),
    );
    try {
      const updated = await toggleTask(id);
      setTasks((current) =>
        current.map((task) => (task.id === updated.id ? updated : task)),
      );
    } catch (reason) {
      setTasks(previous);
      setError(String(reason?.message || reason));
    } finally {
      setPendingId(null);
    }
  }

  async function handleHide() {
    try {
      await setWidgetEnabled(false);
    } catch (reason) {
      setError(String(reason?.message || reason));
    }
  }

  async function handleOpenPanel() {
    try {
      await openMainPanel();
    } catch (reason) {
      setError(String(reason?.message || reason));
    }
  }

  return (
    <main className="widget-shell" aria-label="Eternal 桌面组件">
      <header className="widget-header" data-tauri-drag-region>
        <div className="widget-brand" data-tauri-drag-region>
          <span className="brand-mark" aria-hidden="true" data-tauri-drag-region>
            <Infinity size={16} weight="regular" />
            <Check size={9} weight="bold" />
          </span>
          <div data-tauri-drag-region>
            <strong data-tauri-drag-region>Eternal</strong>
            <span data-tauri-drag-region>{activeTasks.length} 项未完成</span>
          </div>
        </div>
        <div className="widget-actions">
          <button
            type="button"
            className="text-button"
            onClick={handleOpenPanel}
            aria-label="打开完整面板"
          >
            打开
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleHide}
            aria-label="隐藏桌面组件"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      <div className="widget-list">
        {activeTasks.length === 0 ? (
          <p className="widget-empty">今天轻一点，待办都完成了。</p>
        ) : (
          activeTasks.map((task) => (
            <div key={task.id} className="widget-row">
              <button
                className="task-checkbox"
                type="button"
                role="checkbox"
                aria-checked={false}
                aria-label={`完成：${task.title}`}
                disabled={pendingId === task.id}
                onClick={() => handleToggle(task.id)}
              />
              <span className="task-title" title={task.title}>
                {task.title}
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
