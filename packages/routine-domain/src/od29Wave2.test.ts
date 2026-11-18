/**
 * OD-29 друга хвиля (2026-11-18): канонічний відсоток (Р-3 (а)), звички для
 * «Зараз» (Р-2 (а)), ядро лічильника (Р-1 (а)), правила автовідмітки
 * (Р-1 (в)). Спека: `docs/work/specs/routine-counter-automark-percent-and-hub-rows.md`.
 */
import { describe, expect, it } from "vitest";

import { applyAutoMarkHabit, shouldSuppressAutoMark } from "./autoMark.js";
import { bestRoutineMonth, routineMonthCompletions } from "./bestMonth.js";
import {
  applyHabitCounterStep,
  counterProgressLabel,
  counterReached,
} from "./counterHabit.js";
import { flexibleStreakBreakdown } from "./flexStreak.js";
import { HABITS_FOR_NOW_LIMIT, selectHabitsForNow } from "./habitsForNow.js";
import { completionRateForRange, habitCompletionRate } from "./streaks.js";
import type { Habit, HabitSkip, RoutineState } from "./types.js";

function habit(id: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...over,
  };
}

function skip(): HabitSkip {
  return { reason: "sick", at: "2026-01-08T10:00:00.000Z" };
}

function state(over: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    skips: {},
    habitOrder: [],
    completionNotes: {},
    ...over,
  };
}

describe("Р-3 (а): «не зміг» поза знаменником усюди (П-18 (А))", () => {
  it("habitCompletionRate виключає «не зміг» так само, як completionRateForRange", () => {
    const h = habit("a");
    const done = ["2026-01-05", "2026-01-06"];
    const skips = { "2026-01-07": skip() };
    const perHabit = habitCompletionRate(h, done, "2026-01-05", "2026-01-08", {
      skips,
    });
    const total = completionRateForRange(
      [h],
      { a: done },
      "2026-01-05",
      "2026-01-08",
      { skips: { a: skips } },
    );
    expect(perHabit).toEqual({ completed: 2, scheduled: 3, rate: 2 / 3 });
    expect(perHabit).toEqual(total);
  });

  it("без skips поведінка habitCompletionRate не змінюється (пропуск = провал)", () => {
    const r = habitCompletionRate(
      habit("a"),
      ["2026-01-05"],
      "2026-01-05",
      "2026-01-06",
    );
    expect(r.scheduled).toBe(2);
  });

  it("найпослідовніший місяць: поточний місяць рахується лише до сьогодні", () => {
    const h = habit("a", { startDate: "2025-12-01" });
    // Грудень: 20 з 31. Січень: 10 з 10 днів до сьогодні (10-го).
    const dec = Array.from(
      { length: 20 },
      (_, i) => `2025-12-${String(i + 1).padStart(2, "0")}`,
    );
    const jan = Array.from(
      { length: 10 },
      (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
    );
    const best = bestRoutineMonth(
      [h],
      { a: [...dec, ...jan] },
      { todayKey: "2026-01-10" },
    );
    expect(best).toEqual({
      monthKey: "2026-01",
      completed: 10,
      scheduled: 10,
      pct: 100,
    });
  });

  it("найпослідовніший місяць: «не зміг» поза знаменником, порожній вхід — null", () => {
    const h = habit("a", { startDate: "2026-01-01" });
    const months = routineMonthCompletions(
      [h],
      { a: ["2026-01-01", "2026-01-02"] },
      {
        todayKey: "2026-01-03",
        skips: { a: { "2026-01-03": skip() } },
      },
    );
    expect(months).toEqual([
      { monthKey: "2026-01", completed: 2, scheduled: 2, pct: 100 },
    ]);
    expect(bestRoutineMonth([h], {}, { todayKey: "2026-01-03" })).toBeNull();
  });
});

describe("Р-2 (а): звички для «Зараз» (П-15 (А))", () => {
  const today = "2026-01-10";

  it("перші дві відкриті у порядку списку дня і «ще N»", () => {
    const s = state({
      habits: [
        habit("evening", { timeOfDay: "20:00" }),
        habit("anytime"),
        habit("morning", { timeOfDay: "07:30" }),
        habit("day", { timeOfDay: "13:00" }),
        habit("doneToday", { timeOfDay: "06:00" }),
        habit("skippedToday", { timeOfDay: "06:00" }),
      ],
      habitOrder: [
        "evening",
        "anytime",
        "morning",
        "day",
        "doneToday",
        "skippedToday",
      ],
      completions: { doneToday: [today] },
      skips: { skippedToday: { [today]: skip() } },
    });
    const r = selectHabitsForNow(s, today);
    expect(HABITS_FOR_NOW_LIMIT).toBe(2);
    expect(r.items.map((i) => i.habitId)).toEqual(["morning", "day"]);
    expect(r.moreCount).toBe(2);
    expect(r.totalOpen).toBe(4);
  });

  it("ручний порядок усередині секції, паузи й архів поза списком", () => {
    const s = state({
      habits: [
        habit("b"),
        habit("a"),
        habit("paused", { paused: true }),
        habit("archived", { archived: true }),
        habit("interval", { pauseIntervals: [{ from: today, to: null }] }),
      ],
      habitOrder: ["b", "a", "paused", "archived", "interval"],
    });
    const r = selectHabitsForNow(s, today);
    expect(r.items.map((i) => i.habitId)).toEqual(["b", "a"]);
    expect(r.moreCount).toBe(0);
  });

  it("гнучка звичка з добраною тижневою ціллю не відкрита", () => {
    // Пн 2026-01-05 … сб 2026-01-10; ціль 2 на тиждень, уже 2 відмітки.
    const s = state({
      habits: [
        habit("flex", {
          recurrence: "flexible",
          weeklyTargetHistory: [{ from: "2026-01-01", target: 2 }],
        }),
      ],
      completions: { flex: ["2026-01-05", "2026-01-06"] },
    });
    expect(selectHabitsForNow(s, today).totalOpen).toBe(0);
  });

  it("порожній стан: нічого не заплановано", () => {
    expect(selectHabitsForNow(state(), today)).toEqual({
      items: [],
      moreCount: 0,
      totalOpen: 0,
    });
  });
});

describe("Р-1 (а): лічильник (П-12 (А), «4 з 3»)", () => {
  const bounds = { todayKey: "2026-01-10" };
  const spec = { target: 3, unit: "склянок" };

  it("частковий день не виконано, ціль ставить відмітку, далі рахує «4 з 3»", () => {
    let s = state({ habits: [habit("w")] });
    let counts = {};
    let r = applyHabitCounterStep(
      s,
      counts,
      "w",
      "2026-01-10",
      1,
      spec,
      bounds,
    );
    r = applyHabitCounterStep(
      r.state,
      r.counts,
      "w",
      "2026-01-10",
      1,
      spec,
      bounds,
    );
    expect(r.count).toBe(2);
    expect(r.done).toBe(false);
    expect(r.state.completions["w"] ?? []).toEqual([]);
    expect(counterProgressLabel(r.count, spec.target)).toBe("2 з 3");

    r = applyHabitCounterStep(
      r.state,
      r.counts,
      "w",
      "2026-01-10",
      1,
      spec,
      bounds,
    );
    expect(r.done).toBe(true);
    expect(r.state.completions["w"]).toEqual(["2026-01-10"]);

    r = applyHabitCounterStep(
      r.state,
      r.counts,
      "w",
      "2026-01-10",
      1,
      spec,
      bounds,
    );
    expect(r.count).toBe(4);
    expect(r.done).toBe(true);
    expect(counterProgressLabel(r.count, spec.target)).toBe("4 з 3");

    // «Скасувати» двічі: 4 → 3 (лишається виконано) → 2 (відмітка знята).
    s = r.state;
    counts = r.counts;
    r = applyHabitCounterStep(s, counts, "w", "2026-01-10", -1, spec, bounds);
    expect(r.done).toBe(true);
    r = applyHabitCounterStep(
      r.state,
      r.counts,
      "w",
      "2026-01-10",
      -1,
      spec,
      bounds,
    );
    expect(r.count).toBe(2);
    expect(r.done).toBe(false);
    expect(r.state.completions["w"]).toEqual([]);
  });

  it("частковий день серія читає як мовчазний пропуск і бере заморозку", () => {
    const h = habit("w", { startDate: "2026-01-05" });
    // 05..08 виконано, 09 частково (2 з 3 → відмітки немає), 10 виконано.
    const s = state({
      habits: [h],
      completions: {
        w: ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"],
      },
    });
    let r = applyHabitCounterStep(s, {}, "w", "2026-01-09", 2, spec, {
      todayKey: "2026-01-09",
    });
    expect(r.done).toBe(false);
    r = applyHabitCounterStep(
      r.state,
      r.counts,
      "w",
      "2026-01-10",
      3,
      spec,
      bounds,
    );
    const streak = flexibleStreakBreakdown(
      h,
      r.state.completions["w"],
      "2026-01-10",
    );
    expect(streak.days).toBe(5);
    expect(streak.graceUsed).toBe(1);
  });

  it("майбутній день і день поза розкладом — no-op", () => {
    const s = state({ habits: [habit("w", { recurrence: "weekdays" })] });
    const future = applyHabitCounterStep(
      s,
      {},
      "w",
      "2026-01-11",
      1,
      spec,
      bounds,
    );
    expect(future.state).toBe(s);
    expect(future.count).toBe(0);
    // 2026-01-10 — субота, будні звичці не запланована.
    const off = applyHabitCounterStep(
      s,
      {},
      "w",
      "2026-01-10",
      1,
      spec,
      bounds,
    );
    expect(off.state).toBe(s);
    expect(off.counts).toEqual({});
    expect(counterReached(5, 0)).toBe(false);
  });
});

describe("Р-1 (в): автовідмітка (П-13 (А), П-14 (А))", () => {
  const todayKey = "2026-01-10";
  const base = state({ habits: [habit("gym")] });

  it("лише за сьогодні: подія з учорашнім ключем нічого не ставить", () => {
    const ctx = { todayKey, suppressedToday: false };
    expect(applyAutoMarkHabit(base, "gym", "2026-01-09", ctx)).toBe(base);
    const next = applyAutoMarkHabit(base, "gym", todayKey, ctx);
    expect(next.completions["gym"]).toEqual([todayKey]);
  });

  it("знята сьогодні відмітка глушить автовідмітку до кінця доби", () => {
    const marked = applyAutoMarkHabit(base, "gym", todayKey, {
      todayKey,
      suppressedToday: false,
    });
    const unmarked = state({ ...marked, completions: { gym: [] } });
    expect(
      shouldSuppressAutoMark(marked, unmarked, "gym", todayKey, todayKey),
    ).toBe(true);
    expect(
      applyAutoMarkHabit(unmarked, "gym", todayKey, {
        todayKey,
        suppressedToday: true,
      }),
    ).toBe(unmarked);
    // Зняття вчорашньої відмітки сьогоднішню автовідмітку не глушить.
    expect(
      shouldSuppressAutoMark(marked, unmarked, "gym", "2026-01-09", todayKey),
    ).toBe(false);
  });

  it("заявлений сьогодні «не зміг» автовідмітка не перекриває", () => {
    const skipped = state({
      habits: [habit("gym")],
      skips: { gym: { [todayKey]: skip() } },
    });
    expect(
      applyAutoMarkHabit(skipped, "gym", todayKey, {
        todayKey,
        suppressedToday: false,
      }),
    ).toBe(skipped);
  });
});
