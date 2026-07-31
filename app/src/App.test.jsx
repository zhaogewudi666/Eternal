import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const bridge = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  toggleTask: vi.fn(),
  setReminder: vi.fn(),
  clearReminder: vi.fn(),
  hidePanel: vi.fn(),
  getGlobalShortcut: vi.fn(),
  setGlobalShortcut: vi.fn(),
  setShortcutRecording: vi.fn(),
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

const originalPlatform = Object.getOwnPropertyDescriptor(
  window.navigator,
  "platform",
);

function usePlatform(platform) {
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("Eternal task panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    usePlatform("Win32");
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
    bridge.getGlobalShortcut.mockResolvedValue({
      accelerator: "CommandOrControl+Shift+Space",
      registered: true,
    });
    bridge.setGlobalShortcut.mockImplementation(async (accelerator) => accelerator);
    bridge.setShortcutRecording.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(window.navigator, "platform", originalPlatform);
    }
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
    expect(actions?.querySelector("[data-tauri-drag-region]")).toBeNull();
  });

  it("captures, completes, and searches tasks from one panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("提交周报")).toBeTruthy();

    const composer = screen.getByRole("textbox", { name: "添加任务" });
    await user.type(composer, "喝一杯水{Enter}");
    expect(bridge.createTask).toHaveBeenCalledWith("喝一杯水");
    expect(await screen.findByText("喝一杯水")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "完成：提交周报" }));
    expect(bridge.toggleTask).toHaveBeenCalledWith("active");

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    const search = await screen.findByRole("searchbox", { name: "搜索待办" });
    await user.type(search, "喝一杯");
    expect(screen.getByText("喝一杯水")).toBeTruthy();
    expect(screen.queryByText("整理目录")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("textbox", { name: "添加任务" })).toBeTruthy();
  });

  describe("stacked unfinished and completed sections", () => {
    it("renders unfinished rows first and a completed section below", async () => {
      render(<App />);
      await screen.findByText("提交周报");

      expect(screen.queryByRole("radiogroup", { name: "任务视图" })).toBeNull();
      expect(screen.queryByRole("radio", { name: /待办/ })).toBeNull();
      expect(screen.getByRole("heading", { name: "已完成" })).toBeTruthy();
      expect(screen.getByText("整理目录")).toBeTruthy();

      const unfinished = screen.getByText("提交周报").closest(".task-row");
      const completed = screen.getByText("整理目录").closest(".task-row");
      const position = unfinished.compareDocumentPosition(completed);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(completed.classList.contains("is-completed")).toBe(true);
    });

    it("keeps capture available and jumps sections with numeric shortcuts", async () => {
      render(<App />);
      await screen.findByText("提交周报");
      expect(screen.getByRole("textbox", { name: "添加任务" })).toBeTruthy();

      fireEvent.keyDown(window, { key: "2", metaKey: true });

      await waitFor(() => {
        expect(
          document
            .querySelector('[data-task-id="completed"]')
            ?.classList.contains("is-selected"),
        ).toBe(true);
      });
      expect(screen.getByText("提交周报")).toBeTruthy();
      expect(screen.getByRole("textbox", { name: "添加任务" })).toBeTruthy();

      fireEvent.keyDown(window, { key: "1", ctrlKey: true });

      await waitFor(() => {
        expect(
          document
            .querySelector('[data-task-id="active"]')
            ?.classList.contains("is-selected"),
        ).toBe(true);
      });
    });

    it("restores a completed task with Space without leaving the panel", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("整理目录");

      fireEvent.keyDown(window, { key: "2", metaKey: true });
      await waitFor(() => {
        expect(
          document
            .querySelector('[data-task-id="completed"]')
            ?.classList.contains("is-selected"),
        ).toBe(true);
      });

      await user.keyboard(" ");

      expect(bridge.toggleTask).toHaveBeenLastCalledWith("completed");
      expect(screen.getByRole("textbox", { name: "添加任务" })).toBeTruthy();
    });

    it("still captures typed characters while a completed row is selected", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("整理目录");

      fireEvent.keyDown(window, { key: "2", metaKey: true });
      await waitFor(() => {
        expect(
          document
            .querySelector('[data-task-id="completed"]')
            ?.classList.contains("is-selected"),
        ).toBe(true);
      });

      await user.keyboard("x");

      const composer = screen.getByRole("textbox", { name: "添加任务" });
      expect(document.activeElement).toBe(composer);
      expect(composer.value).toBe("x");
      expect(bridge.createTask).not.toHaveBeenCalled();
    });

    it("keeps selection on the toggled task after it moves sections", async () => {
      bridge.listTasks.mockResolvedValueOnce([activeTask, secondActiveTask]);
      bridge.toggleTask.mockImplementation(async () => ({
        ...secondActiveTask,
        completed: true,
        completedAtMs: 200,
      }));
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("核对客户名单");

      await user.keyboard("{ArrowDown} ");

      expect(bridge.toggleTask).toHaveBeenCalledWith("second-active");
      await waitFor(() => {
        expect(
          document
            .querySelector('[data-task-id="second-active"]')
            ?.classList.contains("is-completed"),
        ).toBe(true);
      });
      expect(
        document
          .querySelector('[data-task-id="second-active"]')
          ?.classList.contains("is-selected"),
      ).toBe(true);
      expect(document.querySelectorAll(".task-row.is-selected").length).toBe(1);
    });

    it("does not reintroduce exclusive views or collapsed completed controls", async () => {
      render(<App />);
      await screen.findByText("提交周报");

      expect(screen.queryByRole("button", { name: "返回待办" })).toBeNull();
      expect(screen.queryByRole("button", { name: /显示已完成任务/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /隐藏已完成任务/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "搜索到的已完成任务" })).toBeNull();
      expect(document.querySelector(".view-switch")).toBeNull();
      expect(document.querySelector(".completed-bar")).toBeNull();
    });
  });

  describe("search across both sections", () => {
    it("finds completed and unfinished tasks and labels their state", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      fireEvent.keyDown(window, { key: "f", metaKey: true });
      const search = await screen.findByRole("searchbox", { name: "搜索待办" });
      await user.type(search, "整理");

      const row = screen.getByText("整理目录").closest(".task-row");
      expect(row).toBeTruthy();
      expect(row.textContent).toContain("已完成");
    });

    it("keeps completed search results in the keyboard navigation order", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.keyboard("{Meta>}f{/Meta}");
      const search = await screen.findByRole("searchbox", { name: "搜索待办" });
      await user.type(search, "整理");
      expect(screen.getByText("整理目录")).toBeTruthy();

      await user.keyboard("{ArrowDown} ");

      expect(bridge.toggleTask).toHaveBeenLastCalledWith("completed");
    });

    it("labels unfinished search hits as 待办", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      fireEvent.keyDown(window, { key: "f", metaKey: true });
      const search = await screen.findByRole("searchbox", { name: "搜索待办" });
      await user.type(search, "提交");

      const row = screen.getByText("提交周报").closest(".task-row");
      expect(row.textContent).toContain("待办");
    });
  });

  describe("global shortcut settings", () => {
    it("shows the stored shortcut using Windows key names", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));

      expect(screen.getByRole("region", { name: "全局快捷键" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
      ).toContain("Ctrl+Shift+Space");
    });

    it("shows the stored shortcut using macOS symbols", async () => {
      usePlatform("MacIntel");
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));

      expect(
        screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
      ).toContain("⌘⇧Space");
    });

    it("shows a saved shortcut as unavailable when startup registration failed", async () => {
      bridge.getGlobalShortcut.mockResolvedValueOnce({
        accelerator: "CommandOrControl+Alt+E",
        registered: false,
      });
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));

      expect(
        screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
      ).toContain("Ctrl+Alt+E");
      expect(screen.getByRole("status").textContent).toContain("当前未生效");
    });

    it("records a new combination from the keyboard alone", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      const record = screen.getByRole("button", { name: /录制全局快捷键/ });
      await user.click(record);

      expect(record.getAttribute("aria-pressed")).toBe("true");
      expect(bridge.setShortcutRecording).toHaveBeenCalledWith(true);
      expect(screen.getByRole("status").textContent).toContain("Esc");

      fireEvent.keyDown(window, { key: "e", ctrlKey: true, altKey: true });

      await waitFor(() => {
        expect(bridge.setGlobalShortcut).toHaveBeenCalledWith(
          "CommandOrControl+Alt+E",
        );
      });
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
        ).toContain("Ctrl+Alt+E");
      });
      expect(record.getAttribute("aria-pressed")).toBe("false");
      expect(bridge.setShortcutRecording).toHaveBeenLastCalledWith(false);
    });

    it("ignores modifier-only presses while recording", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      const record = screen.getByRole("button", { name: /录制全局快捷键/ });
      await user.click(record);

      fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
      fireEvent.keyDown(window, { key: "Shift", ctrlKey: true, shiftKey: true });

      expect(bridge.setGlobalShortcut).not.toHaveBeenCalled();
      expect(record.getAttribute("aria-pressed")).toBe("true");
    });

    it("cancels recording with Escape without closing settings", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await user.click(screen.getByRole("button", { name: /录制全局快捷键/ }));

      fireEvent.keyDown(window, { key: "Escape" });

      const record = screen.getByRole("button", { name: /录制全局快捷键/ });
      expect(record.getAttribute("aria-pressed")).toBe("false");
      expect(record.textContent).toContain("Ctrl+Shift+Space");
      expect(screen.getByRole("region", { name: "设置" })).toBeTruthy();
      expect(bridge.setShortcutRecording).toHaveBeenLastCalledWith(false);
      expect(bridge.hidePanel).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("region", { name: "设置" })).toBeNull();
    });

    it("keeps the old shortcut and explains a rejected combination", async () => {
      bridge.setGlobalShortcut.mockRejectedValueOnce(
        "只用 Shift 会影响正常输入，请再加上 ⌘/Ctrl 或 Alt。",
      );
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await user.click(screen.getByRole("button", { name: /录制全局快捷键/ }));

      fireEvent.keyDown(window, { key: "a", shiftKey: true });

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("只用 Shift");
      });
      const record = screen.getByRole("button", { name: /录制全局快捷键/ });
      expect(record.textContent).toContain("Ctrl+Shift+Space");
      expect(record.getAttribute("aria-pressed")).toBe("false");
      expect(bridge.setShortcutRecording).toHaveBeenLastCalledWith(false);
    });

    it("refreshes the actual live shortcut after a failed save", async () => {
      bridge.setGlobalShortcut.mockRejectedValueOnce(
        "快捷键未能保存，当前仍使用 Ctrl+Alt+E。",
      );
      bridge.getGlobalShortcut
        .mockResolvedValueOnce({
          accelerator: "CommandOrControl+Shift+Space",
          registered: true,
        })
        .mockResolvedValueOnce({
          accelerator: "CommandOrControl+Alt+E",
          registered: true,
        });
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await user.click(screen.getByRole("button", { name: /录制全局快捷键/ }));
      fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey: true });

      await waitFor(() => {
        expect(bridge.getGlobalShortcut).toHaveBeenCalledTimes(2);
      });
      expect(
        screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
      ).toContain("Ctrl+Alt+E");
      expect(screen.getByRole("status").textContent).toContain("未能保存");
    });

    it("does not enter recording mode when the backend gate cannot start", async () => {
      bridge.setShortcutRecording.mockRejectedValueOnce("无法开始录制");
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      const record = screen.getByRole("button", { name: /录制全局快捷键/ });
      await user.click(record);

      expect(record.getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("status").textContent).toContain("无法开始录制");
    });

    it("releases recording mode when settings is closed", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await user.click(screen.getByRole("button", { name: /录制全局快捷键/ }));
      await user.click(screen.getByRole("button", { name: "完成" }));

      expect(screen.queryByRole("region", { name: "设置" })).toBeNull();
      expect(bridge.setShortcutRecording).toHaveBeenLastCalledWith(false);
    });

    it("reports a failure to release the recording gate", async () => {
      bridge.setShortcutRecording
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce("无法停止录制");
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await user.click(screen.getByRole("button", { name: /录制全局快捷键/ }));
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("无法停止录制");
      });
    });

    it("keeps application shortcuts from dismissing settings", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");
      await user.click(screen.getByRole("button", { name: "打开设置" }));

      fireEvent.keyDown(window, { key: "2", ctrlKey: true });
      fireEvent.keyDown(window, { key: "f", ctrlKey: true });

      expect(screen.getByRole("region", { name: "设置" })).toBeTruthy();
      expect(screen.queryByRole("searchbox", { name: "搜索待办" })).toBeNull();
      expect(
        document
          .querySelector('[data-task-id="completed"]')
          ?.classList.contains("is-selected"),
      ).toBeFalsy();
    });

    it("restores the default shortcut on request", async () => {
      bridge.getGlobalShortcut.mockResolvedValueOnce({
        accelerator: "CommandOrControl+Alt+E",
        registered: true,
      });
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("提交周报");

      await user.click(screen.getByRole("button", { name: "打开设置" }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
        ).toContain("Ctrl+Alt+E");
      });

      await user.click(screen.getByRole("button", { name: "恢复默认快捷键" }));

      await waitFor(() => {
        expect(bridge.setGlobalShortcut).toHaveBeenCalledWith(
          "CommandOrControl+Shift+Space",
        );
      });
      expect(
        screen.getByRole("button", { name: /录制全局快捷键/ }).textContent,
      ).toContain("Ctrl+Shift+Space");
    });
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
    await screen.findByRole("textbox", { name: "添加任务" });

    await user.keyboard("{ArrowDown}{Enter}");
    const editor = screen.getByRole("region", { name: "编辑提醒" });
    expect(editor.textContent).toContain("核对客户名单");

    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    expect(editor.textContent).toContain("核对客户名单");
    expect(bridge.toggleTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("searchbox", { name: "搜索待办" })).toBeNull();
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
