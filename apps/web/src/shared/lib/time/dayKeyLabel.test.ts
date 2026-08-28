import { describe, expect, it } from "vitest";
import { formatDayKeyUk, formatDayRangeUk } from "./dayKeyLabel";

const TODAY = "2026-08-06";

describe("formatDayKeyUk", () => {
  it("дає відносні підписи для сусідніх днів", () => {
    expect(formatDayKeyUk("2026-08-06", { todayKey: TODAY })).toBe("сьогодні");
    expect(formatDayKeyUk("2026-08-05", { todayKey: TODAY })).toBe("вчора");
    expect(formatDayKeyUk("2026-08-07", { todayKey: TODAY })).toBe("завтра");
  });

  it("у межах поточного року рік не дописує", () => {
    expect(formatDayKeyUk("2026-08-02", { todayKey: TODAY })).toBe("2 серп");
    expect(formatDayKeyUk("2026-01-31", { todayKey: TODAY })).toBe("31 січ");
  });

  it("інший рік підписує явно", () => {
    expect(formatDayKeyUk("2025-12-31", { todayKey: TODAY })).toBe(
      "31 гру 2025",
    );
  });

  it("без todayKey відносних підписів не вигадує", () => {
    expect(formatDayKeyUk("2026-08-06")).toBe("6 серп 2026");
  });

  it("relative=false дає дату навіть для сьогодні", () => {
    expect(formatDayKeyUk(TODAY, { todayKey: TODAY, relative: false })).toBe(
      "6 серп",
    );
  });

  /**
   * AI-DANGER: регресія на `new Date("2026-08-06")` — це UTC-північ, і будь-який
   * відʼємний зсув пересуває її на 5 серпня. Якби парсинг ішов через `Date`,
   * «сьогодні» ставало б «вчора» для половини світу. Тест тримає інваріант
   * незалежно від TZ процесу.
   */
  it("не залежить від часового поясу процесу", () => {
    const tz = process.env["TZ"];
    try {
      process.env["TZ"] = "Pacific/Honolulu";
      expect(formatDayKeyUk("2026-08-06", { todayKey: TODAY })).toBe(
        "сьогодні",
      );
      process.env["TZ"] = "Pacific/Kiritimati";
      expect(formatDayKeyUk("2026-08-06", { todayKey: TODAY })).toBe(
        "сьогодні",
      );
    } finally {
      if (tz === undefined) delete process.env["TZ"];
      else process.env["TZ"] = tz;
    }
  });

  it("нерозпізнаний вхід повертає як є", () => {
    expect(formatDayKeyUk("не дата")).toBe("не дата");
    expect(formatDayKeyUk("2026-13-01")).toBe("2026-13-01");
  });
});

describe("formatDayRangeUk", () => {
  it("однаковий from/to згортає в один день", () => {
    expect(formatDayRangeUk(TODAY, TODAY, { todayKey: TODAY })).toBe(
      "сьогодні",
    );
  });

  it("у межах місяця місяць пишеться раз", () => {
    expect(
      formatDayRangeUk("2026-08-01", "2026-08-06", { todayKey: TODAY }),
    ).toBe("1–6 серп");
  });

  it("через межу місяця — обидві дати повністю", () => {
    expect(
      formatDayRangeUk("2026-07-28", "2026-08-06", { todayKey: TODAY }),
    ).toBe("28 лип – 6 серп");
  });

  it("нерозпізнаний вхід лишає сирий діапазон", () => {
    expect(formatDayRangeUk("abc", "2026-08-06")).toBe("abc – 2026-08-06");
  });
});
