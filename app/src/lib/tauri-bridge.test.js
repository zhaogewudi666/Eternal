import { beforeEach, expect, it } from "vitest";

import {
  getPanelPinned,
  getWidgetEnabled,
  setPanelPinned,
  setWidgetEnabled,
  subscribeTasksChanged,
  toggleTask,
} from "./tauri-bridge";

beforeEach(() => {
  window.localStorage.clear();
  delete window.__TAURI_INTERNALS__;
});

it("persists the panel pin in browser preview and can clear it", async () => {
  expect(await getPanelPinned()).toBe(false);

  expect(await setPanelPinned(true)).toBe(true);
  expect(await getPanelPinned()).toBe(true);

  expect(await setPanelPinned(false)).toBe(false);
  expect(await getPanelPinned()).toBe(false);
});

it("persists widget enabled in browser preview and defaults to off", async () => {
  expect(await getWidgetEnabled()).toBe(false);
  expect(await setWidgetEnabled(true)).toBe(true);
  expect(await getWidgetEnabled()).toBe(true);
  expect(await setWidgetEnabled(false)).toBe(false);
});

it("notifies tasks-changed subscribers after a preview mutation", async () => {
  const revisions = [];
  const stop = subscribeTasksChanged((payload) => {
    revisions.push(payload.revision);
  });

  const tasks = [
    {
      id: "preview-report",
      title: "整理本周报表",
      completed: false,
      createdAtMs: 1,
      completedAtMs: null,
      reminder: null,
    },
  ];
  window.localStorage.setItem("eternal.preview.tasks", JSON.stringify(tasks));
  await toggleTask("preview-report");

  expect(revisions.length).toBeGreaterThanOrEqual(1);
  stop();
});
