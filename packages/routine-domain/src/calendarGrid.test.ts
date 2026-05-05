import { describe, expect, it } from "vitest";

import { FINYK_SUB_GROUP_LABEL, FIZRUK_GROUP_LABEL } from "./calendarEvents.js";
import {
  groupEventsForList,
  monthBounds,
  monthGrid,
  timeOfDayBucket,
  todayDate,
} from "./calendarGrid.js";
import type { HubCalendarEvent } from "./types.js";

describe("todayDate", () => {
  it("returns a Date snapped to 12:00 local", () => {
    const d = todayDate();
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe("monthBounds", () => {
  it("returns inclusive date-keys for a 31-day month", () => {
    // Січень 2025.
    expect(monthBounds(2025, 0)).toEqual({
      startKey: "2025-01-01",
      endKey: "2025-01-31",
    });
  });

  it("handles lutyi у високосний рік", () => {
    expect(monthBounds(2024, 1)).toEqual({
      startKey: "2024-02-01",
      endKey: "2024-02-29",
    });
  });

  it("handles lutyi у звичайний рік", () => {
    expect(monthBounds(2025, 1)).toEqual({
      startKey: "2025-02-01",
      endKey: "2025-02-28",
    });
  });
});

describe("monthGrid", () => {
  it("returns 42 клітинок (6 тижнів × 7)", () => {
    const { cells } = monthGrid(2025, 0);
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(28);
    expect(cells.length).toBeLessThanOrEqual(42);
  });

  it("pads with null before day 1 so week starts with Mon", () => {
    // Лютий 2025 починається з суботи (JS getDay = 6 → ISO wd = 5).
    const { cells } = monthGrid(2025, 1);
    expect(cells[0]).toBeNull();
    expect(cells[4]).toBeNull();
    expect(cells[5]).toBe(1);
  });

  it("contains every day of the month", () => {
    const { cells } = monthGrid(2025, 2);
    const days = cells.filter((c): c is number => c !== null);
    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe("timeOfDayBucket", () => {
  it("falls back to 'Будь-коли' on empty / malformed input", () => {
    expect(timeOfDayBucket(null)).toBe("Будь-коли");
    expect(timeOfDayBucket(undefined)).toBe("Будь-коли");
    expect(timeOfDayBucket("")).toBe("Будь-коли");
    expect(timeOfDayBucket("bad")).toBe("Будь-коли");
  });

  it("buckets by hour", () => {
    expect(timeOfDayBucket("06:00")).toBe("Ранок");
    expect(timeOfDayBucket("11:59")).toBe("Ранок");
    expect(timeOfDayBucket("12:00")).toBe("День");
    expect(timeOfDayBucket("18:00")).toBe("День");
    expect(timeOfDayBucket("19:00")).toBe("Вечір");
    expect(timeOfDayBucket("23:30")).toBe("Вечір");
  });
});

describe("groupEventsForList", () => {
  function habitEvent(
    id: string,
    time: string | null,
    opts: Partial<HubCalendarEvent> = {},
  ): HubCalendarEvent {
    const base: HubCalendarEvent = {
      id,
      source: "routine",
      sourceKind: "habit",
      habitId: id,
      date: "2025-01-15",
      title: id,
      subtitle: "",
      sortKey: time ?? "",
      tagLabels: [],
      completed: false,
      fizruk: false,
      finykSub: false,
    };
    if (time !== null) {
      base.timeOfDay = time;
    }
    return { ...base, ...opts };
  }

  it("групує за часом доби у фіксованому порядку", () => {
    const events: HubCalendarEvent[] = [
      habitEvent("evening", "20:00"),
      habitEvent("morning", "08:00"),
      habitEvent("noon", "13:00"),
      habitEvent("nullish", null),
    ];
    const groups = groupEventsForList(events);
    expect(groups.map(([head]) => head)).toEqual([
      "Ранок",
      "День",
      "Вечір",
      "Будь-коли",
    ]);
  });

  it("ставить Fizruk / Finyk у власні бакети після habit-груп", () => {
    const events: HubCalendarEvent[] = [
      habitEvent("a", "08:00"),
      habitEvent("fz1", null, {
        sourceKind: "fizruk",
        fizruk: true,
      }),
      habitEvent("fy1", null, {
        sourceKind: "finykSub",
        finykSub: true,
      }),
    ];
    const heads = groupEventsForList(events).map(([h]) => h);
    expect(heads).toEqual(["Ранок", FIZRUK_GROUP_LABEL, FINYK_SUB_GROUP_LABEL]);
  });

  it("повертає пустий масив для пустого вводу", () => {
    expect(groupEventsForList([])).toEqual([]);
  });
});
