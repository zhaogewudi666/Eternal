import { describe, expect, it } from "vitest";

import {
  nextTonightAt,
  nextTomorrowMorningAt,
  reminderPresetAt,
  toLocalInputValue,
} from "./reminder-time";

describe("reminderPresetAt", () => {
  it("adds fifteen minutes and one hour from now", () => {
    const now = Date.parse("2026-07-31T12:00:00");
    expect(reminderPresetAt("15m", now)).toBe(now + 15 * 60_000);
    expect(reminderPresetAt("1h", now)).toBe(now + 60 * 60_000);
  });

  it("uses today's 20:00 for tonight when that time is still ahead", () => {
    const morning = Date.parse("2026-07-31T10:30:00");
    const expected = new Date(2026, 6, 31, 20, 0, 0, 0).getTime();
    expect(nextTonightAt(morning)).toBe(expected);
    expect(reminderPresetAt("tonight", morning)).toBe(expected);
  });

  it("rolls tonight to tomorrow 20:00 when today 20:00 has passed", () => {
    const evening = Date.parse("2026-07-31T20:00:00");
    const expected = new Date(2026, 6, 31 + 1, 20, 0, 0, 0).getTime();
    expect(nextTonightAt(evening)).toBe(expected);
    expect(reminderPresetAt("tonight", evening)).toBe(expected);
  });

  it("uses the next local day at 09:00 for tomorrow", () => {
    const late = Date.parse("2026-07-31T23:15:00");
    const expected = new Date(2026, 6, 31 + 1, 9, 0, 0, 0).getTime();
    expect(nextTomorrowMorningAt(late)).toBe(expected);
    expect(reminderPresetAt("tomorrow", late)).toBe(expected);
  });

  it("always lands strictly in the future for supported presets", () => {
    const samples = [
      Date.parse("2026-07-31T00:00:00"),
      Date.parse("2026-07-31T19:59:59"),
      Date.parse("2026-07-31T20:00:00"),
      Date.parse("2026-07-31T23:59:59"),
    ];
    for (const now of samples) {
      for (const preset of ["15m", "1h", "tonight", "tomorrow"]) {
        expect(reminderPresetAt(preset, now)).toBeGreaterThan(now);
      }
    }
  });
});

describe("toLocalInputValue", () => {
  it("formats a timestamp as local datetime-local value", () => {
    const stamp = new Date(2026, 6, 31, 15, 45, 0, 0).getTime();
    expect(toLocalInputValue(stamp)).toMatch(/2026-07-31T15:45/);
  });
});
