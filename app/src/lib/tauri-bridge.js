import { invoke } from "@tauri-apps/api/core";

const PREVIEW_STORAGE_KEY = "eternal.preview.tasks";

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

  return previewMutation((tasks) => {
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
}

export async function toggleTask(id) {
  if (isTauriRuntime()) return invoke("toggle_task", { id });

  return previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.completed = !task.completed;
    task.completedAtMs = task.completed ? Date.now() : null;
    return { ...task };
  });
}

export async function setReminder(id, nextAtMs, repeatEveryMinutes) {
  if (isTauriRuntime()) {
    return invoke("set_reminder", { id, nextAtMs, repeatEveryMinutes });
  }

  return previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.reminder = {
      nextAtMs,
      repeatEveryMinutes,
      lastFiredAtMs: null,
    };
    return { ...task };
  });
}

export async function clearReminder(id) {
  if (isTauriRuntime()) return invoke("clear_reminder", { id });

  return previewMutation((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    task.reminder = null;
    return { ...task };
  });
}

export async function hidePanel() {
  if (isTauriRuntime()) return invoke("hide_panel");
}
