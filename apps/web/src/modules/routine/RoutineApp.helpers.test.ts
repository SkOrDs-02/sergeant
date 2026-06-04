// @vitest-environment jsdom
/**
 * Юніт-тести чистих хелперів RoutineApp.helpers.ts.
 *
 * Всі функції — pure (дата-арифметика, групування подій) — не залежать від
 * React чи мережі. Тести фіксують контракт кожної функції окремо, щоб
 * майбутні рефактори не зламали поведінку непомітно.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  monthBounds,
  monthGrid,
  timeOfDayBucket,
  groupEventsForList,
  HABIT_TIME_GROUPS,
  GROUP_ORDER,
} from "./RoutineApp.helpers";
import type { HubCalendarEvent } from "./lib/types";

// ── monthBounds ───────────────────────────────────────────────────────────────

describe("monthBounds", () => {
  it("повертає перший і останній день квітня 2025 (30 днів)", () => {
    const { startKey, endKey } = monthBounds(2025, 3); // month index 3 = April
    expect(startKey).toBe("2025-04-01");
    expect(endKey).toBe("2025-04-30");
  });

  it("повертає перший і останній день лютого 2024 (високосний рік)", () => {
    const { startKey, endKey } = monthBounds(2024, 1);
    expect(startKey).toBe("2024-02-01");
    expect(endKey).toBe("2024-02-29");
  });

  it("повертає перший і останній день лютого 2025 (не високосний)", () => {
    const { startKey, endKey } = monthBounds(2025, 1);
    expect(startKey).toBe("2025-02-01");
    expect(endKey).toBe("2025-02-28");
  });

  it("повертає перший і останній день грудня 2025 (31 день)", () => {
    const { startKey, endKey } = monthBounds(2025, 11);
    expect(startKey).toBe("2025-12-01");
    expect(endKey).toBe("2025-12-31");
  });

  it("коректно обробляє January 2026 (місяць 0)", () => {
    const { startKey, endKey } = monthBounds(2026, 0);
    expect(startKey).toBe("2026-01-01");
    expect(endKey).toBe("2026-01-31");
  });
});

// ── monthGrid ─────────────────────────────────────────────────────────────────

describe("monthGrid", () => {
  it("загальна кількість клітинок кратна 7 (повні тижні) для всіх місяців 2025", () => {
    for (const month of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const { cells } = monthGrid(2025, month);
      expect(cells.length % 7, `month ${month}`).toBe(0);
    }
  });

  it("квітень 2025: 30 ненульових клітинок", () => {
    const { cells } = monthGrid(2025, 3);
    expect(cells.filter((c) => c !== null)).toHaveLength(30);
  });

  it("лютий 2024 (29 днів): правильна кількість ненульових клітинок", () => {
    const { cells } = monthGrid(2024, 1);
    expect(cells.filter((c) => c !== null)).toHaveLength(29);
  });

  it("лютий 2025 (28 днів): правильна кількість ненульових клітинок", () => {
    const { cells } = monthGrid(2025, 1);
    expect(cells.filter((c) => c !== null)).toHaveLength(28);
  });

  it("останній ненульовий елемент = кількість днів у місяці (квітень = 30)", () => {
    const { cells } = monthGrid(2025, 3);
    const days = cells.filter((c) => c !== null);
    expect(days[days.length - 1]).toBe(30);
  });

  it("перший ненульовий елемент завжди = 1", () => {
    const { cells } = monthGrid(2025, 0); // January
    const firstDay = cells.find((c) => c !== null);
    expect(firstDay).toBe(1);
  });

  it("грудень 2025 (31 день): ненульових клітинок = 31", () => {
    const { cells } = monthGrid(2025, 11);
    expect(cells.filter((c) => c !== null)).toHaveLength(31);
  });
});

// ── timeOfDayBucket ───────────────────────────────────────────────────────────

describe("timeOfDayBucket", () => {
  it("null → Будь-коли", () => {
    expect(timeOfDayBucket(null)).toBe("Будь-коли");
  });

  it("undefined → Будь-коли", () => {
    expect(timeOfDayBucket(undefined)).toBe("Будь-коли");
  });

  it("порожній рядок → Будь-коли", () => {
    expect(timeOfDayBucket("")).toBe("Будь-коли");
  });

  it("некоректний формат (NaN після parse) → Будь-коли", () => {
    expect(timeOfDayBucket("not-a-time")).toBe("Будь-коли");
  });

  it("00:00–11:59 → Ранок", () => {
    expect(timeOfDayBucket("00:00")).toBe("Ранок");
    expect(timeOfDayBucket("06:30")).toBe("Ранок");
    expect(timeOfDayBucket("11:59")).toBe("Ранок");
  });

  it("12:00–18:00 → День", () => {
    expect(timeOfDayBucket("12:00")).toBe("День");
    expect(timeOfDayBucket("15:30")).toBe("День");
    expect(timeOfDayBucket("18:00")).toBe("День");
  });

  it("19:00–23:59 → Вечір (h > 18)", () => {
    // Межа: h <= 18 → День, h > 18 → Вечір
    expect(timeOfDayBucket("19:00")).toBe("Вечір");
    expect(timeOfDayBucket("21:00")).toBe("Вечір");
    expect(timeOfDayBucket("23:59")).toBe("Вечір");
    // h === 18 → День (включно)
    expect(timeOfDayBucket("18:59")).toBe("День");
  });

  it("підрізає пробіли навколо часу", () => {
    expect(timeOfDayBucket("  08:00  ")).toBe("Ранок");
  });
});

// ── groupEventsForList ────────────────────────────────────────────────────────

// Мінімальна фабрика для HubCalendarEvent
function mkHabitEvent(
  id: string,
  timeOfDay: string | undefined,
  extra?: Partial<HubCalendarEvent>,
): HubCalendarEvent {
  const base: HubCalendarEvent = {
    id,
    source: "routine",
    date: "2025-06-04",
    title: id,
    subtitle: "",
    sortKey: id,
    sourceKind: "habit",
    tagLabels: [],
    ...extra,
  };
  // With exactOptionalPropertyTypes we must not assign `undefined` to an
  // optional property — only set it when we actually have a value.
  if (timeOfDay !== undefined) {
    base.timeOfDay = timeOfDay;
  }
  return base;
}

describe("groupEventsForList", () => {
  it("порожній масив → порожній результат", () => {
    expect(groupEventsForList([])).toEqual([]);
  });

  it("звичка без timeOfDay потрапляє в групу Будь-коли", () => {
    const e = mkHabitEvent("h1", undefined);
    const groups = groupEventsForList([e]);
    expect(groups).toHaveLength(1);
    expect(groups[0]![0]).toBe("Будь-коли");
    expect(groups[0]![1]).toContain(e);
  });

  it("ранкова звичка (07:00) потрапляє в групу Ранок", () => {
    const e = mkHabitEvent("h1", "07:00");
    const groups = groupEventsForList([e]);
    expect(groups[0]![0]).toBe("Ранок");
  });

  it("денна звичка (14:00) потрапляє в групу День", () => {
    const e = mkHabitEvent("h1", "14:00");
    const groups = groupEventsForList([e]);
    expect(groups[0]![0]).toBe("День");
  });

  it("вечірня звичка (20:00) потрапляє в групу Вечір", () => {
    const e = mkHabitEvent("h1", "20:00");
    const groups = groupEventsForList([e]);
    expect(groups[0]![0]).toBe("Вечір");
  });

  it("fizruk-подія потрапляє у fizruk-групу незалежно від timeOfDay", () => {
    const e = mkHabitEvent("w1", "08:00", { fizruk: true });
    const groups = groupEventsForList([e]);
    const keys = groups.map(([k]) => k);
    expect(keys).not.toContain("Ранок");
    // fizruk label comes from FIZRUK_GROUP_LABEL
    expect(keys.length).toBe(1);
  });

  it("порядок груп відповідає GROUP_ORDER (Ранок → День → Вечір → Будь-коли)", () => {
    const events: HubCalendarEvent[] = [
      mkHabitEvent("evening", "20:00"),
      mkHabitEvent("morning", "07:00"),
      mkHabitEvent("anytime", undefined),
      mkHabitEvent("afternoon", "14:00"),
    ];
    const groups = groupEventsForList(events);
    const keys = groups.map(([k]) => k);
    const indices = keys.map((k) => GROUP_ORDER.indexOf(k));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!, `${keys[i]} after ${keys[i - 1]}`).toBeGreaterThan(
        indices[i - 1]!,
      );
    }
  });

  it("non-habit sourceKind використовує перший tagLabel як заголовок групи", () => {
    const e: HubCalendarEvent = {
      id: "custom",
      source: "custom",
      date: "2025-06-04",
      title: "Custom",
      subtitle: "",
      sortKey: "custom",
      sourceKind: "other",
      tagLabels: ["MyTag"],
    };
    const morning = mkHabitEvent("m", "07:00");
    const groups = groupEventsForList([e, morning]);
    const keys = groups.map(([k]) => k);
    // "Ранок" (GROUP_ORDER index 0) should come before "MyTag" (not in GROUP_ORDER)
    expect(keys.indexOf("Ранок")).toBeLessThan(keys.indexOf("MyTag"));
  });

  it("non-habit з пустим tagLabels потрапляє в групу Інше", () => {
    const e: HubCalendarEvent = {
      id: "other",
      source: "other",
      date: "2025-06-04",
      title: "Other",
      subtitle: "",
      sortKey: "other",
      sourceKind: "other",
      tagLabels: [],
    };
    const groups = groupEventsForList([e]);
    expect(groups[0]![0]).toBe("Інше");
  });

  it("HABIT_TIME_GROUPS exposes the 4 expected bucket names", () => {
    expect(HABIT_TIME_GROUPS).toEqual(["Ранок", "День", "Вечір", "Будь-коли"]);
  });
});

// ── todayDate — Kyiv-noon invariant ───────────────────────────────────────────

describe("todayDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze Kyiv time: 2025-06-04 14:00 EEST (UTC+3) = UTC 11:00
    vi.setSystemTime(new Date("2025-06-04T11:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("повертає Date, де год = 12 (noon-anchor), а день відповідає Kyiv-time", async () => {
    const { todayDate } = await import("./RoutineApp.helpers");
    const d = todayDate();
    expect(d.getHours()).toBe(12);
    // June = month index 5
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(4);
    expect(d.getFullYear()).toBe(2025);
  });
});
