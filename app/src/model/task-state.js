export function filterTasks(tasks, query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return tasks;

  return tasks.filter((task) =>
    task.title.toLocaleLowerCase().includes(normalized),
  );
}

/// Text-editable controls accept typed characters; buttons/checkboxes do not.
export function isTextEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = String(target.type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "radio",
      "submit",
      "reset",
      "file",
      "image",
      "range",
      "color",
      "hidden",
    ].includes(type);
  }
  return false;
}

/// Controls that activate natively with Space/Enter (leave them alone).
export function isNativeActivateTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = target.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  if (tag === "INPUT") {
    const type = String(target.type || "").toLowerCase();
    return ["button", "submit", "reset", "checkbox", "radio", "image"].includes(
      type,
    );
  }
  return false;
}

/// Move within a visible list without wraparound. Returns `-1` when the move
/// would leave above the first row (ArrowUp exit), clamps at the last row, and
/// enters at `0` when there is no current selection and direction is down.
export function moveSelection(currentIndex, direction, itemCount) {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return direction > 0 ? 0 : -1;

  const next = currentIndex + direction;
  if (next < 0) return -1;
  if (next >= itemCount) return itemCount - 1;
  return next;
}

export function isSubmitKey(event) {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}

export function nextEscapeAction(
  mode,
  { isRecordingShortcut = false, editingTitle = false } = {},
) {
  if (isRecordingShortcut) return "cancel-recording";
  if (mode === "reminder" || mode === "settings" || mode === "delete") {
    return "close-overlay";
  }
  if (mode === "search") return "exit-search";
  if (editingTitle) return "cancel-edit";
  return "hide-panel";
}

/// After removing `removedId`, pick the nearest remaining neighbor in the
/// current stacked navigation order (prefer the item that slid into its place).
export function selectionAfterDelete(tasks, removedId) {
  const order = stackedNavigationOrder(tasks);
  if (!order.length) return null;

  const index = order.findIndex((task) => task.id === removedId);
  if (index < 0) return order[0]?.id || null;

  const remaining = order.filter((task) => task.id !== removedId);
  if (!remaining.length) return null;
  return remaining[Math.min(index, remaining.length - 1)]?.id || null;
}

/// After finishing an unfinished task, prefer the next unfinished neighbor;
/// else the previous unfinished; if none remain, clear selection and return
/// focus to capture. Restoring a completed task keeps selection on it.
///
/// `preToggleTasks` is the list before the toggle is committed to section layout.
/// `updated` is the task returned by the backend after toggle.
export function selectionAfterToggle(preToggleTasks, updated) {
  if (!updated?.id) {
    return { selectedId: null, focusCapture: true, listNavigating: false };
  }

  if (!updated.completed) {
    return {
      selectedId: updated.id,
      focusCapture: false,
      listNavigating: true,
    };
  }

  const unfinished = preToggleTasks.filter((task) => !task.completed);
  const index = unfinished.findIndex((task) => task.id === updated.id);
  const remaining = unfinished.filter((task) => task.id !== updated.id);

  if (!remaining.length) {
    return { selectedId: null, focusCapture: true, listNavigating: false };
  }

  const next =
    index >= 0
      ? remaining[Math.min(index, remaining.length - 1)]
      : remaining[0];

  return {
    selectedId: next?.id || null,
    focusCapture: false,
    listNavigating: Boolean(next),
  };
}

export const COMPLETE_TRANSITION_MS = 160;
export const RESTORE_TRANSITION_MS = 120;

export function toggleTransitionMs(willBeCompleted, prefersReducedMotion) {
  if (prefersReducedMotion) return 0;
  return willBeCompleted ? COMPLETE_TRANSITION_MS : RESTORE_TRANSITION_MS;
}

/// Context-specific footer hints. Only actions valid in the current mode.
export function footerHintsForContext({
  mode,
  isListNavigating = false,
  selectedId = null,
  isRecordingShortcut = false,
  isSearching = false,
  editingTitle = false,
  modifierLabel = "⌘",
} = {}) {
  if (isRecordingShortcut) {
    return ["Esc 取消录制"];
  }
  if (editingTitle) {
    return ["Enter 保存编辑", "Esc 取消"];
  }
  if (mode === "delete") {
    return ["Enter 确认删除", "Esc 取消"];
  }
  if (mode === "reminder") {
    return ["Tab 切换", "Enter 保存", "Esc 取消"];
  }
  if (mode === "settings") {
    return ["Esc 关闭"];
  }
  if (isSearching || mode === "search") {
    // Only advertise Space after a result is selected; search-input state has no row actions.
    if (isListNavigating && selectedId) {
      return [
        "Space 完成/恢复",
        "Enter 提醒",
        "⌫ 删除",
        "↑ 搜索",
        "Esc 退出搜索",
      ];
    }
    return ["↓ 结果", "Esc 退出搜索"];
  }
  if (isListNavigating && selectedId) {
    return ["Space 完成/恢复", "Enter 提醒", "⌫ 删除", "↑ 输入", "Esc"];
  }
  return [
    "Enter 添加",
    "↓ 列表",
    "/ 搜索",
    `${modifierLabel}1/2 分区`,
    "Esc 关闭",
  ];
}

/// Stacked layout: unfinished first, completed below. Search keeps the same
/// order so keyboard navigation never jumps past a section boundary wrongly.
export function partitionStackedTasks(tasks) {
  return {
    active: tasks.filter((task) => !task.completed),
    completed: tasks.filter((task) => task.completed),
  };
}

export function stackedNavigationOrder(tasks) {
  const { active, completed } = partitionStackedTasks(tasks);
  return [...active, ...completed];
}

export function sectionForShortcutKey(key) {
  if (key === "1") return "active";
  if (key === "2") return "completed";
  return null;
}

/// @deprecated Prefer partitionStackedTasks / stackedNavigationOrder.
/// Kept only as a thin alias for callers that still partition by section.
export function tasksForView(tasks, view) {
  if (view === "search") return stackedNavigationOrder(tasks);
  if (view === "completed") return partitionStackedTasks(tasks).completed;
  return partitionStackedTasks(tasks).active;
}

export function viewForShortcutKey(key) {
  return sectionForShortcutKey(key);
}
