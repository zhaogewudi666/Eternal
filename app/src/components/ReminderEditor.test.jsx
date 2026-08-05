import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { reminderPresetAt, toLocalInputValue } from "../model/reminder-time";
import { ReminderEditor } from "./ReminderEditor";

const task = {
  id: "task",
  title: "喝一杯水",
  completed: false,
  createdAtMs: 100,
  completedAtMs: null,
  reminder: null,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-07-31T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

it("does not submit an empty reminder time", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <ReminderEditor
      task={task}
      onSave={onSave}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  await user.clear(screen.getByLabelText("时间"));
  const save = screen.getByRole("button", { name: "保存" });

  expect(save.disabled).toBe(true);
  await user.click(save);
  expect(onSave).not.toHaveBeenCalled();
});

it("does not save a reminder in the past and focuses the time field", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <ReminderEditor
      task={task}
      onSave={onSave}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const time = screen.getByLabelText("时间");
  expect(document.activeElement).toBe(time);

  await user.clear(time);
  await user.type(time, "2000-01-01T00:00");

  const save = screen.getByRole("button", { name: "保存" });
  expect(save.disabled).toBe(true);
  await user.click(save);
  expect(onSave).not.toHaveBeenCalled();
});

it("disables save when an open editor passes the selected time", () => {
  const { unmount } = render(
    <ReminderEditor
      task={task}
      onSave={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const save = screen.getByRole("button", { name: "保存" });
  expect(save.disabled).toBe(false);

  act(() => {
    vi.advanceTimersByTime(16 * 60_000);
  });

  expect(save.disabled).toBe(true);
  unmount();
});

it("lets Tab reach the datetime, repeat, and save controls", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <ReminderEditor
      task={task}
      onSave={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const time = screen.getByLabelText("时间");
  const repeat = screen.getByLabelText("重复");
  const save = screen.getByRole("button", { name: "保存" });
  expect(document.activeElement).toBe(time);

  await user.tab();
  expect(document.activeElement).toBe(repeat);
  await user.tab();
  // Cancel is before presets/actions depending on layout; reach save eventually.
  let guard = 0;
  while (document.activeElement !== save && guard < 8) {
    await user.tab();
    guard += 1;
  }
  expect(document.activeElement).toBe(save);
});

it("saves a valid reminder with Enter and cancels with Esc without persisting", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ReminderEditor
      task={task}
      onSave={onSave}
      onClear={vi.fn()}
      onClose={onClose}
    />,
  );

  const time = screen.getByLabelText("时间");
  await user.clear(time);
  await user.type(time, "2026-07-31T18:00");
  await user.keyboard("{Enter}");

  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toBe(new Date("2026-07-31T18:00").getTime());
  expect(onClose).not.toHaveBeenCalled();

  onSave.mockClear();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

it("does not save with Enter while the native repeat select is focused", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onSave = vi.fn();
  render(
    <ReminderEditor
      task={task}
      onSave={onSave}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const repeat = screen.getByLabelText("重复");
  repeat.focus();
  await user.keyboard("{Enter}");
  expect(onSave).not.toHaveBeenCalled();
});

it("exposes compact presets that only fill local time without persisting", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onSave = vi.fn();
  const now = Date.now();
  render(
    <ReminderEditor
      task={task}
      onSave={onSave}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "15 分钟" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "1 小时" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "今晚" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "明天" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "今晚" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText("时间").value).toBe(
    toLocalInputValue(reminderPresetAt("tonight", now)),
  );

  await user.click(screen.getByRole("button", { name: "15 分钟" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText("时间").value).toBe(
    toLocalInputValue(reminderPresetAt("15m", now)),
  );

  await user.click(screen.getByRole("button", { name: "1 小时" }));
  expect(screen.getByLabelText("时间").value).toBe(
    toLocalInputValue(reminderPresetAt("1h", now)),
  );

  await user.click(screen.getByRole("button", { name: "明天" }));
  expect(screen.getByLabelText("时间").value).toBe(
    toLocalInputValue(reminderPresetAt("tomorrow", now)),
  );

  await user.keyboard("{Enter}");
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toBe(reminderPresetAt("tomorrow", now));
});

describe("ReminderEditor title editing", () => {
  function renderEditor(overrides = {}) {
    const props = {
      task,
      onSave: vi.fn(),
      onClear: vi.fn(),
      onClose: vi.fn(),
      onRename: vi.fn(),
      ...overrides,
    };
    const utils = render(<ReminderEditor {...props} />);
    return { props, utils };
  }

  it("shows an edit action next to the task title", () => {
    renderEditor();
    expect(screen.getByText("喝一杯水")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^编辑标题/ })).toBeTruthy();
  });

  it("turns the title into an input prefilled with the task title", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderEditor();

    await user.click(screen.getByRole("button", { name: /^编辑标题/ }));
    const input = screen.getByRole("textbox");
    expect(input).toHaveProperty("value", "喝一杯水");
    expect(document.activeElement).toBe(input);
  });

  it("saves the edited title with Enter", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { props, utils } = renderEditor();

    await user.click(screen.getByRole("button", { name: /^编辑标题/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "修改后的标题{Enter}");

    expect(props.onRename).toHaveBeenCalledWith("task", "修改后的标题");
    expect(screen.queryByRole("textbox")).toBeNull();

    // After a rename the parent updates the task; the editor re-renders the title.
    const nextTask = { ...task, title: "修改后的标题" };
    utils.rerender(
      <ReminderEditor
        task={nextTask}
        onSave={props.onSave}
        onClear={props.onClear}
        onClose={props.onClose}
        onRename={props.onRename}
      />,
    );
    expect(screen.getByText("修改后的标题")).toBeTruthy();
  });

  it("cancels with Escape without renaming", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { props } = renderEditor();

    await user.click(screen.getByRole("button", { name: /^编辑标题/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "不保存的内容{Escape}");

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("喝一杯水")).toBeTruthy();
  });

  it("ignores a blank save", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { props } = renderEditor();

    await user.click(screen.getByRole("button", { name: /^编辑标题/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "{Enter}");

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
