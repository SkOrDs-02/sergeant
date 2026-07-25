/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  claimStreakShownOnce,
  markStreakSeen,
  readStreakExposure,
  resetStreakExposure,
} from "./streakExposure";

const KEY = "sergeant.v2.routine.streakExposure";

beforeEach(() => {
  resetStreakExposure();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  resetStreakExposure();
});

describe("streakExposure", () => {
  it("без показу стріку експозиції немає", () => {
    expect(readStreakExposure()).toEqual({
      saw_streak_surface: null,
      streak_days_at_checkin: null,
      ms_since_streak_shown: null,
    });
  });

  it("після показу віддає поверхню, дні і сирий інтервал", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
    markStreakSeen({ surface: "hero_flame", streakDays: 12 });

    vi.setSystemTime(new Date("2026-07-25T10:00:30.000Z"));
    expect(readStreakExposure()).toEqual({
      saw_streak_surface: "hero_flame",
      streak_days_at_checkin: 12,
      ms_since_streak_shown: 30_000,
    });
  });

  it("читання НЕ очищає стан — кілька чекінів після одного показу", () => {
    markStreakSeen({ surface: "hero_flame", streakDays: 3 });
    expect(readStreakExposure().saw_streak_surface).toBe("hero_flame");
    expect(readStreakExposure().saw_streak_surface).toBe("hero_flame");
  });

  it("claimStreakShownOnce дедуплікує показ у межах дня і поверхні", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
    expect(claimStreakShownOnce("hero_flame")).toBe(true);
    expect(claimStreakShownOnce("hero_flame")).toBe(false);
    expect(claimStreakShownOnce("hero_flame")).toBe(false);
    // Інша поверхня — власний лічильник.
    expect(claimStreakShownOnce("hub_badge")).toBe(true);
  });

  it("claimStreakShownOnce знову дозволяє показ наступного дня пристрою", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
    expect(claimStreakShownOnce("hero_flame")).toBe(true);
    expect(claimStreakShownOnce("hero_flame")).toBe(false);

    vi.setSystemTime(new Date("2026-07-26T10:00:00.000Z"));
    expect(claimStreakShownOnce("hero_flame")).toBe(true);
  });

  it("показ з попереднього дня пристрою не атрибутується (ADR-0078)", () => {
    vi.useFakeTimers();
    // 23:59 локального дня — і чекін через дві хвилини, уже наступного дня.
    vi.setSystemTime(new Date(2026, 6, 25, 23, 59, 0));
    markStreakSeen({ surface: "hero_flame", streakDays: 9 });

    vi.setSystemTime(new Date(2026, 6, 26, 0, 1, 0));
    expect(readStreakExposure()).toEqual({
      saw_streak_surface: null,
      streak_days_at_checkin: null,
      ms_since_streak_shown: null,
    });
  });

  it("останній показ витісняє попередній", () => {
    markStreakSeen({ surface: "hero_flame", streakDays: 4 });
    markStreakSeen({ surface: "hero_flame", streakDays: 5 });
    expect(readStreakExposure().streak_days_at_checkin).toBe(5);
  });

  it("дзеркалить у sessionStorage і відновлюється після reload-у вкладки", () => {
    markStreakSeen({ surface: "hero_flame", streakDays: 7 });
    const mirrored = sessionStorage.getItem(KEY);
    expect(mirrored).toContain("hero_flame");

    // Імітація reload-у: in-memory стор порожній, дзеркало лишилось.
    resetStreakExposure();
    sessionStorage.setItem(KEY, mirrored!);

    expect(readStreakExposure()).toMatchObject({
      saw_streak_surface: "hero_flame",
      streak_days_at_checkin: 7,
    });
  });

  it("зіпсоване дзеркало не кидає і не атрибутує", () => {
    sessionStorage.setItem(KEY, "{ not json");
    expect(readStreakExposure().saw_streak_surface).toBe(null);
    sessionStorage.setItem(KEY, JSON.stringify({ surface: "nope", at: "x" }));
    expect(readStreakExposure().saw_streak_surface).toBe(null);
  });

  it("зсув годинника назад не дає відʼємний ms_since_streak_shown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 10, 0, 0));
    markStreakSeen({ surface: "hero_flame", streakDays: 2 });

    vi.setSystemTime(new Date(2026, 6, 25, 9, 59, 0));
    expect(readStreakExposure().ms_since_streak_shown).toBe(null);
  });

  it("нечислові дні ігноруються", () => {
    markStreakSeen({
      surface: "hero_flame",
      streakDays: Number.NaN,
    });
    expect(readStreakExposure().saw_streak_surface).toBe(null);
  });
});
