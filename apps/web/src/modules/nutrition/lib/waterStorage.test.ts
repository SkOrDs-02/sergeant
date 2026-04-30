import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WATER_LOG_KEY,
  addWaterMl,
  getTodayWaterMl,
  loadWaterLog,
  normalizeWaterLog,
  resetTodayWater,
  saveWaterLog,
} from "./waterStorage";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string): void =>
      void store.set(String(k), String(v)),
    removeItem: (k: string): void => void store.delete(String(k)),
    clear: (): void => void store.clear(),
    _dump: (): Record<string, string> => Object.fromEntries(store.entries()),
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock() as unknown as Storage;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeWaterLog", () => {
  it("returns empty object for non-object / array / null", () => {
    expect(normalizeWaterLog(null)).toEqual({});
    expect(normalizeWaterLog(undefined)).toEqual({});
    expect(normalizeWaterLog("oops")).toEqual({});
    expect(normalizeWaterLog([1, 2, 3])).toEqual({});
  });

  it("drops non-ISO date keys", () => {
    const out = normalizeWaterLog({
      "2026-04-18": 500,
      foo: 100,
      "not-a-date": 200,
      "2026/04/18": 300,
    });
    expect(out).toEqual({ "2026-04-18": 500 });
  });

  it("drops non-numeric, zero and negative values", () => {
    const out = normalizeWaterLog({
      "2026-04-18": "abc",
      "2026-04-19": -100,
      "2026-04-20": 0,
      "2026-04-21": 250,
      "2026-04-22": null,
    });
    expect(out).toEqual({ "2026-04-21": 250 });
  });

  it("coerces numeric strings to integers", () => {
    expect(normalizeWaterLog({ "2026-04-18": "500" })).toEqual({
      "2026-04-18": 500,
    });
    expect(normalizeWaterLog({ "2026-04-18": 123.9 })).toEqual({
      "2026-04-18": 123,
    });
  });
});

describe("loadWaterLog", () => {
  it("returns empty object when storage is empty", () => {
    expect(loadWaterLog()).toEqual({});
  });

  it("returns empty object when storage is corrupted JSON", () => {
    globalThis.localStorage.setItem(WATER_LOG_KEY, "{not json");
    expect(loadWaterLog()).toEqual({});
  });

  it("normalizes stored log on read", () => {
    globalThis.localStorage.setItem(
      WATER_LOG_KEY,
      JSON.stringify({
        "2026-04-18": 500,
        "2026-04-19": "bad",
        random: 999,
      }),
    );
    expect(loadWaterLog()).toEqual({ "2026-04-18": 500 });
  });

  it("returns empty object when stored value is not an object", () => {
    globalThis.localStorage.setItem(WATER_LOG_KEY, JSON.stringify("hi"));
    expect(loadWaterLog()).toEqual({});
  });
});

describe("saveWaterLog", () => {
  it("persists normalized log and strips bad entries", () => {
    saveWaterLog({ "2026-04-18": 500, bogus: "x" });
    const stored = JSON.parse(globalThis.localStorage.getItem(WATER_LOG_KEY)!);
    expect(stored).toEqual({ "2026-04-18": 500 });
  });

  it("persists empty object for nullish input", () => {
    saveWaterLog(null);
    const stored = JSON.parse(globalThis.localStorage.getItem(WATER_LOG_KEY)!);
    expect(stored).toEqual({});
  });
});

describe("getTodayWaterMl", () => {
  it("returns 0 when log is empty / corrupted", () => {
    expect(getTodayWaterMl({})).toBe(0);
    expect(getTodayWaterMl(null)).toBe(0);
    expect(getTodayWaterMl(undefined)).toBe(0);
  });

  it("returns 0 when today's value is non-numeric", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    expect(getTodayWaterMl({ "2026-04-18": "abc" })).toBe(0);
  });

  it("returns today's water and ignores yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    expect(getTodayWaterMl({ "2026-04-17": 9999, "2026-04-18": 500 })).toBe(
      500,
    );
  });
});

describe("addWaterMl — day change", () => {
  it("ignores non-positive / non-numeric deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    expect(addWaterMl({}, 0)).toEqual({});
    expect(addWaterMl({}, -100)).toEqual({});
    expect(addWaterMl({}, "abc")).toEqual({});
    expect(addWaterMl({}, null)).toEqual({});
  });

  it("accumulates within the same day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    const a = addWaterMl({}, 250);
    const b = addWaterMl(a, 300);
    expect(b).toEqual({ "2026-04-18": 550 });
  });

  it("starts fresh at 0 when the day changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T23:55:00"));
    const prev = addWaterMl({}, 500);
    expect(getTodayWaterMl(prev)).toBe(500);

    vi.setSystemTime(new Date("2026-04-19T00:05:00"));
    expect(getTodayWaterMl(prev)).toBe(0);

    const next = addWaterMl(prev, 200);
    expect(next["2026-04-18"]).toBe(500);
    expect(next["2026-04-19"]).toBe(200);
    expect(getTodayWaterMl(next)).toBe(200);
  });

  it("drops corrupted entries from the log while adding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    const next = addWaterMl({ "2026-04-17": "bad", bogus: 1 }, 100);
    expect(next).toEqual({ "2026-04-18": 100 });
  });
});

describe("resetTodayWater", () => {
  it("clears only today's entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    const log = { "2026-04-17": 800, "2026-04-18": 500 };
    expect(resetTodayWater(log)).toEqual({ "2026-04-17": 800 });
  });

  it("is safe on corrupted log", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00"));
    expect(resetTodayWater(null)).toEqual({});
    expect(resetTodayWater({ bogus: 1, "2026-04-18": 300 })).toEqual({});
  });
});
