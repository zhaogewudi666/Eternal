import {
  Check,
  GearSix,
  Infinity,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DeleteConfirm } from "./components/DeleteConfirm";
import { ReminderEditor } from "./components/ReminderEditor";
import { SettingsPopover } from "./components/SettingsPopover";
import { TaskComposer } from "./components/TaskComposer";
import { TaskList } from "./components/TaskList";
import {
  clearReminder,
  createTask,
  deleteTask,
  getGlobalShortcut,
  hidePanel,
  listTasks,
  setGlobalShortcut,
  setReminder,
  setShortcutRecording,
  toggleTask,
} from "./lib/tauri-bridge";
import {
  DEFAULT_SHORTCUT,
  acceleratorFromEvent,
  currentPlatform,
  formatAccelerator,
  isMacPlatform,
} from "./model/shortcut";
import {
  filterTasks,
  moveSelection,
  nextEscapeAction,
  partitionStackedTasks,
  sectionForShortcutKey,
  selectionAfterDelete,
  stackedNavigationOrder,
} from "./model/task-state";

function replaceTask(tasks, updated) {
  return tasks.map((task) => (task.id === updated.id ? updated : task));
}

function normalizeShortcutStatus(value) {
  if (typeof value === "string") {
    return { accelerator: value, registered: Boolean(value) };
  }

  return {
    accelerator: String(value?.accelerator || ""),
    registered: Boolean(value?.registered),
  };
}

function initialTheme() {
  const saved = window.localStorage.getItem("eternal.theme");
  return ["system", "light", "dark"].includes(saved) ? saved : "system";
}

const EMPTY_MESSAGES = {
  active: "现在没有未完成的事情",
  search: "没有匹配的任务",
};

export function App() {
  const [tasks, setTasks] = useState([]);
  const [mode, setMode] = useState("normal");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [isListNavigating, setIsListNavigating] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [error, setError] = useState("");
  const [shortcut, setShortcut] = useState(null);
  const [shortcutError, setShortcutError] = useState("");
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const inputRef = useRef(null);
  const activeSectionRef = useRef(null);
  const completedSectionRef = useRef(null);
  const listScrollRef = useRef(null);

  const platform = useMemo(() => currentPlatform(), []);
  const isSearching = mode === "search";

  useEffect(() => {
    listTasks()
      .then((loadedTasks) => {
        setTasks(loadedTasks);
        setSelectedId(loadedTasks.find((task) => !task.completed)?.id || null);
      })
      .catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    getGlobalShortcut()
      .then((value) => {
        const status = normalizeShortcutStatus(value);
        setShortcut(status.accelerator);
        if (!status.registered && status.accelerator) {
          setShortcutError(
            `${formatAccelerator(status.accelerator, platform)} 当前未生效，请录制新的组合。`,
          );
        }
      })
      .catch((reason) =>
        setShortcutError(`无法读取全局快捷键：${String(reason)}`),
      );
  }, [platform]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("eternal.theme", theme);
  }, [theme]);

  // Only react to mode transitions. Re-running on isListNavigating would steal
  // focus back to capture/search after ArrowDown navigation.
  useEffect(() => {
    if (mode === "search") {
      setIsListNavigating(false);
      inputRef.current?.focus();
      return;
    }

    // Returning from reminder/delete may keep list selection in the same
    // render; only focus capture when that render is not list-navigating.
    if (mode === "normal" && !isListNavigating) {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode transitions only
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
    () => filterTasks(tasks, isSearching ? query : ""),
    [isSearching, query, tasks],
  );
  const { active: activeTasks, completed: completedTasks } = useMemo(
    () => partitionStackedTasks(filteredTasks),
    [filteredTasks],
  );
  const navigableTasks = useMemo(
    () => stackedNavigationOrder(filteredTasks),
    [filteredTasks],
  );
  const activeCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  );
  const selectedTask = tasks.find((task) => task.id === selectedId) || null;

  async function handleCreate() {
    const title = draft.trim();
    if (!title || mode !== "normal") return;
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

  const handleToggle = useCallback(async (id) => {
    try {
      const updated = await toggleTask(id);
      setTasks((current) => replaceTask(current, updated));
      // Stacked layout keeps both sections on one panel; stay on the same row.
      setSelectedId(updated.id);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const openReminder = useCallback((id) => {
    setSelectedId(id);
    setIsListNavigating(true);
    setMode("reminder");
  }, []);

  const openDeleteConfirm = useCallback((id) => {
    setSelectedId(id);
    setIsListNavigating(true);
    setMode("delete");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    const removedId = selectedId;
    const nextId = selectionAfterDelete(tasks, removedId);
    try {
      await deleteTask(removedId);
      setTasks((current) => current.filter((task) => task.id !== removedId));
      setSelectedId(nextId);
      setIsListNavigating(Boolean(nextId));
      setMode("normal");
    } catch (reason) {
      setError(String(reason?.message || reason));
      setMode("normal");
      setIsListNavigating(true);
    }
  }, [selectedId, tasks]);

  const jumpToSection = useCallback((section) => {
    setMode((current) => {
      if (current === "search") setQuery("");
      return current === "search" ? "normal" : current;
    });

    const pool =
      section === "completed"
        ? partitionStackedTasks(tasks).completed
        : partitionStackedTasks(tasks).active;
    const target = pool[0];
    if (!target) return;

    inputRef.current?.blur();
    setSelectedId(target.id);
    setIsListNavigating(true);

    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-task-id="${target.id}"]`);
      if (typeof node?.scrollIntoView === "function") {
        node.scrollIntoView({ block: "nearest" });
      }
      const sectionNode =
        section === "completed"
          ? completedSectionRef.current
          : activeSectionRef.current;
      if (typeof sectionNode?.scrollIntoView === "function") {
        sectionNode.scrollIntoView({ block: "nearest" });
      }
    });
  }, [tasks]);

  const stopRecording = useCallback(() => {
    setIsRecordingShortcut(false);
    setShortcutRecording(false).catch((reason) =>
      setShortcutError(String(reason?.message || reason)),
    );
  }, []);

  const startRecording = useCallback(async () => {
    setShortcutError("");
    try {
      await setShortcutRecording(true);
      setIsRecordingShortcut(true);
    } catch (reason) {
      setIsRecordingShortcut(false);
      setShortcutError(String(reason?.message || reason));
    }
  }, []);

  const applyShortcut = useCallback(
    async (accelerator) => {
      stopRecording();
      try {
        const applied = await setGlobalShortcut(accelerator);
        setShortcut(applied || accelerator);
        setShortcutError("");
      } catch (reason) {
        try {
          const status = normalizeShortcutStatus(await getGlobalShortcut());
          setShortcut(status.accelerator);
        } catch {
          // Keep the last confirmed value when even the recovery read fails.
        }
        setShortcutError(String(reason?.message || reason));
      }
    },
    [stopRecording],
  );

  const closeSettings = useCallback(() => {
    if (isRecordingShortcut) stopRecording();
    setMode("normal");
  }, [isRecordingShortcut, stopRecording]);

  useEffect(() => {
    if (mode !== "settings" && isRecordingShortcut) stopRecording();
  }, [isRecordingShortcut, mode, stopRecording]);

  useEffect(() => {
    function releaseRecordingOnBlur() {
      if (isRecordingShortcut) stopRecording();
    }

    window.addEventListener("blur", releaseRecordingOnBlur);
    return () => window.removeEventListener("blur", releaseRecordingOnBlur);
  }, [isRecordingShortcut, stopRecording]);

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

      if (event.key === "Escape") {
        event.preventDefault();
        const action = nextEscapeAction(mode, { isRecordingShortcut });
        if (action === "cancel-recording") stopRecording();
        if (action === "close-overlay") {
          setMode("normal");
          if (mode === "delete" || mode === "reminder") {
            setIsListNavigating(true);
          }
        }
        if (action === "exit-search") {
          setMode("normal");
          setQuery("");
        }
        if (action === "hide-panel") hidePanel();
        return;
      }

      if (isRecordingShortcut) {
        event.preventDefault();
        const accelerator = acceleratorFromEvent(event);
        if (accelerator) applyShortcut(accelerator);
        return;
      }

      if (mode === "delete") {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleDelete();
        }
        return;
      }

      const hasCommand = event.metaKey || event.ctrlKey;

      if (mode === "reminder" || mode === "settings") {
        const isApplicationCommand =
          hasCommand &&
          !event.altKey &&
          !event.shiftKey &&
          (event.key.toLowerCase() === "f" || sectionForShortcutKey(event.key));
        if (isApplicationCommand) event.preventDefault();
        return;
      }

      if (hasCommand && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setMode("search");
        return;
      }

      if (hasCommand && !event.altKey && !event.shiftKey) {
        const section = sectionForShortcutKey(event.key);
        if (section) {
          event.preventDefault();
          jumpToSection(section);
          return;
        }
      }

      if (hasCommand || event.altKey) return;

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
        (isSearching || mode === "normal")
      ) {
        event.preventDefault();
        setIsListNavigating(false);
        inputRef.current?.focus();
        const character =
          event.shiftKey && /^[a-z]$/i.test(event.key)
            ? event.key.toUpperCase()
            : event.key;
        if (isSearching) {
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
        (event.key === "Delete" || event.key === "Backspace") &&
        !event.shiftKey &&
        isListNavigating &&
        selectedId
      ) {
        event.preventDefault();
        openDeleteConfirm(selectedId);
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
  }, [
    applyShortcut,
    handleDelete,
    handleToggle,
    isListNavigating,
    isRecordingShortcut,
    isSearching,
    jumpToSection,
    mode,
    navigableTasks,
    openDeleteConfirm,
    selectedId,
    stopRecording,
  ]);

  const modifierLabel = isMacPlatform(platform) ? "⌘" : "Ctrl+";
  const footerHints = useMemo(() => {
    if (mode === "delete") {
      return ["Enter 确认删除", "Esc 取消"];
    }
    if (mode === "reminder") {
      return ["Esc 关闭"];
    }
    if (mode === "settings") {
      return ["Esc 关闭"];
    }
    if (isListNavigating && selectedId) {
      return [
        `${modifierLabel}1/2`,
        `${modifierLabel}F`,
        "↑↓",
        "Enter 提醒",
        "⌫ 删除",
        "Space",
        "Esc",
      ];
    }
    return [
      `${modifierLabel}1/2 分区`,
      `${modifierLabel}F 查找`,
      "↑↓ 选择",
      "Space 完成",
      "Esc 关闭",
    ];
  }, [isListNavigating, mode, modifierLabel, selectedId]);

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
            <p data-tauri-drag-region>收集箱 · {activeCount} 项未完成</p>
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
        mode={mode === "search" ? "search" : "normal"}
        value={isSearching ? query : draft}
        inputRef={inputRef}
        onChange={isSearching ? setQuery : setDraft}
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

      <div className="task-scroll" ref={listScrollRef}>
        <TaskList
          activeTasks={activeTasks}
          completedTasks={completedTasks}
          emptyActiveMessage={EMPTY_MESSAGES.active}
          emptySearchMessage={EMPTY_MESSAGES.search}
          selectedId={isListNavigating ? selectedId : null}
          showStatus={isSearching}
          isSearching={isSearching}
          activeSectionRef={activeSectionRef}
          completedSectionRef={completedSectionRef}
          onSelect={(id) => {
            setSelectedId(id);
            setIsListNavigating(true);
          }}
          onToggle={handleToggle}
          onEditReminder={openReminder}
          onRequestDelete={openDeleteConfirm}
        />
      </div>

      {mode === "settings" && (
        <SettingsPopover
          theme={theme}
          onThemeChange={setTheme}
          onClose={closeSettings}
          shortcutLabel={
            shortcut === null ? "读取中…" : formatAccelerator(shortcut, platform)
          }
          shortcutError={shortcutError}
          isRecordingShortcut={isRecordingShortcut}
          onStartRecording={startRecording}
          onResetShortcut={() => applyShortcut(DEFAULT_SHORTCUT)}
        />
      )}

      {mode === "reminder" && selectedTask && (
        <ReminderEditor
          task={selectedTask}
          onSave={handleSaveReminder}
          onClear={handleClearReminder}
          onClose={() => {
            setMode("normal");
            setIsListNavigating(true);
          }}
        />
      )}

      {mode === "delete" && selectedTask && (
        <DeleteConfirm
          task={selectedTask}
          onConfirm={handleDelete}
          onClose={() => {
            setMode("normal");
            setIsListNavigating(true);
          }}
        />
      )}

      <footer className="shortcut-bar" aria-label="快捷键帮助">
        {footerHints.map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </footer>
    </main>
  );
}
