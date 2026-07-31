/// Pure local-time helpers for reminder presets. No side effects.

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function atLocalTime(baseDate, hours, minutes = 0) {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  ).getTime();
}

/// Next local 20:00 — today if that instant is still in the future, else tomorrow.
export function nextTonightAt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const todayAt20 = atLocalTime(now, 20, 0);
  if (todayAt20 > nowMs) return todayAt20;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return atLocalTime(tomorrow, 20, 0);
}

/// Next local calendar day at 09:00 (always tomorrow relative to `nowMs`).
export function nextTomorrowMorningAt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return atLocalTime(tomorrow, 9, 0);
}

export function reminderPresetAt(preset, nowMs = Date.now()) {
  switch (preset) {
    case "15m":
      return nowMs + 15 * 60_000;
    case "1h":
      return nowMs + 60 * 60_000;
    case "tonight":
      return nextTonightAt(nowMs);
    case "tomorrow":
      return nextTomorrowMorningAt(nowMs);
    default:
      throw new Error(`Unknown reminder preset: ${preset}`);
  }
}

export function toLocalInputValue(timestamp) {
  const date = new Date(timestamp || Date.now() + 15 * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export { startOfLocalDay, atLocalTime };
