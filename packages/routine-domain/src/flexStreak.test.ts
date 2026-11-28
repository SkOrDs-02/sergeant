import { describe, expect, it } from "vitest";

import {
  GRACE_EARN_EVERY_DAYS,
  GRACE_START_BUDGET,
  MAX_GRACE_BUDGET,
  flexibleMaxActiveStreak,
  flexibleMaxStreakAllTime,
  flexibleMaxStreakAllTimeAcrossHabits,
  flexibleStreakBreakdown,
  flexibleStreakForHabit,
  longestStreakAcrossHabits,
  longestStreakForHabit,
} from "./flexStreak.js";
import { maxStreakAllTime, streakForHabit } from "./streaks.js";
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
  // Числа ратифіковані власником 2026-11-18 (OD-29, Р-4 (а)): 1 на старті,
  // ще 1 за кожні 7 виконаних днів, стеля 4, два пропуски поспіль не
  // прощаються ніколи.
  it("ратифіковані числа квоти", () => {
    expect(GRACE_START_BUDGET).toBe(1);
    expect(GRACE_EARN_EVERY_DAYS).toBe(7);
    expect(MAX_GRACE_BUDGET).toBe(4);
  });

  it("нова звичка без історії має одну заморозку на старті", () => {
    const b = flexibleStreakBreakdown(daily(), [], TODAY);
    expect(b.days).toBe(0);
    expect(b.graceRemaining).toBe(1);
    expect(b.graceBudget).toBe(1);
    expect(b.graceFromStart).toBe(1);
    expect(b.graceFromDays).toBe(0);
    expect(b.graceMax).toBe(MAX_GRACE_BUDGET);
    expect(b.daysToNextGrace).toBe(7);
  });

  it("стартова заморозка рятує серію коротшу за 7 днів", () => {
    // 5 виконаних, мовчазний пропуск 08-01, відмітка сьогодні. До стартової
    // одиниці бюджет тут був нуль і серія ріжеться до 1.
    // Звичка створена 07-27: це перша серія нової звички.
    const habit = daily({ startDate: "2026-07-27" });
    const done = [...runOfDays("2026-07-31", 5), ...runOfDays(TODAY, 1)];
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    expect(b.days).toBe(6);
    expect(b.graceUsed).toBe(1);
    expect(b.graceRemaining).toBe(0);
    expect(b.brokenOn).toBeNull();
    expect(b.daysToNextGrace).toBe(1);
  });

  it("стартова одиниця не скасовує правило двох пропусків поспіль", () => {
    // 5 виконаних, 07-31 і 08-01 порожні, сьогодні відмічено.
    const done = [...runOfDays("2026-07-30", 5), ...runOfDays(TODAY, 1)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(1);
    expect(b.graceUsed).toBe(0);
    expect(b.brokenOn).toBe("2026-08-01");
  });

  it("1 на старті плюс одна заморозка за кожні 7 виконаних днів", () => {
    // 10 виконаних до пропуску + 2 після = 12 днів: 1 стартова + 1 зароблена.
    const done = [...runOfDays("2026-07-30", 10), ...runOfDays(TODAY, 2)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(12);
    expect(b.graceUsed).toBe(1);
    expect(b.graceBudget).toBe(2);
    expect(b.graceRemaining).toBe(1);
  });

  it("14 виконань поспіль: 3 з 4 у запасі, наступна через 7", () => {
    const b = flexibleStreakBreakdown(daily(), runOfDays(TODAY, 14), TODAY);
    expect(b.days).toBe(14);
    expect(b.graceRemaining).toBe(3);
    expect(b.graceFromStart).toBe(1);
    expect(b.graceFromDays).toBe(2);
    expect(b.daysToNextGrace).toBe(7);
  });

  it("два пропуски на 12 виконаних прощаються: 1 стартова + 1 зароблена", () => {
    const habit = daily({ startDate: "2026-07-20" });
    const done = runOfDays(TODAY, 14).filter(
      (k) => k !== "2026-07-24" && k !== "2026-07-30",
    );
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    expect(b.brokenOn).toBeNull();
    expect(b.days).toBe(12);
    expect(b.graceUsed).toBe(2);
    expect(b.graceRemaining).toBe(0);
  });

  it("третій пропуск не по кишені — серія ріжеться на найдавнішому", () => {
    // 07-20…08-02 із трьома мовчазними пропусками (07-22, 07-26, 07-30):
    // 11 виконаних = 1 стартова + 1 зароблена, а пропусків три.
    const habit = daily({ startDate: "2026-07-20" });
    const done = runOfDays(TODAY, 14).filter(
      (k) => k !== "2026-07-22" && k !== "2026-07-26" && k !== "2026-07-30",
    );
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    expect(b.brokenOn).toBe("2026-07-22");
    expect(b.days).toBe(9);
    expect(b.graceUsed).toBe(2);
    expect(b.graceRemaining).toBe(0);
  });

  it("стеля бюджету не дає нескінченно довгій серії прощати все", () => {
    const b = flexibleStreakBreakdown(daily(), runOfDays(TODAY, 400), TODAY, {
      maxGraceBudget: MAX_GRACE_BUDGET,
    });
    expect(b.graceRemaining).toBe(MAX_GRACE_BUDGET);
    expect(b.graceFromStart).toBe(1);
    expect(b.graceFromDays).toBe(MAX_GRACE_BUDGET - 1);
    expect(b.daysToNextGrace).toBeNull();
  });

  it("стеля досягається вже на 21 виконанні", () => {
    const b = flexibleStreakBreakdown(daily(), runOfDays(TODAY, 21), TODAY);
    expect(b.graceBudget).toBe(4);
    expect(b.daysToNextGrace).toBeNull();
  });

  it("після обриву нова серія знову стартує з однією заморозкою", () => {
    const done = [...runOfDays("2026-07-25", 20), ...runOfDays(TODAY, 2)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(2);
    expect(b.graceRemaining).toBe(1);
  });

  it("разова подія заморозок не має", () => {
    const b = flexibleStreakBreakdown(daily({ recurrence: "once" }), [], TODAY);
    expect(b.graceRemaining).toBe(0);
    expect(b.graceBudget).toBe(0);
    expect(b.daysToNextGrace).toBeNull();
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

// ── Гнучка звичка «N разів на тиждень» × поденний soft-стрік ────────────────
//
// PR-R4 (аудит 2026-09-13), сьомий і останній живий call-site того самого
// класу. Дві «гнучкості» в цьому файлі — різні сутності з однаковою назвою:
// `flexibleStreakBreakdown` — це ПОДЕННИЙ стрік із бюджетом прощень (діє на
// всі звички), а `recurrence: "flexible"` — це «N разів на тиждень». Прогін
// другого через перший без `weekDoneCount` рахував пропуском кожен день, у
// який людина нічого й не мала робити: перший такий день зʼїдав grace,
// другий підряд рвав серію. Тобто продукт карав саме за виконання плану.
//
// `streaks.ts` цю розвилку має з самого початку (`isFlexibleHabit` →
// `weeklyGoalStreakWeeks`), `flexStreak.ts` — не мав.
describe("flexibleStreakBreakdown × recurrence: flexible", () => {
  /** Ціль «N разів на тиждень», відлік від 2026-01-01. */
  function flexible(target = 3, overrides: Partial<Habit> = {}): Habit {
    return daily({
      recurrence: "flexible",
      weeklyTargetHistory: [{ from: "2026-01-01", target }],
      ...overrides,
    });
  }

  // Тиждень 2026-07-27 (Пн) … 2026-08-02 (Нд, і це `TODAY`). Ціль 3,
  // виконано Пн/Вт/Ср — отже Чт/Пт/Сб/Нд планом не передбачені взагалі.
  const WEEK_DONE_3 = ["2026-07-27", "2026-07-28", "2026-07-29"];

  it("серія дорівнює трьом виконаним дням, а не рветься об дні понад ціль", () => {
    const b = flexibleStreakBreakdown(flexible(), WEEK_DONE_3, TODAY);

    expect(b.days).toBe(3);
    // Найважливіше: жодного прощення не витрачено. До фікса Чт зʼїдав
    // grace, а Пт рвав серію — саме за те, що тижневу ціль уже добрано.
    expect(b.graceUsed).toBe(0);
    expect(b.window.map((d) => d.kind)).not.toContain("miss");
  });

  it("Чт–Нд після добраної цілі позначені як «off», Пн–Ср — як «done»", () => {
    const b = flexibleStreakBreakdown(flexible(), WEEK_DONE_3, TODAY);
    const byKey = new Map(b.window.map((d) => [d.key, d.kind]));

    for (const key of [
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]) {
      expect(byKey.get(key)).toBe("off");
    }
    for (const key of WEEK_DONE_3) {
      expect(byKey.get(key)).toBe("done");
    }
  });

  // Контраст, який називає ціну бага одним числом: ті самі три відмітки на
  // ЩОДЕННІЙ звичці дають нуль, бо там Чт–Нд справді пропуски. До фікса
  // гнучка звичка рахувалась так само — тобто як щоденна.
  it("ті самі відмітки на щоденній звичці дають 0 — різниця саме в гнучкості", () => {
    expect(flexibleStreakForHabit(daily(), WEEK_DONE_3, TODAY)).toBe(0);
    expect(flexibleStreakForHabit(flexible(), WEEK_DONE_3, TODAY)).toBe(3);
  });

  // Guard: фікс не робить гнучку звичку невразливою. Поки тижневу ціль НЕ
  // добрано, день без відмітки лишається звичайним пропуском.
  it("guard: поки ціль НЕ добрано, пропущені дні лишаються пропусками", () => {
    // Ціль 7 на тиждень — тобто щодня; виконано лише три дні з семи.
    expect(flexibleStreakForHabit(flexible(7), WEEK_DONE_3, TODAY)).toBe(0);
  });

  // Guard: щоденних звичок фікс не торкається — `weekDoneCount` для них не
  // рахується й не передається.
  it("guard: щоденна звичка з непреривним рядом рахується як раніше", () => {
    expect(flexibleStreakForHabit(daily(), runOfDays(TODAY, 5), TODAY)).toBe(5);
  });

  it("сьогодні не висить «в очікуванні», коли тижневу ціль уже добрано", () => {
    const b = flexibleStreakBreakdown(flexible(), WEEK_DONE_3, TODAY);
    expect(b.todayPending).toBe(false);
  });
});

describe("longestStreakForHabit: найдовша >= поточної (FULL-20261126-ROUTINE-1)", () => {
  it("відтворення: 1 прощений пропуск, поточна 13, жорстка найдовша менша", () => {
    // 6 днів, один пропуск (07-27), 6 днів до сьогодні включно: поточна 12.
    const done = [...runOfDays("2026-07-26", 6), ...runOfDays(TODAY, 6)];
    const current = flexibleStreakForHabit(daily(), done, TODAY);
    expect(current).toBe(12);
    // Жорсткий рахунок рве серію на пропуску й дає менше за поточну.
    expect(maxStreakAllTime(daily(), done)).toBeLessThan(current);
    expect(longestStreakForHabit(daily(), done, TODAY)).toBeGreaterThanOrEqual(
      current,
    );
  });

  it("матриця: для будь-якої історії з пропусками, паузою й причинами longest >= current", () => {
    // Детермінований LCG: стабільна «випадкова» матриця без зовнішніх залежностей.
    let seed = 20261126;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const days = Array.from({ length: 60 }, (_, i) => {
      const d = new Date("2026-06-04T12:00:00");
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    for (let round = 0; round < 300; round++) {
      const doneP = 0.4 + rnd() * 0.55;
      const done: string[] = [];
      const skips: Record<string, HabitSkip> = {};
      for (const k of days) {
        const r = rnd();
        if (r < doneP) done.push(k);
        else if (r < doneP + 0.08) skips[k] = skip();
      }
      const habit = daily({
        startDate: "2026-06-04",
        ...(round % 3 === 0
          ? { pauseIntervals: [{ from: "2026-07-01", to: "2026-07-05" }] }
          : {}),
      });
      for (const todayKey of [days[days.length - 1]!, days[40]!]) {
        const current = flexibleStreakBreakdown(habit, done, todayKey, {
          skipsForHabit: skips,
        }).days;
        const longest = longestStreakForHabit(habit, done, todayKey, {
          skipsForHabit: skips,
        });
        expect(longest).toBeGreaterThanOrEqual(current);
        expect(
          longestStreakAcrossHabits([habit], { h1: done }, todayKey, {
            h1: skips,
          }),
        ).toBeGreaterThanOrEqual(
          flexibleMaxActiveStreak([habit], { h1: done }, todayKey, {
            h1: skips,
          }),
        );
      }
    }
  });

  it("гнучка «N на тиждень»: одиниці тижні, найдовша >= поточної", () => {
    const habit = daily({
      recurrence: "flexible",
      weeklyTargetHistory: [{ from: "2026-06-01", target: 2 }],
      startDate: "2026-06-01",
    });
    const done = ["2026-07-06", "2026-07-08", "2026-07-13", "2026-07-15"];
    const today = "2026-07-16";
    expect(longestStreakForHabit(habit, done, today)).toBeGreaterThanOrEqual(
      streakForHabit(habit, done, today),
    );
  });

  it("once не має серії", () => {
    const once = daily({ recurrence: "once", startDate: TODAY });
    expect(longestStreakForHabit(once, [TODAY], TODAY)).toBe(0);
  });
});

describe("flexibleStreakBreakdown: пропуск перед подвійним пропуском (аудит 3)", () => {
  it("пропуск, що стоїть перед обривом, не потрапляє у вікно й не витрачає заморозку", () => {
    // Від сьогодні назад: 5 виконаних, потім ДВА порожні поспіль (обрив) і
    // ще давніші виконані. Перший із двох порожніх (А) у вікно не входить.
    const done = [
      ...runOfDays(TODAY, 5),
      ...runOfDays("2026-07-20", 4), // давніше за подвійний пропуск
    ];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(5);
    expect(b.graceUsed).toBe(0);
    expect(b.window.every((c) => c.kind !== "miss")).toBe(true);
    expect(b.brokenOn).not.toBeNull();
  });

  it("реальний прощений пропуск усередині серії рахується рівно один раз", () => {
    const done = [...runOfDays(TODAY, 3), ...runOfDays("2026-07-29", 3)];
    // 08-02,01,07-31 виконано; 07-30 порожній; 07-29,28,27 виконано;
    // 07-26 і 07-25 порожні поспіль (обрив).
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(6);
    expect(b.graceUsed).toBe(1);
  });

  it("прощений пропуск + пропуск перед обривом: заморозка витрачена одна, серія не коротшає", () => {
    // 3 виконані, пропуск M (07-30), 3 виконані (07-27..07-29), потім ДВА
    // порожні (07-26 = А, 07-25 = обрив), ще давніше виконані.
    const done = [
      ...runOfDays(TODAY, 3),
      ...runOfDays("2026-07-29", 3),
      ...runOfDays("2026-07-24", 3),
    ];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.days).toBe(6);
    expect(b.graceUsed).toBe(1);
    expect(b.window.filter((c) => c.kind === "miss")).toHaveLength(1);
  });
});
