import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ReminderEditor } from "./ReminderEditor";

const task = {
  id: "task",
  title: "喝一杯水",
  completed: false,
  createdAtMs: 100,
  completedAtMs: null,
  reminder: null,
};

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-31T12:00:00"));
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
  vi.useRealTimers();
});
