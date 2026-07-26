// referenceMs у всіх тестах — полудень 2025-06-18 Kyiv (UTC+3 влітку), щоб
// не залежати від системного часу і уникнути DST-межових крайніх випадків.
import { describe, expect, it } from "vitest";
import {
  getWaterLastNDays,
  getWaterAverageMl,
  getWaterStreak,
} from "./waterHistory.js";

// 2025-06-18 12:00 Kyiv (UTC+3) = 2025-06-18 09:00 UTC.
const REF_MS = Date.UTC(2025, 5, 18, 9, 0, 0);

describe("getWaterLastNDays", () => {
  it("повертає count днів, найстаріший першим, закінчуючи сьогодні", () => {
    const days = getWaterLastNDays(
      { "2025-06-18": 500, "2025-06-16": 1000 },
      3,
      REF_MS,
    );
    expect(days).toEqual([
      { dayKey: "2025-06-16", ml: 1000 },
      { dayKey: "2025-06-17", ml: 0 },
      { dayKey: "2025-06-18", ml: 500 },
    ]);
  });

  it("день без запису → ml: 0", () => {
    const days = getWaterLastNDays({}, 2, REF_MS);
    expect(days).toEqual([
      { dayKey: "2025-06-17", ml: 0 },
      { dayKey: "2025-06-18", ml: 0 },
    ]);
  });

  it("count <= 0 → []", () => {
    expect(getWaterLastNDays({ "2025-06-18": 500 }, 0, REF_MS)).toEqual([]);
  });

  it("санітайзить log через normalizeWaterLog (невалідні ключі/значення відкидаються)", () => {
    const days = getWaterLastNDays(
      { "2025-06-18": "garbage", "bogus-key": 999 },
      1,
      REF_MS,
    );
    expect(days).toEqual([{ dayKey: "2025-06-18", ml: 0 }]);
  });
});

describe("getWaterAverageMl", () => {
  it("середнє за 7 днів, дні без запису рахуються як 0", () => {
    // Лише сьогодні (2025-06-18) має запис 1400 мл → 1400/7 = 200.
    const avg = getWaterAverageMl({ "2025-06-18": 1400 }, 7, REF_MS);
    expect(avg).toBe(200);
  });

  it("середнє за 30 днів", () => {
    const avg = getWaterAverageMl({ "2025-06-18": 3000 }, 30, REF_MS);
    expect(avg).toBe(100);
  });

  it("days <= 0 → 0", () => {
    expect(getWaterAverageMl({ "2025-06-18": 1000 }, 0, REF_MS)).toBe(0);
  });

  it("порожній log → 0", () => {
    expect(getWaterAverageMl({}, 7, REF_MS)).toBe(0);
  });
});

describe("getWaterStreak", () => {
  it("0 коли goalMl не задана", () => {
    expect(getWaterStreak({ "2025-06-18": 2000 }, 0, REF_MS)).toBe(0);
    expect(getWaterStreak({ "2025-06-18": 2000 }, -5, REF_MS)).toBe(0);
  });

  it("рахує послідовні дні з ціллю, зупиняється на першому провалі", () => {
    const log = {
      "2025-06-18": 2000, // сьогодні — ціль досягнута
      "2025-06-17": 2100,
      "2025-06-16": 1500, // провал → серія зупиняється тут
      "2025-06-15": 2500,
    };
    expect(getWaterStreak(log, 2000, REF_MS)).toBe(2);
  });

  it("сьогоднішній незавершений день (< ціль) не рахується як зрив — відлік з учора", () => {
    const log = {
      "2025-06-18": 500, // сьогодні ще не досягнуто, день не завершився
      "2025-06-17": 2000,
      "2025-06-16": 2000,
    };
    expect(getWaterStreak(log, 2000, REF_MS)).toBe(2);
  });

  it("порожній log → 0", () => {
    expect(getWaterStreak({}, 2000, REF_MS)).toBe(0);
  });
});
