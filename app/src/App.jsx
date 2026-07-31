import {
  Check,
  GearSix,
  Infinity,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ReminderEditor } from "./components/ReminderEditor";
import { SettingsPopover } from "./components/SettingsPopover";
import { TaskComposer } from "./components/TaskComposer";
import { TaskList } from "./components/TaskList";
import {
  clearReminder,
  createTask,
  hidePanel,
  listTasks,
  setReminder,
  toggleTask,
} from "./lib/tauri-bridge";
import {
  filterTasks,
  moveSelection,
  nextEscapeAction,
} from "./model/task-state";

function replaceTask(tasks, updated) {
  return tasks.map((task) => (task.id === updated.id ? updated : task));
}

function initialTheme() {
  const saved = window.localStorage.getItem("eternal.theme");
  return ["system", "light", "dark"].includes(saved) ? saved : "system";
}

export function App() {
  const [tasks, setTasks] = useState([]);
  const [mode, setMode] = useState("normal");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [isListNavigating, setIsListNavigating] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    listTasks()
      .then((loadedTasks) => {
        setTasks(loadedTasks);
        setSelectedId(
          loadedTasks.find((task) => !task.completed)?.id || null,
        );
      })
      .catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("eternal.theme", theme);
  }, [theme]);

  useEffect(() => {
    if (mode === "normal" || mode === "search") {
      setIsListNavigating(false);
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    function focusCapture() {
      if (mode === "normal" || mode === "search") {
        setIsListNavigating(false);
        inputRef.current?.focus();
      }
    }

    window.addEventListener("focus", focusCapture);
    return () => window.removeEventListener("focus", focusCapture);
  }, [mode]);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, mode === "search" ? query : ""),
    [mode, query, tasks],
  );
  const [activeTasks, completedTasks] = useMemo(
    () => [
      filteredTasks.filter((task) => !task.completed),
      filteredTasks.filter((task) => task.completed),
    ],
    [filteredTasks],
  );
  const completedVisible = completedOpen || mode === "search";
  const navigableTasks = useMemo(
    () =>
      completedVisible ? [...activeTasks, ...completedTasks] : activeTasks,
    [activeTasks, completedTasks, completedVisible],
  );
  const selectedTask = tasks.find((task) => task.id === selectedId) || null;

  async function handleCreate() {
    const title = draft.trim();
    if (!title) return;
    try {
      const created = await createTask(title);
      setTasks((current) => [created, ...current]);
      setSelectedId(created.id);
      setIsListNavigating(false);
      setDraft("");
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleToggle(id) {
    try {
      const updated = await toggleTask(id);
      setTasks((current) => replaceTask(current, updated));
      setSelectedId(updated.id);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleSaveReminder(nextAtMs, repeatEveryMinutes) {
    if (!selectedTask) return;
    try {
      const updated = await setReminder(
        selectedTask.id,
        nextAtMs,
        repeatEveryMinutes,
      );
      setTasks((current) => replaceTask(current, updated));
      setMode("normal");
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleClearReminder() {
    if (!selectedTask) return;
    try {
      const updated = await clearReminder(selectedTask.id);
      setTasks((current) => replaceTask(current, updated));
      setMode("normal");
    } catch (reason) {
      setError(String(reason));
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.isComposing || event.keyCode === 229) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setMode("search");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        const action = nextEscapeAction(mode);
        if (action === "close-overlay") setMode("normal");
        if (action === "exit-search") {
          setMode("normal");
          setQuery("");
        }
        if (action === "hide-panel") hidePanel();
        return;
      }

      if (mode === "reminder" || mode === "settings") return;

      const hasCommandModifier =
        event.metaKey || event.ctrlKey || event.altKey;
      if (hasCommandModifier) return;

      const targetIsInteractive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(
        event.target?.tagName || "",
      );
      const targetIsComposer = event.target === inputRef.current;
      const isSelectionKey =
        event.key === "ArrowDown" || event.key === "ArrowUp";
      if (isSelectionKey && event.shiftKey) return;
      if (targetIsInteractive && !(targetIsComposer && isSelectionKey)) return;

      if (isSelectionKey) {
        if (!navigableTasks.length) return;
        event.preventDefault();
        if (targetIsComposer) inputRef.current?.blur();
        const currentIndex = navigableTasks.findIndex(
          (task) => task.id === selectedId,
        );
        const index = moveSelection(
          currentIndex,
          event.key === "ArrowDown" ? 1 : -1,
          navigableTasks.length,
        );
        setIsListNavigating(true);
        setSelectedId(navigableTasks[index]?.id || null);
        return;
      }

      if (
        event.key.length === 1 &&
        event.key !== " " &&
        (mode === "normal" || mode === "search")
      ) {
        event.preventDefault();
        setIsListNavigating(false);
        inputRef.current?.focus();
        const character =
          event.shiftKey && /^[a-z]$/i.test(event.key)
            ? event.key.toUpperCase()
            : event.key;
        if (mode === "search") {
          setQuery((current) => current + character);
        } else {
          setDraft((current) => current + character);
        }
        return;
      }

      if (
        event.key === " " &&
        !event.shiftKey &&
        isListNavigating &&
        selectedId
      ) {
        event.preventDefault();
        handleToggle(selectedId);
        return;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        isListNavigating &&
        selectedId
      ) {
        event.preventDefault();
        setMode("reminder");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListNavigating, mode, navigableTasks, selectedId]);

  return (
    <main className="app-shell">
      <header className="app-header" data-tauri-drag-region>
        <div className="brand-lockup" data-tauri-drag-region>
          <span
            className="brand-mark"
            aria-hidden="true"
            data-tauri-drag-region
          >
            <Infinity size={18} weight="regular" />
            <Check size={10} weight="bold" />
          </span>
          <div className="brand-copy" data-tauri-drag-region>
            <h1 data-tauri-drag-region>Eternal</h1>
            <p data-tauri-drag-region>
              收集箱 · {tasks.filter((task) => !task.completed).length} 项未完成
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="搜索"
            onClick={() => setMode("search")}
          >
            <MagnifyingGlass size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="打开设置"
            onClick={() => setMode("settings")}
          >
            <GearSix size={20} />
          </button>
        </div>
      </header>

      <TaskComposer
        mode={mode}
        value={mode === "search" ? query : draft}
        inputRef={inputRef}
        onChange={mode === "search" ? setQuery : setDraft}
        onSubmit={handleCreate}
        onExitSearch={() => {
          setMode("normal");
          setQuery("");
        }}
      />

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      <TaskList
        activeTasks={activeTasks}
        completedTasks={completedTasks}
        selectedId={isListNavigating ? selectedId : null}
        completedOpen={completedVisible}
        completedLocked={mode === "search"}
        onSelect={(id) => {
          setSelectedId(id);
          setIsListNavigating(true);
        }}
        onToggle={handleToggle}
        onEditReminder={(id) => {
          setSelectedId(id);
          setMode("reminder");
        }}
        onToggleCompleted={() => setCompletedOpen((open) => !open)}
      />

      {mode === "settings" && (
        <SettingsPopover
          theme={theme}
          onThemeChange={setTheme}
          onClose={() => setMode("normal")}
        />
      )}

      {mode === "reminder" && selectedTask && (
        <ReminderEditor
          task={selectedTask}
          onSave={handleSaveReminder}
          onClear={handleClearReminder}
          onClose={() => setMode("normal")}
        />
      )}

      <footer className="shortcut-bar" aria-label="快捷键帮助">
        <span>⌘/Ctrl+F 查找</span>
        <span>↑↓ 选择</span>
        <span>Space 完成</span>
        <span>Esc 关闭</span>
      </footer>
    </main>
  );
}
