import { describe, it, expect } from "vitest";
import { dismissalsOfToday, isDismissedToday } from "./dismissedToday";

// Локальний полудень: безпечно в будь-якому часовому поясі, межа доби — за
// годинником пристрою, тож усі «моменти» будуються з локальних компонентів.
const NOON = new Date(2026, 9, 1, 12, 0, 0).getTime();
const EARLY = new Date(2026, 9, 1, 0, 0, 1).getTime();
const LATE = new Date(2026, 9, 1, 23, 59, 58).getTime();
const YESTERDAY_LATE = new Date(2026, 8, 30, 23, 59, 59).getTime();
const TOMORROW_EARLY = new Date(2026, 9, 2, 0, 0, 1).getTime();

describe("isDismissedToday", () => {
  it("відкинуто в будь-який момент тієї ж особистої доби — діє", () => {
    expect(isDismissedToday(EARLY, NOON)).toBe(true);
    expect(isDismissedToday(NOON, NOON)).toBe(true);
    expect(isDismissedToday(NOON, LATE)).toBe(true);
  });

  it("з півночі (за годинником пристрою) відкидання минає", () => {
    expect(isDismissedToday(YESTERDAY_LATE, EARLY)).toBe(false);
    expect(isDismissedToday(LATE, TOMORROW_EARLY)).toBe(false);
  });

  it("застарілі записи без мітки часу вважаються простроченими", () => {
    for (const legacy of [
      true,
      1,
      0,
      -5,
      "1759300000000",
      null,
      undefined,
      NaN,
    ]) {
      expect(isDismissedToday(legacy, NOON)).toBe(false);
    }
  });
});

describe("dismissalsOfToday", () => {
  it("лишає лише діючі сьогодні записи", () => {
    expect(
      dismissalsOfToday(
        { today: NOON, yesterday: YESTERDAY_LATE, legacy: true, epoch: 1 },
        NOON,
      ),
    ).toEqual({ today: NOON });
  });

  it("старий формат (масив id) і сміття дають порожню мапу", () => {
    expect(dismissalsOfToday(["a", "b"], NOON)).toEqual({});
    expect(dismissalsOfToday(null, NOON)).toEqual({});
    expect(dismissalsOfToday("x", NOON)).toEqual({});
    expect(dismissalsOfToday(42, NOON)).toEqual({});
  });
});
