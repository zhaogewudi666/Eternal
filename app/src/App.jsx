import {
  Check,
  GearSix,
  Infinity,
  MagnifyingGlass,
  PushPinSimple,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DeleteConfirm } from "./components/DeleteConfirm";
import { ReminderEditor } from "./components/ReminderEditor";
import { SettingsPopover } from "./components/SettingsPopover";
import { TaskComposer } from "./components/TaskComposer";
import { TaskList } from "./components/TaskList";
import {
  clearReminder,
  createTask,
  deleteTask,
  disableAutostart,
  enableAutostart,
  getGlobalShortcut,
  getPanelPinned,
  hidePanel,
  isAutostartEnabled,
  listTasks,
  setGlobalShortcut,
  setPanelPinned,
  setReminder,
  setShortcutRecording,
  subscribePanelShown,
  subscribeTasksChanged,
  toggleTask,
} from "./lib/tauri-bridge";
import {
  DEFAULT_PIN_SHORTCUT,
  DEFAULT_SHORTCUT,
  acceleratorFromEvent,
  currentPlatform,
  formatAccelerator,
  isMacPlatform,
} from "./model/shortcut";
import {
  filterTasks,
  footerHintsForContext,
  isNativeActivateTarget,
  isTextEditableTarget,
  moveSelection,
  nextEscapeAction,
  partitionStackedTasks,
  sectionForShortcutKey,
  selectionAfterDelete,
  selectionAfterToggle,
  stackedNavigationOrder,
  toggleTransitionMs,
} from "./model/task-state";

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  const [isPanelPinned, setIsPanelPinned] = useState(null);
  const [panelPinPending, setPanelPinPending] = useState(false);
  // null while the OS registration state is loading for the open settings panel.
  const [autostartEnabled, setAutostartEnabled] = useState(null);
  const [autostartPending, setAutostartPending] = useState(false);
  const [autostartError, setAutostartError] = useState("");
  // Visual-only completion state while the row stays in its old section.
  // { id, updated } — checkbox/strike follow `updated` until the timer commits.
  const [toggleTransition, setToggleTransition] = useState(null);
  const inputRef = useRef(null);
  const activeSectionRef = useRef(null);
  const completedSectionRef = useRef(null);
  const listScrollRef = useRef(null);
  const toggleTimerRef = useRef(null);
  const toggleInFlightRef = useRef(false);
  const autostartInFlightRef = useRef(false);
  const autostartPendingRef = useRef(false);
  const autostartLoadGenRef = useRef(0);
  const autostartOpGenRef = useRef(0);

  const platform = useMemo(() => currentPlatform(), []);
  const isSearching = mode === "search";

  useEffect(() => {
    listTasks()
      .then((loadedTasks) => {
        setTasks(loadedTasks);
        // Opening must not pre-select a row; keyboard visual selection starts
        // only after the user navigates the list or clicks a task.
        setSelectedId(null);
        setIsListNavigating(false);
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
    getPanelPinned()
      .then((pinned) => setIsPanelPinned(Boolean(pinned)))
      .catch((reason) => {
        setIsPanelPinned(false);
        setError(`无法读取钉板状态：${String(reason)}`);
      });
  }, []);

  useEffect(() => {
    let localRevision = 0;
    return subscribeTasksChanged((payload) => {
      const revision = Number(payload?.revision || 0);
      if (revision <= localRevision) return;
      localRevision = revision;
      listTasks()
        .then((loadedTasks) => setTasks(loadedTasks))
        .catch((reason) => setError(String(reason)));
    });
  }, []);

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

  // Keep keyboard navigation coupled to the notes scrollport. The row can be
  // selected while focus is still on the global window listener, so relying on
  // browser focus scrolling leaves lower rows outside the bounded list.
  useLayoutEffect(() => {
    if (!isListNavigating || !selectedId) return;
    const node = document.querySelector(`[data-task-id="${selectedId}"]`);
    if (typeof node?.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [isListNavigating, selectedId]);

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

  async function handlePanelPinToggle() {
    if (typeof isPanelPinned !== "boolean" || panelPinPending) return;
    const requested = !isPanelPinned;
    setPanelPinPending(true);
    try {
      const applied = await setPanelPinned(requested);
      setIsPanelPinned(Boolean(applied));
    } catch (reason) {
      setError(`无法更新钉板状态：${String(reason)}`);
    } finally {
      setPanelPinPending(false);
    }
  }

  const clearToggleTimer = useCallback(() => {
    if (toggleTimerRef.current != null) {
      window.clearTimeout(toggleTimerRef.current);
      toggleTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearToggleTimer(), [clearToggleTimer]);

  const commitToggleTransition = useCallback(
    (preToggleTasks, updated) => {
      setTasks((current) => replaceTask(current, updated));
      setToggleTransition(null);
      toggleInFlightRef.current = false;

      const next = selectionAfterToggle(preToggleTasks, updated);
      setSelectedId(next.selectedId);
      setIsListNavigating(next.listNavigating);
      if (next.focusCapture) {
        inputRef.current?.focus();
      }
    },
    [],
  );

  const handleToggle = useCallback(
    async (id) => {
      if (toggleInFlightRef.current || toggleTransition) return;
      toggleInFlightRef.current = true;
      try {
        const updated = await toggleTask(id);
        const preToggleTasks = tasks;
        const delay = toggleTransitionMs(
          updated.completed,
          prefersReducedMotion(),
        );

        // Checkbox/strike update immediately; section membership waits.
        setToggleTransition({ id: updated.id, updated });
        setSelectedId(updated.id);
        setIsListNavigating(true);

        clearToggleTimer();
        if (delay <= 0) {
          commitToggleTransition(preToggleTasks, updated);
          return;
        }

        toggleTimerRef.current = window.setTimeout(() => {
          toggleTimerRef.current = null;
          commitToggleTransition(preToggleTasks, updated);
        }, delay);
      } catch (reason) {
        toggleInFlightRef.current = false;
        setToggleTransition(null);
        setError(String(reason));
      }
    },
    [clearToggleTimer, commitToggleTransition, tasks, toggleTransition],
  );

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

  const loadAutostartState = useCallback(() => {
    if (autostartPendingRef.current || autostartInFlightRef.current) {
      return () => {};
    }

    let cancelled = false;
    const gen = ++autostartLoadGenRef.current;
    setAutostartError("");
    setAutostartEnabled(null);

    isAutostartEnabled()
      .then((enabled) => {
        if (
          cancelled ||
          gen !== autostartLoadGenRef.current ||
          autostartPendingRef.current
        ) {
          return;
        }
        setAutostartEnabled(Boolean(enabled));
      })
      .catch((reason) => {
        if (
          cancelled ||
          gen !== autostartLoadGenRef.current ||
          autostartPendingRef.current
        ) {
          return;
        }
        // Keep unknown — do not fabricate a disabled OS state.
        setAutostartEnabled(null);
        setAutostartError(
          `无法读取开机启动状态：${String(reason?.message || reason)}`,
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "settings") return undefined;
    // Pending toggle lifetime is independent of the popover open/close cycle.
    if (autostartPendingRef.current || autostartInFlightRef.current) {
      return undefined;
    }
    return loadAutostartState();
  }, [loadAutostartState, mode]);

  const handleAutostartChange = useCallback(
    async (desired) => {
      if (autostartInFlightRef.current || autostartPendingRef.current) return;
      if (typeof autostartEnabled !== "boolean") return;
      if (autostartEnabled === desired) return;

      const previous = autostartEnabled;
      const op = ++autostartOpGenRef.current;
      autostartInFlightRef.current = true;
      autostartPendingRef.current = true;
      setAutostartPending(true);
      setAutostartError("");

      try {
        if (desired) {
          await enableAutostart();
        } else {
          await disableAutostart();
        }
        if (op !== autostartOpGenRef.current) return;
        setAutostartEnabled(desired);
      } catch (reason) {
        if (op !== autostartOpGenRef.current) return;
        setAutostartEnabled(previous);
        setAutostartError(String(reason?.message || reason));
      } finally {
        if (op === autostartOpGenRef.current) {
          autostartInFlightRef.current = false;
          autostartPendingRef.current = false;
          setAutostartPending(false);
        }
      }
    },
    [autostartEnabled],
  );

  const resetToCapture = useCallback(() => {
    setMode("normal");
    setQuery("");
    setIsListNavigating(false);
    setIsRecordingShortcut(false);
    setShortcutRecording(false).catch(() => {});
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  useEffect(() => subscribePanelShown(() => resetToCapture()), [resetToCapture]);

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

      if (
        hasCommand &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        handlePanelPinToggle();
        return;
      }

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

      const targetIsEditable = isTextEditableTarget(event.target);
      const targetIsNativeActivate = isNativeActivateTarget(event.target);
      const targetIsComposer = event.target === inputRef.current;
      const isSelectionKey =
        event.key === "ArrowDown" || event.key === "ArrowUp";
      if (isSelectionKey && event.shiftKey) return;
      // Leave real typing fields alone, except ArrowDown/Up from the composer.
      if (targetIsEditable && !(targetIsComposer && isSelectionKey)) return;

      if (isSelectionKey) {
        if (!navigableTasks.length) return;
        event.preventDefault();

        // Clear stale DOM focus on non-editable native-activate controls so
        // later Space/Enter act on the highlighted task, not the old button.
        const clearStaleActivateFocus = () => {
          if (
            targetIsNativeActivate &&
            typeof event.target?.blur === "function"
          ) {
            event.target.blur();
          }
        };

        // From the actual capture/search input, always enter the first row —
        // even if isListNavigating is stale from a previous selection.
        if (targetIsComposer) {
          if (event.key !== "ArrowDown") return;
          inputRef.current?.blur();
          setIsListNavigating(true);
          setSelectedId(navigableTasks[0]?.id || null);
          return;
        }

        if (!isListNavigating) {
          if (event.key !== "ArrowDown") return;
          clearStaleActivateFocus();
          setIsListNavigating(true);
          setSelectedId(navigableTasks[0]?.id || null);
          return;
        }

        const currentIndex = navigableTasks.findIndex(
          (task) => task.id === selectedId,
        );
        // Missing/filtered-away selection is -1 so ArrowDown enters result 0.
        const index = moveSelection(
          currentIndex,
          event.key === "ArrowDown" ? 1 : -1,
          navigableTasks.length,
        );

        // ArrowUp above the first row returns focus to capture/search input.
        if (index < 0) {
          setIsListNavigating(false);
          inputRef.current?.focus();
          return;
        }

        clearStaleActivateFocus();
        setIsListNavigating(true);
        setSelectedId(navigableTasks[index]?.id || null);
        return;
      }

      // Plain "/" on any non-editable focus target opens/focuses search.
      if (
        event.key === "/" &&
        !targetIsEditable &&
        (mode === "normal" || mode === "search")
      ) {
        event.preventDefault();
        setIsListNavigating(false);
        if (mode === "search") {
          inputRef.current?.focus();
        } else {
          setMode("search");
        }
        return;
      }

      if (
        event.key.length === 1 &&
        event.key !== " " &&
        !targetIsEditable &&
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

      // Do not intercept native Space/Enter on buttons, links, or switches.
      if (targetIsNativeActivate) return;

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
    handlePanelPinToggle,
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
  const footerHints = useMemo(
    () =>
      footerHintsForContext({
        mode,
        isListNavigating,
        selectedId,
        isRecordingShortcut,
        isSearching,
        modifierLabel,
      }),
    [
      isListNavigating,
      isRecordingShortcut,
      isSearching,
      mode,
      modifierLabel,
      selectedId,
    ],
  );

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
            className={`icon-button panel-pin ${isPanelPinned ? "is-active" : ""}`}
            type="button"
            aria-label={isPanelPinned ? "取消固定面板" : "固定面板"}
            aria-pressed={Boolean(isPanelPinned)}
            title={
              isPanelPinned
                ? `取消固定，失去焦点后自动收起（${formatAccelerator(DEFAULT_PIN_SHORTCUT, platform)}）`
                : `固定面板，切换到其他应用时保持显示（${formatAccelerator(DEFAULT_PIN_SHORTCUT, platform)}）`
            }
            disabled={isPanelPinned === null || panelPinPending}
            onClick={handlePanelPinToggle}
          >
            <PushPinSimple
              size={20}
              weight={isPanelPinned ? "fill" : "regular"}
            />
          </button>
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
        onFocusInput={() => setIsListNavigating(false)}
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
          toggleTransition={toggleTransition}
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
        <div className="settings-stack">
          <SettingsPopover
            theme={theme}
            onThemeChange={setTheme}
            onClose={closeSettings}
            shortcutLabel={
              shortcut === null
                ? "读取中…"
                : formatAccelerator(shortcut, platform)
            }
            shortcutError={shortcutError}
            isRecordingShortcut={isRecordingShortcut}
            onStartRecording={startRecording}
            onResetShortcut={() => applyShortcut(DEFAULT_SHORTCUT)}
            pinShortcutLabel={formatAccelerator(DEFAULT_PIN_SHORTCUT, platform)}
            autostartEnabled={autostartEnabled}
            autostartPending={autostartPending}
            autostartError={autostartError}
            onAutostartChange={handleAutostartChange}
            onRetryAutostartLoad={loadAutostartState}
          />
        </div>
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
