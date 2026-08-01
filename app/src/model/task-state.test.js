import { describe, expect, it } from "vitest";

import {
  COMPLETE_TRANSITION_MS,
  RESTORE_TRANSITION_MS,
  filterTasks,
  footerHintsForContext,
  isNativeActivateTarget,
  isSubmitKey,
  isTextEditableTarget,
  moveSelection,
  nextEscapeAction,
  partitionStackedTasks,
  sectionForShortcutKey,
  selectionAfterToggle,
  stackedNavigationOrder,
  tasksForView,
  toggleTransitionMs,
  viewForShortcutKey,
} from "./task-state";

const tasks = [
  { id: "1", title: "提交周报", completed: false },
  { id: "2", title: "整理 Report 数据", completed: false },
  { id: "3", title: "喝水", completed: true },
  { id: "4", title: "旧任务", completed: true },
];

describe("filterTasks", () => {
  it("matches Chinese and Latin text without changing task order", () => {
    expect(filterTasks(tasks, "report").map((task) => task.id)).toEqual(["2"]);
    expect(filterTasks(tasks, "提").map((task) => task.id)).toEqual(["1"]);
    expect(filterTasks(tasks, "   ")).toEqual(tasks);
  });
});

describe("moveSelection", () => {
  it("moves without wraparound and signals exit above the first row", () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(-1, -1, 3)).toBe(-1);
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(2);
    expect(moveSelection(0, -1, 3)).toBe(-1);
    expect(moveSelection(1, -1, 3)).toBe(0);
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });

  it("treats a missing selection as enter-at-zero, not as already-on-zero", () => {
    // Discriminating: forcing missing -> 0 then +1 would land on 1.
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(0, 1, 3)).toBe(1);
  });
});

describe("editable vs interactive targets", () => {
  it("classifies text fields as editable and buttons/switches as not", () => {
    expect(isTextEditableTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEditableTarget({ tagName: "INPUT", type: "search" })).toBe(
      true,
    );
    expect(isTextEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEditableTarget({ tagName: "INPUT", type: "checkbox" })).toBe(
      false,
    );
    expect(isTextEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isNativeActivateTarget({ tagName: "BUTTON" })).toBe(true);
    expect(
      isNativeActivateTarget({ tagName: "INPUT", type: "checkbox" }),
    ).toBe(true);
    expect(isNativeActivateTarget({ tagName: "INPUT", type: "text" })).toBe(
      false,
    );
  });
});

describe("isSubmitKey", () => {
  it("never submits Enter while an IME composition is active", () => {
    expect(isSubmitKey({ key: "Enter", isComposing: false, keyCode: 13 })).toBe(true);
    expect(isSubmitKey({ key: "Enter", isComposing: true, keyCode: 13 })).toBe(false);
    expect(isSubmitKey({ key: "Enter", isComposing: false, keyCode: 229 })).toBe(false);
    expect(isSubmitKey({ key: "Escape", isComposing: false, keyCode: 27 })).toBe(false);
  });
});

describe("nextEscapeAction", () => {
  it("closes sublayers before search and the panel", () => {
    expect(nextEscapeAction("reminder")).toBe("close-overlay");
    expect(nextEscapeAction("settings")).toBe("close-overlay");
    expect(nextEscapeAction("delete")).toBe("close-overlay");
    expect(nextEscapeAction("search")).toBe("exit-search");
    expect(nextEscapeAction("normal")).toBe("hide-panel");
  });

  it("cancels shortcut recording before it closes the settings popover", () => {
    expect(nextEscapeAction("settings", { isRecordingShortcut: true })).toBe(
      "cancel-recording",
    );
    expect(nextEscapeAction("settings", { isRecordingShortcut: false })).toBe(
      "close-overlay",
    );
  });
});

describe("partitionStackedTasks", () => {
  it("keeps unfinished above completed without exclusive views", () => {
    expect(partitionStackedTasks(tasks)).toEqual({
      active: [tasks[0], tasks[1]],
      completed: [tasks[2], tasks[3]],
    });
  });
});

describe("stackedNavigationOrder", () => {
  it("walks unfinished rows first then completed rows", () => {
    expect(stackedNavigationOrder(tasks).map((task) => task.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });
});

describe("tasksForView", () => {
  it("still partitions by section for focused jumps", () => {
    expect(tasksForView(tasks, "active").map((task) => task.id)).toEqual([
      "1",
      "2",
    ]);
    expect(tasksForView(tasks, "completed").map((task) => task.id)).toEqual([
      "3",
      "4",
    ]);
  });

  it("keeps both kinds stacked while searching", () => {
    expect(tasksForView(tasks, "search").map((task) => task.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });
});

describe("sectionForShortcutKey", () => {
  it("maps numeric keys onto stacked sections", () => {
    expect(sectionForShortcutKey("1")).toBe("active");
    expect(sectionForShortcutKey("2")).toBe("completed");
    expect(sectionForShortcutKey("3")).toBeNull();
    expect(viewForShortcutKey("1")).toBe("active");
  });
});

describe("selectionAfterToggle", () => {
  const a = { id: "a", title: "A", completed: false };
  const b = { id: "b", title: "B", completed: false };
  const c = { id: "c", title: "C", completed: false };
  const done = { id: "done", title: "Done", completed: true };

  it("selects the next unfinished task after completing one in the middle", () => {
    expect(
      selectionAfterToggle([a, b, c, done], { ...b, completed: true }),
    ).toEqual({
      selectedId: "c",
      focusCapture: false,
      listNavigating: true,
    });
  });

  it("selects the previous unfinished task when completing the last unfinished", () => {
    expect(
      selectionAfterToggle([a, b, done], { ...b, completed: true }),
    ).toEqual({
      selectedId: "a",
      focusCapture: false,
      listNavigating: true,
    });
  });

  it("clears selection and focuses capture when no unfinished tasks remain", () => {
    expect(
      selectionAfterToggle([a, done], { ...a, completed: true }),
    ).toEqual({
      selectedId: null,
      focusCapture: true,
      listNavigating: false,
    });
  });

  it("keeps selection on a restored task in the unfinished section", () => {
    expect(
      selectionAfterToggle([a, done], { ...done, completed: false }),
    ).toEqual({
      selectedId: "done",
      focusCapture: false,
      listNavigating: true,
    });
  });
});

describe("toggleTransitionMs", () => {
  it("uses 160ms for complete, 120ms for restore, and 0 for reduced motion", () => {
    expect(toggleTransitionMs(true, false)).toBe(COMPLETE_TRANSITION_MS);
    expect(toggleTransitionMs(false, false)).toBe(RESTORE_TRANSITION_MS);
    expect(toggleTransitionMs(true, true)).toBe(0);
    expect(toggleTransitionMs(false, true)).toBe(0);
    expect(COMPLETE_TRANSITION_MS).toBe(160);
    expect(RESTORE_TRANSITION_MS).toBe(120);
  });
});

describe("footerHintsForContext", () => {
  it("shows capture-only hints including Enter add without row actions", () => {
    expect(
      footerHintsForContext({ mode: "normal", modifierLabel: "⌘" }),
    ).toEqual([
      "Enter 添加",
      "↓ 列表",
      "/ 搜索",
      "⌘1/2 分区",
      "Esc 关闭",
    ]);
  });

  it("shows row-action hints when a task is keyboard-selected", () => {
    expect(
      footerHintsForContext({
        mode: "normal",
        isListNavigating: true,
        selectedId: "a",
        modifierLabel: "Ctrl+",
      }),
    ).toEqual(["Space 完成/恢复", "Enter 提醒", "⌫ 删除", "↑ 输入", "Esc"]);
  });

  it("shows reminder keyboard closure hints", () => {
    expect(footerHintsForContext({ mode: "reminder" })).toEqual([
      "Tab 切换",
      "Enter 保存",
      "Esc 取消",
    ]);
  });

  it("shows only valid actions for delete, settings, search, and recording", () => {
    expect(footerHintsForContext({ mode: "delete" })).toEqual([
      "Enter 确认删除",
      "Esc 取消",
    ]);
    expect(footerHintsForContext({ mode: "settings" })).toEqual(["Esc 关闭"]);
    expect(footerHintsForContext({ mode: "search" })).toEqual([
      "↓ 结果",
      "Esc 退出搜索",
    ]);
    expect(
      footerHintsForContext({
        mode: "search",
        isListNavigating: true,
        selectedId: "a",
      }),
    ).toEqual([
      "Space 完成/恢复",
      "Enter 提醒",
      "⌫ 删除",
      "↑ 搜索",
      "Esc 退出搜索",
    ]);
    expect(
      footerHintsForContext({ mode: "settings", isRecordingShortcut: true }),
    ).toEqual(["Esc 取消录制"]);
  });

  it("uses the Windows modifier label on capture hints", () => {
    expect(
      footerHintsForContext({ mode: "normal", modifierLabel: "Ctrl+" }),
    ).toContain("Ctrl+1/2 分区");
  });
});
