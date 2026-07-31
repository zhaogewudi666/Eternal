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
