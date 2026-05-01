import { describe, expect, it } from "vitest";

import {
  QUICK_STATS_MODULE_IDS,
  parseQuickStatsJson,
  selectModulePreview,
} from "./quickStats";

describe("QUICK_STATS_MODULE_IDS", () => {
  it("exposes the four Hub modules in the canonical order", () => {
    expect([...QUICK_STATS_MODULE_IDS]).toEqual([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
  });
});

describe("parseQuickStatsJson", () => {
  it("returns null for null / undefined / empty input", () => {
    expect(parseQuickStatsJson(null)).toBeNull();
    expect(parseQuickStatsJson(undefined)).toBeNull();
    expect(parseQuickStatsJson("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseQuickStatsJson("{not json")).toBeNull();
    expect(parseQuickStatsJson("null")).toBeNull();
  });

  it("returns null for non-object JSON (arrays, primitives)", () => {
    expect(parseQuickStatsJson("[1,2]")).toBeNull();
    expect(parseQuickStatsJson("42")).toBeNull();
    expect(parseQuickStatsJson('"hello"')).toBeNull();
  });

  it("returns the parsed object for valid JSON objects", () => {
    expect(parseQuickStatsJson('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("selectModulePreview — finyk", () => {
  it("formats todaySpent and budgetLeft via the centralized money formatter", () => {
    const raw = JSON.stringify({ todaySpent: 1250, budgetLeft: 7300 });
    const preview = selectModulePreview("finyk", raw);
    // `formatMoney` emits "<number> ₴" — we assert the suffix and digits
    // separately so the test stays robust against whichever NBSP-flavoured
    // thousand separator the active Intl runtime picks for `uk-UA`.
    expect(preview.main).toMatch(/₴$/);
    expect(preview.main).toContain("1");
    expect(preview.main).toContain("250");
    expect(preview.sub).toMatch(/Залишок:/);
    expect(preview.sub).toMatch(/₴$/);
    expect(preview.sub).toContain("7");
    expect(preview.sub).toContain("300");
    expect(preview.progress).toBeUndefined();
  });

  it("renders zeros as null (parity with web truthiness)", () => {
    const raw = JSON.stringify({ todaySpent: 0, budgetLeft: 0 });
    expect(selectModulePreview("finyk", raw)).toEqual({
      main: null,
      sub: null,
    });
  });

  it("coerces non-number values to null", () => {
    const raw = JSON.stringify({ todaySpent: "200", budgetLeft: null });
    expect(selectModulePreview("finyk", raw)).toEqual({
      main: null,
      sub: null,
    });
  });

  it("falls back to empty preview on malformed JSON", () => {
    expect(selectModulePreview("finyk", "{broken")).toEqual({
      main: null,
      sub: null,
    });
    expect(selectModulePreview("finyk", null)).toEqual({
      main: null,
      sub: null,
    });
  });
});

describe("selectModulePreview — fizruk", () => {
  it("formats weekWorkouts + streak", () => {
    const raw = JSON.stringify({ weekWorkouts: 3, streak: 5 });
    expect(selectModulePreview("fizruk", raw)).toEqual({
      main: "3 трен.",
      sub: "Серія: 5 днів",
    });
  });

  it("renders zeros as null", () => {
    const raw = JSON.stringify({ weekWorkouts: 0, streak: 0 });
    expect(selectModulePreview("fizruk", raw)).toEqual({
      main: null,
      sub: null,
    });
  });

  it("falls back to empty preview on missing data", () => {
    expect(selectModulePreview("fizruk", null)).toEqual({
      main: null,
      sub: null,
    });
  });
});

describe("selectModulePreview — routine", () => {
  it("renders todayDone/todayTotal + streak and computes progress", () => {
    const raw = JSON.stringify({ todayDone: 3, todayTotal: 6, streak: 4 });
    expect(selectModulePreview("routine", raw)).toEqual({
      main: "3/6",
      sub: "Серія: 4 днів",
      progress: 50,
    });
  });

  it("renders 0/N as '0/N' and progress 0 (todayDone = 0 is valid)", () => {
    const raw = JSON.stringify({ todayDone: 0, todayTotal: 4 });
    expect(selectModulePreview("routine", raw)).toEqual({
      main: "0/4",
      sub: null,
      progress: 0,
    });
  });

  it("drops main when todayTotal is missing", () => {
    const raw = JSON.stringify({ todayDone: 3 });
    expect(selectModulePreview("routine", raw)).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
  });

  it("emits progress: 0 shape when storage is empty / malformed", () => {
    expect(selectModulePreview("routine", null)).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
    expect(selectModulePreview("routine", "{not json")).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
  });
});

describe("selectModulePreview — nutrition", () => {
  it("formats todayCal + calGoal and computes progress", () => {
    const raw = JSON.stringify({ todayCal: 1500, calGoal: 2000 });
    expect(selectModulePreview("nutrition", raw)).toEqual({
      main: "1500 ккал",
      sub: "Ціль: 2000 ккал",
      progress: 75,
    });
  });

  it("drops main/sub when their numbers are 0", () => {
    const raw = JSON.stringify({ todayCal: 0, calGoal: 0 });
    expect(selectModulePreview("nutrition", raw)).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
  });

  it("emits progress: 0 shape when storage is empty / malformed", () => {
    expect(selectModulePreview("nutrition", null)).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
    expect(selectModulePreview("nutrition", "[]")).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
  });
});
