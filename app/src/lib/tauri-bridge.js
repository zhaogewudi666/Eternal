import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  disable as pluginDisableAutostart,
  enable as pluginEnableAutostart,
  isEnabled as pluginIsAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

const PREVIEW_STORAGE_KEY = "eternal.preview.tasks";
const PREVIEW_AUTOSTART_KEY = "eternal.preview.autostart";
const PREVIEW_PANEL_SHOWN_LISTENERS = new Set();

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readPreviewTasks() {
  const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
  if (raw) return JSON.parse(raw);

  return [
    {
      id: "preview-report",
      title: "整理本周报表",
      completed: false,
      createdAtMs: Date.now() - 3_000,
      completedAtMs: null,
      reminder: {
        nextAtMs: Date.now() + 3_600_000,
        repeatEveryMinutes: null,
        lastFiredAtMs: null,
      },
    },
    {
      id: "preview-water",
      title: "喝一杯水",
      completed: false,
      createdAtMs: Date.now() - 2_000,
      completedAtMs: null,
      reminder: {
        nextAtMs: Date.now() + 900_000,
        repeatEveryMinutes: 30,
        lastFiredAtMs: null,
      },
    },
    {
      id: "preview-mail",
      title: "回复客户邮件",
      completed: false,
      createdAtMs: Date.now() - 1_000,
      completedAtMs: null,
      reminder: null,
    },
    {
      id: "preview-done",
      title: "提交需求确认",
      completed: true,
      createdAtMs: Date.now() - 8_000,
      completedAtMs: Date.now() - 4_000,
      reminder: null,
    },
  ];
}

function writePreviewTasks(tasks) {
  window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(tasks));
}

async function previewMutation(mutate) {
  const tasks = readPreviewTasks();
  const result = mutate(tasks);
  writePreviewTasks(tasks);
  return result;
}

export async function listTasks() {
  if (isTauriRuntime()) return invoke("list_tasks");
  return readPreviewTasks();
}

export async function createTask(title) {
  if (isTauriRuntime()) return invoke("create_task", { title });

  const created = await previewMutation((tasks) => {
    const task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      completed: false,
      createdAtMs: Date.now(),
      completedAtMs: null,
      reminder: null,
    };
    tasks.unshift(task);
    return task;
  });
  emitTasksChangedPreview();
  return created;
}

export async function toggleTask(id) {
  if (isTauriRuntime()) return invoke("toggle_task", { id });

  const updated = await previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.completed = !task.completed;
    task.completedAtMs = task.completed ? Date.now() : null;
    return { ...task };
  });
  emitTasksChangedPreview();
  return updated;
}

export async function deleteTask(id) {
  if (isTauriRuntime()) return invoke("delete_task", { id });

  await previewMutation((tasks) => {
    const index = tasks.findIndex((candidate) => candidate.id === id);
    if (index < 0) {
      throw new Error("找不到这项待办");
    }
    tasks.splice(index, 1);
  });
  emitTasksChangedPreview();
}

export async function setReminder(id, nextAtMs, repeatEveryMinutes) {
  if (isTauriRuntime()) {
    return invoke("set_reminder", { id, nextAtMs, repeatEveryMinutes });
  }

  const updated = await previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.reminder = {
      nextAtMs,
      repeatEveryMinutes,
      lastFiredAtMs: null,
    };
    return { ...task };
  });
  emitTasksChangedPreview();
  return updated;
}

export async function clearReminder(id) {
  if (isTauriRuntime()) return invoke("clear_reminder", { id });

  const updated = await previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.reminder = null;
    return { ...task };
  });
  emitTasksChangedPreview();
  return updated;
}

export async function hidePanel() {
  if (isTauriRuntime()) return invoke("hide_panel");
}

const PREVIEW_SHORTCUT_KEY = "eternal.preview.shortcut";

/// Browser-preview stand-in for `shortcut::normalize`. The Tauri build always
/// defers to the Rust implementation, which stays the single source of truth.
function previewNormalize(accelerator) {
  const parts = String(accelerator || "")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = parts.filter((part) =>
    ["CommandOrControl", "Alt", "Shift"].includes(part),
  );
  const keys = parts.filter((part) => !modifiers.includes(part));

  if (keys.length !== 1) {
    throw new Error("快捷键需要一个非修饰键，例如 Space、字母或数字。");
  }
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(keys[0]);
  if (
    !isFunctionKey &&
    !modifiers.includes("CommandOrControl") &&
    !modifiers.includes("Alt")
  ) {
    throw new Error("只用 Shift 会影响正常输入，请再加上 ⌘/Ctrl 或 Alt。");
  }

  const reserved =
    keys[0] === "Escape" ||
    (modifiers.length === 1 &&
      modifiers[0] === "CommandOrControl" &&
      ["1", "2", "F"].includes(keys[0]));
  if (reserved) {
    throw new Error(
      "该组合已用于 Eternal 内部操作，请换一个全局快捷键。",
    );
  }

  return parts.join("+");
}

export async function getGlobalShortcut() {
  if (isTauriRuntime()) return invoke("get_global_shortcut");
  return {
    accelerator:
      window.localStorage.getItem(PREVIEW_SHORTCUT_KEY) ||
      "CommandOrControl+Shift+Space",
    registered: true,
  };
}

export async function setGlobalShortcut(accelerator) {
  if (isTauriRuntime()) return invoke("set_global_shortcut", { accelerator });

  const applied = previewNormalize(accelerator);
  window.localStorage.setItem(PREVIEW_SHORTCUT_KEY, applied);
  return applied;
}

export async function setShortcutRecording(recording) {
  if (isTauriRuntime()) return invoke("set_shortcut_recording", { recording });
}

const PREVIEW_PANEL_PINNED_KEY = "eternal.preview.panelPinned";

export async function getPanelPinned() {
  if (isTauriRuntime()) return invoke("get_panel_pinned");
  return window.localStorage.getItem(PREVIEW_PANEL_PINNED_KEY) === "1";
}

export async function setPanelPinned(pinned) {
  if (isTauriRuntime()) return invoke("set_panel_pinned", { pinned });
  if (pinned) {
    window.localStorage.setItem(PREVIEW_PANEL_PINNED_KEY, "1");
  } else {
    window.localStorage.removeItem(PREVIEW_PANEL_PINNED_KEY);
  }
  return Boolean(pinned);
}

const PREVIEW_TASKS_CHANGED_LISTENERS = new Set();
let previewTasksRevision = 0;

function emitTasksChangedPreview() {
  previewTasksRevision += 1;
  const payload = { revision: previewTasksRevision };
  for (const handler of PREVIEW_TASKS_CHANGED_LISTENERS) {
    handler(payload);
  }
}

export function subscribeTasksChanged(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }

  if (isTauriRuntime()) {
    let active = true;
    let unlisten = () => {};
    listen("tasks-changed", (event) => {
      handler(event?.payload ?? { revision: 0 });
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten();
    };
  }

  PREVIEW_TASKS_CHANGED_LISTENERS.add(handler);
  return () => {
    PREVIEW_TASKS_CHANGED_LISTENERS.delete(handler);
  };
}

export async function isAutostartEnabled() {
  if (isTauriRuntime()) return pluginIsAutostartEnabled();
  return window.localStorage.getItem(PREVIEW_AUTOSTART_KEY) === "1";
}

export async function enableAutostart() {
  if (isTauriRuntime()) {
    await pluginEnableAutostart();
    return;
  }
  window.localStorage.setItem(PREVIEW_AUTOSTART_KEY, "1");
}

export async function disableAutostart() {
  if (isTauriRuntime()) {
    await pluginDisableAutostart();
    return;
  }
  window.localStorage.removeItem(PREVIEW_AUTOSTART_KEY);
}

/// Subscribe to explicit backend panel-shown signals from `show_panel`.
/// Preview/tests can push via `emitPanelShownPreview`.
export function subscribePanelShown(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }

  if (isTauriRuntime()) {
    let active = true;
    let unlisten = () => {};
    listen("panel-shown", (event) => {
      handler(event?.payload ?? { reason: "show" });
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten();
    };
  }

  PREVIEW_PANEL_SHOWN_LISTENERS.add(handler);
  return () => {
    PREVIEW_PANEL_SHOWN_LISTENERS.delete(handler);
  };
}

export function emitPanelShownPreview(payload = { reason: "show" }) {
  for (const handler of PREVIEW_PANEL_SHOWN_LISTENERS) {
    handler(payload);
  }
}
