export function filterTasks(tasks, query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return tasks;

  return tasks.filter((task) =>
    task.title.toLocaleLowerCase().includes(normalized),
  );
}

export function moveSelection(currentIndex, direction, itemCount) {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return direction < 0 ? itemCount - 1 : 0;

  return (currentIndex + direction + itemCount) % itemCount;
}

export function isSubmitKey(event) {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}

export function nextEscapeAction(mode, { isRecordingShortcut = false } = {}) {
  if (isRecordingShortcut) return "cancel-recording";
  if (mode === "reminder" || mode === "settings" || mode === "delete") {
    return "close-overlay";
  }
  if (mode === "search") return "exit-search";
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
