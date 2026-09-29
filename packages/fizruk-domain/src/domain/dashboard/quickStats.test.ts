import { describe, it, expect } from "vitest";
import { computeFizrukQuickStats } from "./quickStats.js";

// Повноцінне завершене тренування (45 хв по годиннику). `weekWorkouts`
// читає лише `endedAt`; стрік із 2026-09-15 — ще й вагу запису (канон §8),
// тож нульова тривалість тут читалась би як «легке» і серію б не рухала.
const done = (id: string, endedAt: string) => ({
  id,
  startedAt: new Date(Date.parse(endedAt) - 45 * 60_000).toISOString(),
  endedAt,
  items: [],
});

describe("computeFizrukQuickStats", () => {
  it("counts this-week workouts on the Kyiv Monday boundary, not UTC", () => {
    // now: Thu 2026-07-23 12:00 Kyiv. Week starts Mon 2026-07-20 00:00 Kyiv
    // = 2026-07-19T21:00:00Z (Kyiv is UTC+3 in July).
    const now = new Date("2026-07-23T09:00:00Z");
    const { weekWorkouts } = computeFizrukQuickStats(
      [
        done("mon-morning", "2026-07-20T05:00:00Z"), // Kyiv Mon 08:00 → in week
        done("mon-just-after-midnight", "2026-07-19T21:30:00Z"), // Kyiv Mon 00:30 → in week
        done("sun-late", "2026-07-19T20:00:00Z"), // Kyiv Sun 23:00 → prev week
      ],
      now,
    );
    // The 20:00Z tx is still Sunday in Kyiv and excluded; the 21:30Z tx has
    // already crossed into the Kyiv Monday and counts — a UTC-anchored week
    // would get this backwards.
    expect(weekWorkouts).toBe(2);
  });

  it("рахує ТИЖНЕВИЙ стрік, а не щоденний (канон §7)", () => {
    // Четвер 2026-07-23; три тренування цього тижня — поріг (2) узято, тож
    // серія = 1 тиждень. Стара щоденна логіка віддавала б 3 і рвалась би на
    // першому ж дні відпочинку.
    const now = new Date("2026-07-23T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const { streak } = computeFizrukQuickStats(
      [
        done("today", now.toISOString()),
        done("yesterday", new Date(now.getTime() - day).toISOString()),
        done("two-days-ago", new Date(now.getTime() - 2 * day).toISOString()),
      ],
      now,
    );
    expect(streak).toBe(1);
  });

  it("день відпочинку тижневу серію не рве", () => {
    // Пʼятниця 2026-07-24, тренування були в понеділок і вівторок.
    const now = new Date("2026-07-24T12:00:00Z");
    const { streak } = computeFizrukQuickStats(
      [
        done("mon", "2026-07-20T09:00:00Z"),
        done("tue", "2026-07-21T09:00:00Z"),
      ],
      now,
    );
    expect(streak).toBe(1);
  });

  it("легкий запис входить у тижневий лічильник, але не в серію", () => {
    // Четвер 2026-07-23. Два повноцінні + один «+20 відтискань».
    // `weekWorkouts` — факт («що робив»), стрік — режим («чи тренувався»).
    const now = new Date("2026-07-23T09:00:00Z");
    const light = {
      id: "pushups",
      startedAt: "2026-07-22T17:59:30Z",
      endedAt: "2026-07-22T18:00:00Z",
      items: [{ type: "strength", sets: [{ weightKg: 0, reps: 20 }] }],
    };
    const { weekWorkouts, streak } = computeFizrukQuickStats(
      [
        done("mon", "2026-07-20T09:00:00Z"),
        done("tue", "2026-07-21T09:00:00Z"),
        light,
      ],
      now,
    );
    expect(weekWorkouts).toBe(3);
    expect(streak).toBe(1);
    // Без повноцінних — лічильник є, серії немає.
    expect(computeFizrukQuickStats([light], now)).toEqual({
      weekWorkouts: 1,
      streak: 0,
    });
  });

  it("returns zeroes for an empty stream", () => {
    expect(
      computeFizrukQuickStats([], new Date("2026-07-23T09:00:00Z")),
    ).toEqual({ weekWorkouts: 0, streak: 0 });
  });
});
