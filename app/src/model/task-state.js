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

export function nextEscapeAction(mode) {
  if (mode === "reminder" || mode === "settings") return "close-overlay";
  if (mode === "search") return "exit-search";
  return "hide-panel";
}
