import { describe, expect, it } from "vitest";

import {
  filterTasks,
  isSubmitKey,
  moveSelection,
  nextEscapeAction,
} from "./task-state";

const tasks = [
  { id: "1", title: "提交周报", completed: false },
  { id: "2", title: "整理 Report 数据", completed: false },
  { id: "3", title: "喝水", completed: true },
];

describe("filterTasks", () => {
  it("matches Chinese and Latin text without changing task order", () => {
    expect(filterTasks(tasks, "report").map((task) => task.id)).toEqual(["2"]);
    expect(filterTasks(tasks, "提").map((task) => task.id)).toEqual(["1"]);
    expect(filterTasks(tasks, "   ")).toEqual(tasks);
  });
});

describe("moveSelection", () => {
  it("wraps through the visible list and handles an empty list", () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(-1);
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
    expect(nextEscapeAction("search")).toBe("exit-search");
    expect(nextEscapeAction("normal")).toBe("hide-panel");
  });
});
