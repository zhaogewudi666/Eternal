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
  if (mode === "reminder" || mode === "settings") return "close-overlay";
  if (mode === "search") return "exit-search";
  return "hide-panel";
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
