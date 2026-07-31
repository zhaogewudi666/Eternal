import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const bridge = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  toggleTask: vi.fn(),
  setReminder: vi.fn(),
  clearReminder: vi.fn(),
  hidePanel: vi.fn(),
}));

vi.mock("./lib/tauri-bridge", () => bridge);

const activeTask = {
  id: "active",
  title: "提交周报",
  completed: false,
  createdAtMs: 100,
  completedAtMs: null,
  reminder: null,
};

const completedTask = {
  id: "completed",
  title: "整理目录",
  completed: true,
  createdAtMs: 50,
  completedAtMs: 80,
  reminder: null,
};

const secondActiveTask = {
  ...activeTask,
  id: "second-active",
  title: "核对客户名单",
  createdAtMs: 90,
};

describe("Eternal task panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    bridge.listTasks.mockResolvedValue([activeTask, completedTask]);
    bridge.createTask.mockImplementation(async (title) => ({
      ...activeTask,
      id: "new",
      title,
    }));
    bridge.toggleTask.mockImplementation(async (id) => {
      const task = id === activeTask.id ? activeTask : completedTask;
      return {
        ...task,
        completed: !task.completed,
        completedAtMs: task.completed ? null : 200,
      };
    });
  });

  it("exposes the Eternal brand without making header actions draggable", async () => {
    render(<App />);
    await screen.findByText("提交周报");

    expect(screen.getByRole("heading", { name: "Eternal" })).toBeTruthy();
    expect(screen.getByText("收集箱 · 1 项未完成")).toBeTruthy();

    const header = document.querySelector(".app-header");
    const actions = document.querySelector(".header-actions");
    expect(header?.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(actions?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(
      actions?.querySelector("[data-tauri-drag-region]"),
    ).toBeNull();
  });

  it("captures, completes, searches, and restores tasks from one panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("提交周报")).toBeTruthy();

    const composer = screen.getByRole("textbox", { name: "添加任务" });
    await user.type(composer, "喝一杯水{Enter}");
    expect(bridge.createTask).toHaveBeenCalledWith("喝一杯水");
    expect(await screen.findByText("喝一杯水")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "完成：提交周报" }));
    expect(bridge.toggleTask).toHaveBeenCalledWith("active");

    await user.click(screen.getByRole("button", { name: /显示已完成任务/ }));
    expect(screen.getByText("提交周报")).toBeTruthy();

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    const search = await screen.findByRole("searchbox", { name: "搜索待办" });
    await user.type(search, "喝一杯");
    expect(screen.getByText("喝一杯水")).toBeTruthy();
    expect(screen.queryByText("整理目录")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("textbox", { name: "添加任务" })).toBeTruthy();
  });

  it("switches to the selected appearance without a save step", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("提交周报");

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("radio", { name: "深色" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("lets focused buttons keep their native keyboard activation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("提交周报");

    const settings = screen.getByRole("button", { name: "打开设置" });
    settings.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("region", { name: "设置" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "编辑提醒" })).toBeNull();
  });

  it("moves from capture into task navigation without leaving the keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("提交周报");

    const composer = screen.getByRole("textbox", { name: "添加任务" });
    await user.type(composer, "喝一杯水{Enter}");
    await screen.findByText("喝一杯水");

    await user.keyboard("{ArrowDown} ");

    expect(bridge.toggleTask).toHaveBeenLastCalledWith("active");
  });

  it("keeps completed search results in the keyboard navigation order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("提交周报");

    await user.keyboard("{Meta>}f{/Meta}");
    const search = await screen.findByRole("searchbox", { name: "搜索待办" });
    await user.type(search, "整理");
    expect(screen.getByText("整理目录")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "搜索到的已完成任务" }).disabled,
    ).toBe(true);

    await user.keyboard("{ArrowDown} ");

    expect(bridge.toggleTask).toHaveBeenLastCalledWith("completed");
  });

  it("moves focus into settings instead of returning it to the composer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("提交周报");

    await user.click(screen.getByRole("button", { name: "打开设置" }));

    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "跟随系统" }),
    );
  });

  it("keeps overlay keyboard input inside the reminder editor", async () => {
    const user = userEvent.setup();
    bridge.listTasks.mockResolvedValueOnce([activeTask, secondActiveTask]);
    render(<App />);
    const composer = await screen.findByRole("textbox", { name: "添加任务" });

    await user.keyboard("{ArrowDown}{Enter}");
    const editor = screen.getByRole("region", { name: "编辑提醒" });
    expect(editor.textContent).toContain("核对客户名单");

    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(editor.textContent).toContain("核对客户名单");
    expect(bridge.toggleTask).not.toHaveBeenCalled();
  });

  it("does not abandon capture when there is no task to navigate", async () => {
    const user = userEvent.setup();
    bridge.listTasks.mockResolvedValueOnce([]);
    render(<App />);
    const composer = await screen.findByRole("textbox", { name: "添加任务" });

    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(composer);
  });

  it("returns normal typing to capture after task navigation", async () => {
    const user = userEvent.setup();
    bridge.listTasks.mockResolvedValueOnce([activeTask, secondActiveTask]);
    render(<App />);
    const composer = await screen.findByRole("textbox", { name: "添加任务" });

    await user.keyboard("{ArrowDown}x");

    expect(document.activeElement).toBe(composer);
    expect(composer.value).toBe("x");
    expect(document.querySelector(".task-row.is-selected")).toBeNull();
  });

  it("returns shifted typing to capture without invoking a task command", async () => {
    const user = userEvent.setup();
    bridge.listTasks.mockResolvedValueOnce([activeTask, secondActiveTask]);
    render(<App />);
    const composer = await screen.findByRole("textbox", { name: "添加任务" });

    await user.keyboard("{ArrowDown}{Shift>}x{/Shift}");

    expect(document.activeElement).toBe(composer);
    expect(composer.value).toBe("X");
    expect(bridge.toggleTask).not.toHaveBeenCalled();
  });

  it("does not treat modified Space as task completion", async () => {
    const user = userEvent.setup();
    bridge.listTasks.mockResolvedValueOnce([activeTask, secondActiveTask]);
    render(<App />);
    await screen.findByText("核对客户名单");

    await user.keyboard("{ArrowDown}{Control>} {/Control}");

    expect(bridge.toggleTask).not.toHaveBeenCalled();
  });

  it("falls back to system appearance when saved theme data is invalid", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("eternal.theme", "pink");
    render(<App />);
    await screen.findByText("提交周报");

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const systemTheme = screen.getByRole("radio", { name: "跟随系统" });

    expect(systemTheme.checked).toBe(true);
    expect(document.activeElement).toBe(systemTheme);
    expect(document.documentElement.dataset.theme).toBe("system");
  });
});
