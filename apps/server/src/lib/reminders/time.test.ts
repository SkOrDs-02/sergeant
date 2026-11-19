import { describe, expect, it } from "vitest";

import {
  catchUpFromHmIn,
  dayKeyIn,
  hmIn,
  isInQuietWindow,
  isValidTimeZone,
  kyivDayKey,
  kyivDayKeyMinusDays,
  kyivHm,
  resolveUserTimeZone,
} from "./time.js";

describe("київський час у sweep-і", () => {
  it("рахує день за Києвом, а не за UTC контейнера", () => {
    // 2026-08-03 21:30 UTC — це вже 00:30 наступної доби за Києвом (UTC+3).
    // Без явної зони нагадування о 00:30 поїхало б у попередній день.
    const at = new Date("2026-08-03T21:30:00Z");
    expect(kyivDayKey(at)).toBe("2026-08-04");
    expect(kyivHm(at)).toBe("00:30");
  });

  it("не зʼїжджає на добу через зимовий зсув", () => {
    // Взимку Київ — UTC+2.
    const at = new Date("2026-01-15T22:30:00Z");
    expect(kyivDayKey(at)).toBe("2026-01-16");
    expect(kyivHm(at)).toBe("00:30");
  });

  it("віддає опівніч як 00:00, а не 24:00", () => {
    expect(kyivHm(new Date("2026-08-03T21:00:00Z"))).toBe("00:00");
  });

  it("віднімає календарні доби, а не 24-годинні інтервали", () => {
    // Вікно з переходом на літній час: Україна переводить годинники
    // в останню неділю березня. Відніманням мілісекунд межа зʼїхала б.
    expect(kyivDayKeyMinusDays(new Date("2026-04-01T12:00:00Z"), 7)).toBe(
      "2026-03-25",
    );
  });
});

// Спека notifications-quiet-hours-and-device-time: доба й хвилина в поясі
// людини, IANA-імʼям, а не фіксованим зсувом.
describe("час у поясі людини", () => {
  it("America/New_York: зимовий UTC-5 і та сама мить на добу раніше, ніж у Києві", () => {
    const at = new Date("2026-12-01T03:30:00Z");
    expect(dayKeyIn(at, "America/New_York")).toBe("2026-11-30");
    expect(hmIn(at, "America/New_York")).toBe("22:30");
    expect(kyivDayKey(at)).toBe("2026-12-01");
  });

  it("America/New_York у день переходу на літній час (2026-03-08)", () => {
    // До 07:00Z діє EST (UTC-5), після - EDT (UTC-4). Фіксований зсув -5
    // дав би 02:30 для другої миті, а годинник людини показує 03:30.
    expect(hmIn(new Date("2026-03-08T06:30:00Z"), "America/New_York")).toBe(
      "01:30",
    );
    expect(hmIn(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe(
      "03:30",
    );
    expect(dayKeyIn(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe(
      "2026-03-08",
    );
  });

  it("Asia/Tokyo: UTC+9 без літнього часу, наступна доба раніше за Київ", () => {
    const at = new Date("2026-08-03T15:30:00Z");
    expect(dayKeyIn(at, "Asia/Tokyo")).toBe("2026-08-04");
    expect(hmIn(at, "Asia/Tokyo")).toBe("00:30");
    expect(kyivDayKey(at)).toBe("2026-08-03");
  });

  it("невідомий або невалідний пояс читається як Київ", () => {
    expect(resolveUserTimeZone(null)).toBe("Europe/Kyiv");
    expect(resolveUserTimeZone(undefined)).toBe("Europe/Kyiv");
    expect(resolveUserTimeZone("Mars/Olympus")).toBe("Europe/Kyiv");
    expect(resolveUserTimeZone("America/New_York")).toBe("America/New_York");
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("наздоганяння рахує межу доби в поясі людини", () => {
    const now = new Date("2026-12-01T05:01:00Z"); // 00:01 у Нью-Йорку
    const last = new Date("2026-12-01T04:58:00Z"); // 23:58 попередньої доби
    expect(catchUpFromHmIn(now, last, "America/New_York")).toBe("");
    expect(catchUpFromHmIn(now, last, "Europe/Kyiv")).toBe("06:58");
  });
});

describe("isInQuietWindow", () => {
  const on = (startMin: number, endMin: number) => ({
    enabled: true,
    startMin,
    endMin,
  });

  it("22:00-08:00 через північ: кінець не включно", () => {
    const night = on(22 * 60, 8 * 60);
    expect(isInQuietWindow(23 * 60 + 30, night)).toBe(true);
    expect(isInQuietWindow(0, night)).toBe(true);
    expect(isInQuietWindow(7 * 60 + 59, night)).toBe(true);
    expect(isInQuietWindow(8 * 60, night)).toBe(false);
    expect(isInQuietWindow(21 * 60 + 59, night)).toBe(false);
    expect(isInQuietWindow(22 * 60, night)).toBe(true);
  });

  it("13:00-15:00 без переходу через північ", () => {
    const lunch = on(13 * 60, 15 * 60);
    expect(isInQuietWindow(13 * 60, lunch)).toBe(true);
    expect(isInQuietWindow(14 * 60 + 59, lunch)).toBe(true);
    expect(isInQuietWindow(15 * 60, lunch)).toBe(false);
    expect(isInQuietWindow(23 * 60, lunch)).toBe(false);
  });

  it("enabled: false - вікна немає", () => {
    expect(
      isInQuietWindow(23 * 60, { enabled: false, startMin: 1320, endMin: 480 }),
    ).toBe(false);
  });
});
