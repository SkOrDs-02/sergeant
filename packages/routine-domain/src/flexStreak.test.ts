import { describe, expect, it } from "vitest";

import {
  GRACE_EARN_EVERY_DAYS,
  MAX_GRACE_BUDGET,
  flexibleMaxActiveStreak,
  flexibleMaxStreakAllTime,
  flexibleMaxStreakAllTimeAcrossHabits,
  flexibleStreakBreakdown,
  flexibleStreakForHabit,
} from "./flexStreak.js";
import { streakForHabit } from "./streaks.js";
import type { Habit, HabitSkip } from "./types.js";

const TODAY = "2026-08-02";

function daily(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Зарядка",
    recurrence: "daily",
    startDate: "2026-01-01",
    ...overrides,
  };
}

/** Ключі за N днів поспіль, що закінчуються на `endKey` включно. */
function runOfDays(endKey: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${endKey}T12:00:00`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out.sort();
}

function skip(reason: HabitSkip["reason"] = "sick"): HabitSkip {
  return { reason, at: "2026-08-02T09:00:00.000Z" };
}

describe("flexibleStreakBreakdown — базові стани", () => {
  it("рахує суцільну серію так само, як жорсткий стрік", () => {
    const done = runOfDays(TODAY, 5);
    expect(flexibleStreakForHabit(daily(), done, TODAY)).toBe(5);
    expect(streakForHabit(daily(), done, TODAY)).toBe(5);
  });

  it("сьогодні без відмітки — це очікування, а не обрив", () => {
    // Жорсткий стрік тут віддає 0: щоранку до першої відмітки користувач
    // бачив «серія обірвалась». Це і є головна щоденна брехня старої моделі.
    const done = runOfDays("2026-08-01", 10);
    expect(streakForHabit(daily(), done, TODAY)).toBe(0);

    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(10);
    expect(b.todayPending).toBe(true);
  });

  it("порожня історія — нуль, але сьогодні все ще в очікуванні", () => {
    const b = flexibleStreakBreakdown(daily(), [], TODAY);
    expect(b.days).toBe(0);
    expect(b.todayPending).toBe(true);
  });
});

describe("планована пауза — дні не рахуються (канон §4)", () => {
  it("пауза не ламає серію і не подовжує її", () => {
    // 10 днів до відпустки, 5 днів відпустки, 3 дні після.
    const before = runOfDays("2026-07-20", 10);
    const after = runOfDays(TODAY, 3);
    const habit = daily({
      startDate: "2026-07-11",
      pauseIntervals: [{ from: "2026-07-21", to: "2026-07-30" }],
    });
    const b = flexibleStreakBreakdown(habit, [...before, ...after], TODAY);

    expect(b.days).toBe(13);
    expect(b.pauseDays).toBe(10);
    expect(b.graceUsed).toBe(0);
    expect(b.brokenOn).toBeNull();
  });

  it("жорсткий стрік на тому ж наборі ламається об перший день паузи", () => {
    const before = runOfDays("2026-07-20", 10);
    const after = runOfDays(TODAY, 3);
    // Без інтервалів (як було до цієї зміни) — дні відпустки читаються
    // як пропуски, і 13-денна серія стискається до 3.
    expect(streakForHabit(daily(), [...before, ...after], TODAY)).toBe(3);
  });

  it("пауза без дати кінця діє від `from` і далі", () => {
    const done = runOfDays("2026-07-25", 6);
    const habit = daily({
      pauseIntervals: [{ from: "2026-07-26", to: null }],
    });
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    // Кожен день від 2026-07-26 і донині — під паузою, тож сьогодні нічого
    // не очікується, а серія лишається на тому, що встигло накопичитись.
    expect(b.todayPending).toBe(false);
    expect(b.days).toBe(6);
  });
});

describe("пропуск із причиною — нейтральний (канон §5)", () => {
  it("не ламає серію і не подовжує її", () => {
    const done = [...runOfDays("2026-07-30", 8), ...runOfDays(TODAY, 2)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY, {
      skipsForHabit: { "2026-07-31": skip("sick") },
    });
    expect(b.days).toBe(10);
    expect(b.skipDays).toBe(1);
    expect(b.graceUsed).toBe(0);
  });

  it("не витрачає grace-бюджет", () => {
    const done = runOfDays("2026-07-25", 3);
    const skips: Record<string, HabitSkip> = {};
    for (const k of runOfDays(TODAY, 8)) skips[k] = skip("travel");
    const b = flexibleStreakBreakdown(daily(), done, TODAY, {
      skipsForHabit: skips,
    });
    // Вісім пропусків поспіль із причиною — серія жива, бюджет не витрачений.
    expect(b.days).toBe(3);
    expect(b.skipDays).toBe(8);
    expect(b.graceUsed).toBe(0);
  });

  it("два мовчазні пропуски поспіль серію ламають", () => {
    const done = [...runOfDays("2026-07-28", 20), ...runOfDays(TODAY, 1)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    // 2026-08-01 і 2026-07-31 порожні й без причини — це зупинка.
    expect(b.days).toBe(1);
    expect(b.brokenOn).toBe("2026-08-01");
  });
});

describe("grace-бюджет", () => {
  it("серія коротша за 7 днів заморозок не має", () => {
    // 5 виконаних, потім один мовчазний пропуск — бюджет ще не зароблено.
    const done = [...runOfDays("2026-07-31", 5), ...runOfDays(TODAY, 1)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(1);
    expect(b.graceUsed).toBe(0);
    expect(b.brokenOn).toBe("2026-08-01");
  });

  it("одна заморозка за кожні 7 виконаних днів", () => {
    // 10 виконаних до пропуску + 2 після = 12 днів оплачують 1 заморозку.
    const done = [...runOfDays("2026-07-30", 10), ...runOfDays(TODAY, 2)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(12);
    expect(b.graceUsed).toBe(1);
    expect(b.graceRemaining).toBe(0);
    expect(GRACE_EARN_EVERY_DAYS).toBe(7);
  });

  it("другий пропуск не по кишені — серія ріжеться на найдавнішому", () => {
    // Історія 2026-07-20…2026-08-02 (14 днів) із двома мовчазними
    // пропусками — 07-24 і 07-30. Разом це 12 виконаних днів, тобто
    // бюджету рівно на ОДНУ заморозку, а пропусків два.
    const habit = daily({ startDate: "2026-07-20" });
    const done = runOfDays(TODAY, 14).filter(
      (k) => k !== "2026-07-24" && k !== "2026-07-30",
    );
    const b = flexibleStreakBreakdown(habit, done, TODAY);

    // Ітерація ріже серію на найдавнішому пропуску: свіжіший (07-30)
    // лишається прощеним, бо його оплачують 8 днів після нього.
    expect(b.brokenOn).toBe("2026-07-24");
    expect(b.days).toBe(8);
    expect(b.graceUsed).toBe(1);
    expect(b.graceRemaining).toBe(0);
  });

  it("стеля бюджету не дає нескінченно довгій серії прощати все", () => {
    expect(MAX_GRACE_BUDGET).toBe(4);
    const b = flexibleStreakBreakdown(daily(), runOfDays(TODAY, 400), TODAY, {
      maxGraceBudget: MAX_GRACE_BUDGET,
    });
    expect(b.graceRemaining).toBe(MAX_GRACE_BUDGET);
  });
});

describe("нещоденні звички", () => {
  it("незаплановані дні не рахуються провалом", () => {
    const habit = daily({
      recurrence: "weekly",
      weekdays: [0, 2, 4],
      startDate: "2026-07-27",
    });
    // Пн/Ср/Пт 2026-07: 27(Пн), 29(Ср), 31(Пт) + 2026-08-02 — неділя, не в розкладі.
    const done = ["2026-07-27", "2026-07-29", "2026-07-31"];
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    expect(b.days).toBe(3);
    expect(b.todayPending).toBe(false);
    expect(b.brokenOn).toBeNull();
  });
});

describe("flexibleStreakBreakdown — вікно для UI-полотна (`window`)", () => {
  it("хронологічний порядок: найдавніший день ліворуч, сьогодні праворуч", () => {
    const done = runOfDays(TODAY, 3);
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.window.map((c) => c.key)).toEqual([
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(b.window.every((c) => c.kind === "done")).toBe(true);
  });

  it("розрізняє пропуск-із-причиною, паузу і мовчазний-прощений пропуск", () => {
    // Один явний ланцюжок днів 07-11…08-02 з рівно одним «тихим» пропуском
    // (07-25), щоб MAX_CONSECUTIVE_GRACE=1 не обірвав прохід — інакше
    // ходьба назад від сьогодні зупиняється на першій же парі пропусків
    // поспіль і взагалі не доходить до давніших днів паузи/skip.
    const habit = daily({
      startDate: "2026-07-11",
      pauseIntervals: [{ from: "2026-07-21", to: "2026-07-21" }],
    });
    const done = [
      ...runOfDays("2026-07-20", 10), // 07-11…07-20
      "2026-07-22",
      "2026-07-24",
      "2026-07-26",
      ...runOfDays(TODAY, 7), // 07-27…08-02
    ];
    const b = flexibleStreakBreakdown(habit, done, TODAY, {
      skipsForHabit: { "2026-07-23": skip("busy") },
    });
    expect(b.brokenOn).toBeNull();
    const byKey = new Map(b.window.map((c) => [c.key, c.kind]));
    expect(byKey.get("2026-07-21")).toBe("pause");
    expect(byKey.get("2026-07-23")).toBe("skip");
    expect(byKey.get("2026-07-25")).toBe("miss");
    // 07-25 лишилось без відмітки — тристанова модель рахує його мовчазним
    // пропуском, прощеним бюджетом (`b.graceUsed`), а НЕ провалом, що
    // зламав би вікно.
    expect(b.graceUsed).toBe(1);
  });

  it("todayPending: сьогоднішній день входить у вікно як `pending`, не `miss`", () => {
    const done = runOfDays("2026-08-01", 5);
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.todayPending).toBe(true);
    const today = b.window.find((c) => c.key === TODAY);
    expect(today?.kind).toBe("pending");
  });

  it("порожня історія — порожнє вікно", () => {
    const b = flexibleStreakBreakdown(daily(), [], TODAY);
    expect(b.window).toEqual([]);
  });
});

describe("flexibleMaxActiveStreak", () => {
  it("бере максимум по неархівних звичках і поважає пропуски", () => {
    const a = daily({ id: "a" });
    const bHabit = daily({ id: "b" });
    const archived = daily({ id: "c", archived: true });
    const completions = {
      a: runOfDays("2026-08-01", 3),
      b: [...runOfDays("2026-07-30", 8), ...runOfDays(TODAY, 1)],
      c: runOfDays(TODAY, 100),
    };
    const skips = { b: { "2026-07-31": skip("busy") } };
    expect(
      flexibleMaxActiveStreak([a, bHabit, archived], completions, TODAY, skips),
    ).toBe(9);
  });
});

describe("flexibleMaxStreakAllTime (finding 1.22)", () => {
  it("current streak never exceeds the flexible all-time max on the same data", () => {
    // 7 виконаних, один прощений мовчазний пропуск, ще 5 виконаних —
    // сама ситуація з фіндингу: жорсткий `maxStreakAllTime` бачив би тут
    // 7 (найдовший суцільний прогін), а поточна гнучка серія — 12.
    const done = [...runOfDays("2026-07-27", 7), ...runOfDays(TODAY, 5)];
    const current = flexibleStreakForHabit(daily(), done, TODAY);
    const allTime = flexibleMaxStreakAllTime(daily(), done);
    expect(current).toBe(12);
    expect(allTime).toBe(12);
    expect(allTime).toBeGreaterThanOrEqual(current);
  });

  it("finds a longer historical run than the one ending today", () => {
    const historical = runOfDays("2026-06-01", 20); // long past streak
    const current = runOfDays(TODAY, 3); // short recent streak
    const done = [...historical, ...current];
    expect(flexibleMaxStreakAllTime(daily(), done)).toBe(20);
    expect(flexibleStreakForHabit(daily(), done, TODAY)).toBe(3);
  });

  it("once-habits have no streak by definition", () => {
    const habit = daily({ recurrence: "once" });
    expect(flexibleMaxStreakAllTime(habit, runOfDays(TODAY, 5))).toBe(0);
  });

  it("flexibleMaxStreakAllTimeAcrossHabits takes the max over active habits and honours skips", () => {
    const a = daily({ id: "a" });
    const bHabit = daily({ id: "b" });
    const archived = daily({ id: "c", archived: true });
    const completions = {
      a: runOfDays("2026-08-01", 3),
      b: [...runOfDays("2026-07-30", 8), ...runOfDays(TODAY, 1)],
      c: runOfDays(TODAY, 100),
    };
    const skips = { b: { "2026-07-31": skip("busy") } };
    expect(
      flexibleMaxStreakAllTimeAcrossHabits(
        [a, bHabit, archived],
        completions,
        skips,
      ),
    ).toBe(9);
  });
});
