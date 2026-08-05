import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskComposer } from "./TaskComposer";

function renderComposer(overrides = {}) {
  const props = {
    mode: "normal",
    value: "",
    inputRef: { current: null },
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onExitSearch: vi.fn(),
    onFocusInput: vi.fn(),
    ...overrides,
  };
  render(<TaskComposer {...props} />);
  return props;
}

describe("TaskComposer long-text capture", () => {
  it("renders a multi-line textarea for normal capture so long drafts stay visible", () => {
    renderComposer();
    const composer = screen.getByRole("textbox", { name: "添加任务" });
    expect(composer.tagName).toBe("TEXTAREA");
    expect(composer).toHaveProperty("value", "");
  });

  it("keeps search as a single-line searchbox", () => {
    renderComposer({ mode: "search" });
    expect(screen.getByRole("searchbox", { name: "搜索待办" })).toBeTruthy();
  });

  it("grows the textarea height as the draft grows past one line", async () => {
    const user = userEvent.setup();
    const { onChange } = renderComposer();
    const composer = screen.getByRole("textbox", { name: "添加任务" });

    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      value: 84,
    });

    const longDraft = "很长的一条任务文本，".repeat(10);
    await user.type(composer, longDraft);

    expect(onChange).toHaveBeenCalled();
    expect(Number.parseInt(composer.style.height, 10)).toBeGreaterThan(40);
  });

  it("submits on Enter and keeps Shift+Enter as a newline", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ value: "准备开始" });

    const composer = screen.getByRole("textbox", { name: "添加任务" });
    await user.type(composer, "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(composer, "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("resets the textarea height when the draft is cleared", async () => {
    const user = userEvent.setup();
    const inputRef = { current: null };
    const props = {
      mode: "normal",
      value: "一条草稿",
      inputRef,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      onExitSearch: vi.fn(),
      onFocusInput: vi.fn(),
    };
    const { rerender } = render(<TaskComposer {...props} />);

    const composer = screen.getByRole("textbox", { name: "添加任务" });
    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      value: 84,
    });
    await user.type(composer, "加长内容");
    expect(composer.style.height).toBe("84px");

    // Simulate App clearing the draft after submit: value prop becomes "".
    rerender(<TaskComposer {...props} value="" />);
    expect(composer.style.height).toBe("");
  });

  it("shows an editing state with a pencil and edit placeholder", () => {
    renderComposer({ editing: true, value: "旧标题" });
    expect(screen.getByRole("textbox", { name: "编辑任务标题" })).toHaveProperty(
      "value",
      "旧标题",
    );
    expect(screen.getByPlaceholderText("编辑任务标题…")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "添加任务" })).toBeNull();
  });
});
