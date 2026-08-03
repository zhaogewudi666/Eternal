import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Widget } from "./Widget";

const bridge = vi.hoisted(() => ({
  listTasks: vi.fn(),
  toggleTask: vi.fn(),
  setWidgetEnabled: vi.fn(),
  openMainPanel: vi.fn(),
  subscribeTasksChanged: vi.fn(() => () => {}),
  _tasksChangedHandler: null,
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

const doneTask = {
  id: "done",
  title: "已完成项",
  completed: true,
  createdAtMs: 50,
  completedAtMs: 80,
  reminder: null,
};

describe("Widget", () => {
  beforeEach(() => {
    bridge.listTasks.mockReset();
    bridge.toggleTask.mockReset();
    bridge.setWidgetEnabled.mockReset();
    bridge.openMainPanel.mockReset();
    bridge.subscribeTasksChanged.mockReset();
    bridge._tasksChangedHandler = null;
    bridge.listTasks.mockResolvedValue([activeTask, doneTask]);
    bridge.toggleTask.mockImplementation(async (id) => ({
      ...activeTask,
      id,
      completed: true,
      completedAtMs: 200,
    }));
    bridge.setWidgetEnabled.mockResolvedValue(false);
    bridge.openMainPanel.mockResolvedValue(undefined);
    bridge.subscribeTasksChanged.mockImplementation((handler) => {
      bridge._tasksChangedHandler = handler;
      return () => {
        if (bridge._tasksChangedHandler === handler) {
          bridge._tasksChangedHandler = null;
        }
      };
    });
  });

  it("renders only unfinished tasks and the empty-friendly chrome", async () => {
    render(<Widget />);

    expect(await screen.findByText("提交周报")).toBeTruthy();
    expect(screen.queryByText("已完成项")).toBeNull();
    expect(screen.getByText("1 项未完成")).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开完整面板" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "隐藏桌面组件" })).toBeTruthy();
  });

  it("shows the empty state when every task is complete", async () => {
    bridge.listTasks.mockResolvedValueOnce([doneTask]);
    render(<Widget />);

    expect(
      await screen.findByText("今天轻一点，待办都完成了。"),
    ).toBeTruthy();
  });

  it("toggles a task and rolls back when the backend rejects", async () => {
    bridge.toggleTask.mockRejectedValueOnce(new Error("磁盘只读"));
    const user = userEvent.setup();
    render(<Widget />);
    await screen.findByText("提交周报");

    await user.click(screen.getByRole("checkbox", { name: "完成：提交周报" }));

    await screen.findByText(/磁盘只读/);
    expect(screen.getByText("提交周报")).toBeTruthy();
  });

  it("opens the full panel and hides the widget through the bridge", async () => {
    const user = userEvent.setup();
    render(<Widget />);
    await screen.findByText("提交周报");

    await user.click(screen.getByRole("button", { name: "打开完整面板" }));
    expect(bridge.openMainPanel).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "隐藏桌面组件" }));
    expect(bridge.setWidgetEnabled).toHaveBeenCalledWith(false);
  });

  it("refreshes when a newer tasks-changed revision arrives", async () => {
    render(<Widget />);
    await screen.findByText("提交周报");

    bridge.listTasks.mockResolvedValueOnce([
      { ...activeTask, id: "next", title: "同步后的任务" },
    ]);
    bridge._tasksChangedHandler?.({ revision: 2 });

    expect(await screen.findByText("同步后的任务")).toBeTruthy();
  });
});
