// Pure-helpers журналу води: sanitize, normalize, add/subtract/reset.
// `today` — день ПРИСТРОЮ (ADR-0078), не Kyiv — тому мокаємо системний час
// через `vi.useFakeTimers()` / `vi.setSystemTime()`, а не саму функцію.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  WATER_LOG_KEY,
  normalizeWaterLog,
  getTodayWaterMl,
  addWaterMl,
  subtractWaterMl,
  resetTodayWater,
} from "./waterLog.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2025, 5, 18, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WATER_LOG_KEY", () => {
  it("стабільний LS-key (зміна = міграція даних)", () => {
    expect(WATER_LOG_KEY).toBe("nutrition_water_v1");
  });
});

describe("normalizeWaterLog", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "garbage"],
    ["number", 42],
    ["array", [1, 2, 3]],
  ])("повертає {} для невалідного raw (%s)", (_label, raw) => {
    expect(normalizeWaterLog(raw)).toEqual({});
  });

  it("відкидає ключі, що не відповідають ISO YYYY-MM-DD", () => {
    expect(
      normalizeWaterLog({
        "2025-06-18": 250,
        "2025/06/18": 100, // wrong separator
        "06-18": 50, // partial
        abc: 200,
      }),
    ).toEqual({ "2025-06-18": 250 });
  });

  it("санітайзить значення: <=0, NaN, рядки → відкидаються", () => {
    expect(
      normalizeWaterLog({
        "2025-06-18": 250,
        "2025-06-17": 0, // <=0
        "2025-06-16": -100, // <0
        "2025-06-15": "garbage", // NaN
        "2025-06-14": "300", // numeric string → 300
        "2025-06-13": 1.7, // floor
      }),
    ).toEqual({
      "2025-06-18": 250,
      "2025-06-14": 300,
      "2025-06-13": 1,
    });
  });
});

describe("getTodayWaterMl", () => {
  it("0 для невалідного log", () => {
    expect(getTodayWaterMl(null)).toBe(0);
    expect(getTodayWaterMl("garbage")).toBe(0);
  });

  it("повертає сьогоднішнє значення з log-у", () => {
    expect(getTodayWaterMl({ "2025-06-18": 750 })).toBe(750);
  });

  it("0 коли today відсутній / NaN / <=0", () => {
    expect(getTodayWaterMl({ "2025-06-17": 750 })).toBe(0);
    expect(getTodayWaterMl({ "2025-06-18": -50 })).toBe(0);
    expect(getTodayWaterMl({ "2025-06-18": "abc" })).toBe(0);
  });
});

describe("addWaterMl", () => {
  it("додає delta до сьогоднішнього сумарного", () => {
    expect(addWaterMl({ "2025-06-18": 250 }, 200)).toEqual({
      "2025-06-18": 450,
    });
  });

  it("створює запис коли today відсутній", () => {
    expect(addWaterMl({ "2025-06-17": 1000 }, 250)).toEqual({
      "2025-06-17": 1000,
      "2025-06-18": 250,
    });
  });

  it("delta <= 0 → no-op (повертає normalized log без змін)", () => {
    expect(addWaterMl({ "2025-06-18": 250 }, 0)).toEqual({ "2025-06-18": 250 });
    expect(addWaterMl({ "2025-06-18": 250 }, -100)).toEqual({
      "2025-06-18": 250,
    });
    expect(addWaterMl({ "2025-06-18": 250 }, "garbage")).toEqual({
      "2025-06-18": 250,
    });
  });

  it("санітайзить starting log (відкидає невалідні ключі)", () => {
    expect(addWaterMl({ "bogus-key": 999, "2025-06-17": 100 }, 50)).toEqual({
      "2025-06-17": 100,
      "2025-06-18": 50,
    });
  });
});

describe("subtractWaterMl", () => {
  it("віднімає delta від сьогоднішнього", () => {
    expect(subtractWaterMl({ "2025-06-18": 500 }, 200)).toEqual({
      "2025-06-18": 300,
    });
  });

  it("видаляє today-ключ коли next <= 0", () => {
    expect(
      subtractWaterMl({ "2025-06-18": 200, "2025-06-17": 100 }, 200),
    ).toEqual({ "2025-06-17": 100 });
    expect(subtractWaterMl({ "2025-06-18": 100 }, 500)).toEqual({});
  });

  it("delta <= 0 → no-op", () => {
    expect(subtractWaterMl({ "2025-06-18": 250 }, 0)).toEqual({
      "2025-06-18": 250,
    });
    expect(subtractWaterMl({ "2025-06-18": 250 }, -50)).toEqual({
      "2025-06-18": 250,
    });
  });

  it("today відсутній + delta > 0 → на сьогодні немає що віднімати, ключ не зʼявляється", () => {
    // base[today] || 0 = 0; next = -delta < 0 → видаляємо, але today нема в base.
    expect(subtractWaterMl({ "2025-06-17": 100 }, 200)).toEqual({
      "2025-06-17": 100,
    });
  });
});

describe("resetTodayWater", () => {
  it("видаляє today, лишає інші дні", () => {
    expect(
      resetTodayWater({
        "2025-06-18": 999,
        "2025-06-17": 1000,
        "2025-06-16": 800,
      }),
    ).toEqual({ "2025-06-17": 1000, "2025-06-16": 800 });
  });

  it("today відсутній → log без змін (нормалізований)", () => {
    expect(resetTodayWater({ "2025-06-17": 100, "bad-key": 50 })).toEqual({
      "2025-06-17": 100,
    });
  });

  it("повертає {} для null/undefined/garbage", () => {
    expect(resetTodayWater(null)).toEqual({});
    expect(resetTodayWater(undefined)).toEqual({});
    expect(resetTodayWater("garbage")).toEqual({});
  });
});

describe("день пристрою, не Kyiv (ADR-0078)", () => {
  // Це середовище (CI/local) працює в TZ=UTC, тож "пристрій" тут = UTC.
  // 22:00Z 18 червня — ще "сьогодні" (06-18) за пристроєм, але вже "завтра"
  // (06-19) за Kyiv (UTC+3 влітку). Якби `getTodayWaterMl`/`addWaterMl`
  // досі форсували Kyiv, цей запис лягав би під 06-19.
  it("зараховує воду під день пристрою, коли Kyiv уже перейшов на завтра", () => {
    vi.setSystemTime(new Date(Date.UTC(2025, 5, 18, 22, 0, 0)));
    expect(addWaterMl({}, 250)).toEqual({ "2025-06-18": 250 });
    expect(getTodayWaterMl({ "2025-06-18": 250, "2025-06-19": 9999 })).toBe(
      250,
    );
  });
});
