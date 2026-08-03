import { describe, expect, it } from "vitest";

import {
  DEFAULT_PIN_SHORTCUT,
  DEFAULT_SHORTCUT,
  acceleratorFromEvent,
  formatAccelerator,
} from "./shortcut";

function keyEvent(overrides) {
  return {
    key: "a",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("acceleratorFromEvent", () => {
  it("keeps waiting while only modifier keys are held", () => {
    for (const key of ["Meta", "Control", "Alt", "Shift"]) {
      expect(acceleratorFromEvent(keyEvent({ key, metaKey: true }))).toBeNull();
    }
  });

  it("reads the default combination the way the panel ships it", () => {
    expect(
      acceleratorFromEvent(
        keyEvent({ key: " ", metaKey: true, shiftKey: true }),
      ),
    ).toBe(DEFAULT_SHORTCUT);
  });

  it("treats Command and Control as the same cross-platform modifier", () => {
    expect(
      acceleratorFromEvent(keyEvent({ key: "e", ctrlKey: true, altKey: true })),
    ).toBe("CommandOrControl+Alt+E");
    expect(
      acceleratorFromEvent(keyEvent({ key: "e", metaKey: true, altKey: true })),
    ).toBe("CommandOrControl+Alt+E");
  });

  it("names arrows, digits, and function keys the way the backend expects", () => {
    expect(
      acceleratorFromEvent(keyEvent({ key: "ArrowUp", metaKey: true })),
    ).toBe("CommandOrControl+Up");
    expect(acceleratorFromEvent(keyEvent({ key: "1", ctrlKey: true }))).toBe(
      "CommandOrControl+1",
    );
    expect(acceleratorFromEvent(keyEvent({ key: "F13" }))).toBe("F13");
  });

  it("orders modifiers canonically no matter how they are held", () => {
    expect(
      acceleratorFromEvent(
        keyEvent({ key: "k", shiftKey: true, altKey: true, metaKey: true }),
      ),
    ).toBe("CommandOrControl+Alt+Shift+K");
  });

  it("ignores keys it cannot name instead of inventing a token", () => {
    expect(acceleratorFromEvent(keyEvent({ key: "Dead", metaKey: true }))).toBeNull();
  });
});

describe("formatAccelerator", () => {
  it("renders macOS symbols without separators", () => {
    expect(formatAccelerator(DEFAULT_SHORTCUT, "darwin")).toBe("⌘⇧Space");
    expect(formatAccelerator("CommandOrControl+Alt+E", "darwin")).toBe("⌘⌥E");
  });

  it("renders Windows names joined with plus signs", () => {
    expect(formatAccelerator(DEFAULT_SHORTCUT, "win32")).toBe(
      "Ctrl+Shift+Space",
    );
    expect(formatAccelerator("CommandOrControl+Alt+E", "win32")).toBe(
      "Ctrl+Alt+E",
    );
  });

  it("renders the dedicated pin shortcut distinctly from global show/hide", () => {
    expect(DEFAULT_PIN_SHORTCUT).toBe("CommandOrControl+Shift+P");
    expect(DEFAULT_PIN_SHORTCUT).not.toBe(DEFAULT_SHORTCUT);
    expect(formatAccelerator(DEFAULT_PIN_SHORTCUT, "darwin")).toBe("⌘⇧P");
    expect(formatAccelerator(DEFAULT_PIN_SHORTCUT, "win32")).toBe(
      "Ctrl+Shift+P",
    );
  });

  it("renders an unmodified function key on both platforms", () => {
    expect(formatAccelerator("F13", "darwin")).toBe("F13");
    expect(formatAccelerator("F13", "win32")).toBe("F13");
  });

  it("falls back to a readable placeholder when nothing is bound", () => {
    expect(formatAccelerator("", "darwin")).toBe("未设置");
    expect(formatAccelerator(null, "win32")).toBe("未设置");
  });
});
