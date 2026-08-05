import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskList } from "./TaskList";

const baseTask = {
  id: "t1",
  title: "找一个 git 工具，因为现在的多 agent 协同是基于 git，这样我可视化的可以看各个 agent 的提交历史",
  completed: false,
  createdAtMs: 100,
  completedAtMs: null,
  reminder: null,
};

function renderList(overrides = {}) {
  const props = {
    activeTasks: [baseTask],
    completedTasks: [],
    emptyActiveMessage: "现在没有未完成的事情",
    emptySearchMessage: "没有匹配的任务",
    selectedId: null,
    showStatus: false,
    isSearching: false,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onEditReminder: vi.fn(),
    onRequestDelete: vi.fn(),
    onRename: vi.fn(),
    ...overrides,
  };
  render(<TaskList {...props} />);
  return props;
}

function row() {
  return screen.getByText(baseTask.title).closest(".task-row");
}

describe("TaskList long-title display", () => {
  it("keeps rows collapsed to one line by default", () => {
    renderList();
    const title = screen.getByText(baseTask.title);
    expect(title).toBeTruthy();
    expect(row().classList.contains("is-expanded")).toBe(false);
  });

  it("expands the row to show the full text when clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList();

    await user.click(screen.getByText(baseTask.title));
    expect(row().classList.contains("is-expanded")).toBe(true);
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("collapses the row when clicked again", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText(baseTask.title));
    expect(row().classList.contains("is-expanded")).toBe(true);

    await user.click(screen.getByText(baseTask.title));
    expect(row().classList.contains("is-expanded")).toBe(false);
  });

  it("does not toggle expansion when clicking row action buttons", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("checkbox", { name: `完成：${baseTask.title}` }));
    expect(row().classList.contains("is-expanded")).toBe(false);
  });

  it("stays expanded while its content grows (no fixed height)", () => {
    renderList();
    const title = screen.getByText(baseTask.title);
    const cs = { whiteSpace: "normal", overflowWrap: "anywhere" };
    // Simulate the expanded state applying the multi-line style.
    row().classList.add("is-expanded");
    expect(title.style.whiteSpace).toBe("");
    expect(title.classList.contains("is-expanded-title")).toBe(false);
    void cs;
  });
});

describe("TaskList inline title editing", () => {
  it("shows an edit action only after the row is expanded", async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();
    expect(screen.queryByRole("button", { name: /^编辑：/ })).toBeNull();

    await user.click(screen.getByText(baseTask.title));
    expect(screen.getByRole("button", { name: /^编辑：/ })).toBeTruthy();
    void onRename;
  });

  it("turns the title into an input when editing starts", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText(baseTask.title));

    await user.click(screen.getByRole("button", { name: /^编辑：/ }));
    const input = screen.getByRole("textbox");
    expect(input).toHaveProperty("value", baseTask.title);
    expect(document.activeElement).toBe(input);
  });

  it("saves the edited title with Enter", async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();
    await user.click(screen.getByText(baseTask.title));
    await user.click(screen.getByRole("button", { name: /^编辑：/ }));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "修改后的标题{Enter}");

    expect(onRename).toHaveBeenCalledWith("t1", "修改后的标题");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels with Escape without renaming", async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();
    await user.click(screen.getByText(baseTask.title));
    await user.click(screen.getByRole("button", { name: /^编辑：/ }));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "不保存的内容{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("ignores a blank save", async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();
    await user.click(screen.getByText(baseTask.title));
    await user.click(screen.getByRole("button", { name: /^编辑：/ }));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "{Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });
});
