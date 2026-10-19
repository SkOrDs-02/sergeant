import { describe, expect, it } from "vitest";
import { kyivDayStartMs } from "@sergeant/shared";
import {
  comparisonWindow,
  isLatestPeriod,
  monthKeysOf,
  periodDays,
  periodOf,
  periodWindow,
  rangePeriod,
  shiftPeriod,
} from "./analyticsPeriod";

const HOUR = 3_600_000;

describe("periodOf", () => {
  it("тиждень завжди з понеділка по неділю", () => {
    expect(periodOf("week", "2026-10-21")).toEqual({
      kind: "week",
      fromKey: "2026-10-19",
      toKey: "2026-10-25",
    });
    // Неділя належить тижню, що почався шість днів тому.
    expect(periodOf("week", "2026-10-25").fromKey).toBe("2026-10-19");
    expect(periodOf("week", "2026-10-19").fromKey).toBe("2026-10-19");
  });

  it("місяць і рік календарні, з останнім днем включно", () => {
    expect(periodOf("month", "2026-02-14")).toMatchObject({
      fromKey: "2026-02-01",
      toKey: "2026-02-28",
    });
    expect(periodOf("month", "2024-02-14").toKey).toBe("2024-02-29");
    expect(periodOf("year", "2026-06-15")).toMatchObject({
      fromKey: "2026-01-01",
      toKey: "2026-12-31",
    });
  });
});

describe("periodWindow на межі DST", () => {
  it("тиждень із переходом на зимовий час має 7 діб і годину, а межі київські", () => {
    // Київ переходить з EEST на EET у неділю 2026-10-25.
    const w = periodWindow(periodOf("week", "2026-10-22"));
    expect(w.startMs).toBe(kyivDayStartMs("2026-10-19"));
    expect(w.endMs).toBe(kyivDayStartMs("2026-10-26"));
    expect(w.endMs - w.startMs).toBe(7 * 24 * HOUR + HOUR);
    // Понеділок о 00:00 за Києвом: 21:00 UTC неділі влітку.
    expect(new Date(w.startMs).toISOString()).toBe("2026-10-18T21:00:00.000Z");
    expect(new Date(w.endMs).toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });

  it("тиждень із переходом на літній час коротший на годину", () => {
    const w = periodWindow(periodOf("week", "2026-03-29"));
    expect(w.fromKey).toBe("2026-03-23");
    expect(w.endMs - w.startMs).toBe(7 * 24 * HOUR - HOUR);
  });
});

describe("shiftPeriod", () => {
  it("гортає тиждень, місяць і рік на календарний крок", () => {
    expect(shiftPeriod(periodOf("week", "2026-10-21"), -1).fromKey).toBe(
      "2026-10-12",
    );
    expect(shiftPeriod(periodOf("month", "2026-01-10"), -1)).toMatchObject({
      fromKey: "2025-12-01",
      toKey: "2025-12-31",
    });
    expect(shiftPeriod(periodOf("year", "2026-05-05"), 1).fromKey).toBe(
      "2027-01-01",
    );
  });

  it("гортає діапазон на його власну довжину", () => {
    const r = rangePeriod("2026-06-10", "2026-06-01");
    expect(r).toMatchObject({ fromKey: "2026-06-01", toKey: "2026-06-10" });
    expect(periodDays(r)).toBe(10);
    expect(shiftPeriod(r, 1)).toMatchObject({
      fromKey: "2026-06-11",
      toKey: "2026-06-20",
    });
  });
});

describe("comparisonWindow", () => {
  it("діапазон 10 днів порівнюється з попередніми 10, що закінчуються за день до «від»", () => {
    const c = comparisonWindow(
      rangePeriod("2026-06-01", "2026-06-10"),
      "2026-06-15",
    );
    expect(c).toMatchObject({
      fromKey: "2026-05-22",
      toKey: "2026-05-31",
      partial: false,
    });
    expect(periodDays(c)).toBe(10);
  });

  it("діапазон, що включає сьогодні, не обрізається: його межі задала людина", () => {
    const c = comparisonWindow(
      rangePeriod("2026-06-06", "2026-06-15"),
      "2026-06-15",
    );
    expect(c).toMatchObject({ fromKey: "2026-05-27", toKey: "2026-06-05" });
    expect(c.partial).toBe(false);
  });

  it("незавершений місяць міряється тими ж днями попереднього", () => {
    const c = comparisonWindow(periodOf("month", "2026-06-15"), "2026-06-15");
    expect(c).toMatchObject({
      fromKey: "2026-05-01",
      toKey: "2026-05-15",
      partial: true,
    });
  });

  it("31-ше число проти коротшого місяця бере весь попередній, не залазячи далі", () => {
    const c = comparisonWindow(periodOf("month", "2026-03-31"), "2026-03-31");
    // Останній день місяця: період уже повний, база теж повна.
    expect(c).toMatchObject({ fromKey: "2026-02-01", toKey: "2026-02-28" });
    const c30 = comparisonWindow(periodOf("month", "2026-03-30"), "2026-03-30");
    expect(c30).toMatchObject({ toKey: "2026-02-28", partial: true });
  });

  it("незавершений тиждень: пн-ср проти пн-ср минулого", () => {
    const c = comparisonWindow(periodOf("week", "2026-10-21"), "2026-10-21");
    expect(c).toMatchObject({
      fromKey: "2026-10-12",
      toKey: "2026-10-14",
      partial: true,
    });
  });

  it("незавершений рік: від 1 січня до того самого дня торік", () => {
    const c = comparisonWindow(periodOf("year", "2026-06-15"), "2026-06-15");
    expect(c).toMatchObject({
      fromKey: "2025-01-01",
      toKey: "2025-06-15",
      partial: true,
    });
  });

  it("минулий рік повністю проти позаминулого календарного", () => {
    const c = comparisonWindow(periodOf("year", "2025-03-01"), "2026-06-15");
    expect(c).toMatchObject({
      fromKey: "2024-01-01",
      toKey: "2024-12-31",
      partial: false,
    });
  });
});

describe("isLatestPeriod і monthKeysOf", () => {
  it("далі за поточний період не гортається", () => {
    expect(isLatestPeriod(periodOf("week", "2026-10-21"), "2026-10-21")).toBe(
      true,
    );
    expect(isLatestPeriod(periodOf("week", "2026-10-14"), "2026-10-21")).toBe(
      false,
    );
    expect(
      isLatestPeriod(rangePeriod("2026-06-01", "2026-06-10"), "2026-06-15"),
    ).toBe(true);
  });

  it("перелічує місяці відрізка", () => {
    expect(monthKeysOf("2025-12-29", "2026-02-02")).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthKeysOf("2026-06-01", "2026-06-30")).toEqual(["2026-06"]);
  });
});
