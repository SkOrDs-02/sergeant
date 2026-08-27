import { describe, it, expect } from "vitest";

import {
  resolveEffectiveGoal,
  resolveEffectiveGoalsForRange,
  type GoalPeriod,
} from "./nutritionGoals.js";

/**
 * Тести резолвера ефективної цілі КБЖВ (W1-KBJU-APPEND, стадія 2).
 *
 * Найважливіші кейси тут — не «щасливий шлях», а межі:
 * день ДО найранішого періоду, кілька періодів в один день, ретрагований
 * період і збереження `origin='backfill'`. Саме на них тримається
 * можливість стадії 3 відрізнити факт від реконструкції.
 */

function period(over: Partial<GoalPeriod> & { id: string }): GoalPeriod {
  return {
    effectiveFrom: "2026-01-01",
    kcal: 2000,
    proteinG: 120,
    fatG: 60,
    carbsG: 220,
    waterMl: 2000,
    origin: "manual",
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

describe("resolveEffectiveGoal — базова сходинка", () => {
  const periods = [
    period({ id: "p1", effectiveFrom: "2026-03-01", kcal: 2400 }),
    period({ id: "p2", effectiveFrom: "2026-05-01", kcal: 1800 }),
  ];

  it("бере ціль, що діяла в той день, а не поточну", () => {
    // Це і є суть задачі: місяць на 2400 не червоніє після переходу на 1800.
    expect(resolveEffectiveGoal(periods, "2026-04-15").kcal).toBe(2400);
    expect(resolveEffectiveGoal(periods, "2026-05-15").kcal).toBe(1800);
  });

  it("період діє з САМОГО дня effectiveFrom (включно)", () => {
    expect(resolveEffectiveGoal(periods, "2026-05-01").kcal).toBe(1800);
    expect(resolveEffectiveGoal(periods, "2026-04-30").kcal).toBe(2400);
  });

  it("віддає sourcePeriodId і effectiveFrom для трасування", () => {
    const goal = resolveEffectiveGoal(periods, "2026-04-15");
    expect(goal.sourcePeriodId).toBe("p1");
    expect(goal.effectiveFrom).toBe("2026-03-01");
  });

  it("не залежить від порядку вхідного масиву", () => {
    const shuffled = [periods[1]!, periods[0]!];
    expect(resolveEffectiveGoal(shuffled, "2026-04-15").kcal).toBe(2400);
  });
});

describe("resolveEffectiveGoal — дата ДО найранішого періоду", () => {
  const periods = [period({ id: "p1", effectiveFrom: "2026-03-01" })];

  it("віддає origin 'unknown', а НЕ найранішу ціль", () => {
    // Простягнути перший період назад означало б ту саму ретроактивну
    // брехню, лише переставлену на початок історії.
    const goal = resolveEffectiveGoal(periods, "2026-02-28");
    expect(goal.origin).toBe("unknown");
    expect(goal.sourcePeriodId).toBeNull();
    expect(goal.effectiveFrom).toBeNull();
  });

  it("віддає null у КОЖНОМУ полі, а не нулі", () => {
    // `0` пофарбував би день у провал; `null` каже консюмеру «не малюй
    // відсоток».
    const goal = resolveEffectiveGoal(periods, "2026-02-28");
    expect(goal.kcal).toBeNull();
    expect(goal.proteinG).toBeNull();
    expect(goal.fatG).toBeNull();
    expect(goal.carbsG).toBeNull();
    expect(goal.waterMl).toBeNull();
  });

  it("порожній журнал — теж 'unknown', а не виняток", () => {
    expect(resolveEffectiveGoal([], "2026-05-01").origin).toBe("unknown");
  });
});

describe("resolveEffectiveGoal — кілька періодів в один день", () => {
  it("виграє останній за createdAt", () => {
    const periods = [
      period({
        id: "early",
        effectiveFrom: "2026-05-01",
        kcal: 1800,
        createdAt: "2026-05-01T09:00:00.000Z",
      }),
      period({
        id: "late",
        effectiveFrom: "2026-05-01",
        kcal: 1700,
        createdAt: "2026-05-01T21:00:00.000Z",
      }),
    ];
    expect(resolveEffectiveGoal(periods, "2026-05-03").sourcePeriodId).toBe(
      "late",
    );
    // І в зворотному порядку вхідного масиву — теж.
    expect(
      resolveEffectiveGoal([periods[1]!, periods[0]!], "2026-05-03")
        .sourcePeriodId,
    ).toBe("late");
  });

  it("за рівних createdAt виграє останній у вхідному масиві", () => {
    // Вхід приходить із SQL з ORDER BY — зберегти його порядок чесніше,
    // ніж вигадати власний.
    const ts = "2026-05-01T09:00:00.000Z";
    const periods = [
      period({ id: "a", effectiveFrom: "2026-05-01", createdAt: ts }),
      period({ id: "b", effectiveFrom: "2026-05-01", createdAt: ts }),
    ];
    expect(resolveEffectiveGoal(periods, "2026-05-01").sourcePeriodId).toBe(
      "b",
    );
  });
});

describe("resolveEffectiveGoal — ретракція", () => {
  it("мʼяко видалений період невидимий, діє попередній", () => {
    const periods = [
      period({ id: "p1", effectiveFrom: "2026-03-01", kcal: 2400 }),
      period({
        id: "oops",
        effectiveFrom: "2026-05-01",
        kcal: 240, // юзер помилився на порядок і ретрагував запис
        deletedAt: "2026-05-01T12:00:00.000Z",
      }),
    ];
    const goal = resolveEffectiveGoal(periods, "2026-05-15");
    expect(goal.sourcePeriodId).toBe("p1");
    expect(goal.kcal).toBe(2400);
  });

  it("усі періоди ретраговані — 'unknown'", () => {
    const periods = [
      period({ id: "p1", deletedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(resolveEffectiveGoal(periods, "2026-06-01").origin).toBe("unknown");
  });

  it("відсутнє поле deletedAt рахується живим", () => {
    const p: GoalPeriod = {
      id: "p1",
      effectiveFrom: "2026-03-01",
      kcal: 2100,
      proteinG: null,
      fatG: null,
      carbsG: null,
      waterMl: null,
      origin: "manual",
      createdAt: "2026-03-01T10:00:00.000Z",
    };
    expect(resolveEffectiveGoal([p], "2026-04-01").kcal).toBe(2100);
  });
});

describe("resolveEffectiveGoal — origin доїжджає незміненим", () => {
  it("зберігає 'backfill' — стадія 3 мусить бачити реконструкцію", () => {
    // Якщо резолвер «нормалізує» origin у 'manual', вибір founder-а між
    // «малювати як звичайні» / «з позначкою» / «без відсотка» стає
    // нереалізовним назавжди.
    const periods = [
      period({ id: "bf", effectiveFrom: "2026-01-01", origin: "backfill" }),
    ];
    expect(resolveEffectiveGoal(periods, "2026-02-01").origin).toBe("backfill");
  });

  it("зберігає 'preset' і 'tdee'", () => {
    expect(
      resolveEffectiveGoal(
        [period({ id: "p", effectiveFrom: "2026-01-01", origin: "preset" })],
        "2026-02-01",
      ).origin,
    ).toBe("preset");
    expect(
      resolveEffectiveGoal(
        [period({ id: "t", effectiveFrom: "2026-01-01", origin: "tdee" })],
        "2026-02-01",
      ).origin,
    ).toBe("tdee");
  });
});

describe("resolveEffectiveGoal — некоректний ввід не кидає", () => {
  it("зіпсований dateKey → 'unknown'", () => {
    const periods = [period({ id: "p1", effectiveFrom: "2026-01-01" })];
    // Падати посеред рендера тижневого графіка гірше, ніж «не знаю».
    expect(resolveEffectiveGoal(periods, "2026-5-1").origin).toBe("unknown");
    expect(resolveEffectiveGoal(periods, "").origin).toBe("unknown");
    expect(resolveEffectiveGoal(periods, "not-a-date").origin).toBe("unknown");
  });

  it("період зі зіпсованим effectiveFrom ігнорується, решта працює", () => {
    const periods = [
      period({ id: "good", effectiveFrom: "2026-03-01", kcal: 2400 }),
      period({ id: "bad", effectiveFrom: "March 2026", kcal: 999 }),
    ];
    expect(resolveEffectiveGoal(periods, "2026-04-01").sourcePeriodId).toBe(
      "good",
    );
  });

  it("null-цілі всередині живого періоду лишаються null, не стають 0", () => {
    const periods = [
      period({
        id: "p1",
        effectiveFrom: "2026-03-01",
        kcal: 2000,
        proteinG: null,
      }),
    ];
    const goal = resolveEffectiveGoal(periods, "2026-04-01");
    expect(goal.kcal).toBe(2000);
    expect(goal.proteinG).toBeNull();
  });
});

describe("resolveEffectiveGoalsForRange", () => {
  const periods = [
    period({ id: "p1", effectiveFrom: "2026-05-04", kcal: 2400 }),
    period({ id: "p2", effectiveFrom: "2026-05-06", kcal: 1800 }),
  ];

  it("віддає ціль на КОЖЕН день діапазону включно", () => {
    const map = resolveEffectiveGoalsForRange(
      periods,
      "2026-05-04",
      "2026-05-10",
    );
    expect(map.size).toBe(7);
    expect([...map.keys()]).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ]);
  });

  it("перемикає ціль рівно на дні сходинки", () => {
    const map = resolveEffectiveGoalsForRange(
      periods,
      "2026-05-04",
      "2026-05-10",
    );
    expect(map.get("2026-05-05")!.kcal).toBe(2400);
    expect(map.get("2026-05-06")!.kcal).toBe(1800);
    expect(map.get("2026-05-10")!.kcal).toBe(1800);
  });

  it("дні до найранішої сходинки — 'unknown', решта тижня жива", () => {
    // Саме та ситуація, у якій опиниться стадія 3 після backfill-у:
    // частина тижня відома, частина ні.
    const map = resolveEffectiveGoalsForRange(
      periods,
      "2026-05-01",
      "2026-05-07",
    );
    expect(map.get("2026-05-01")!.origin).toBe("unknown");
    expect(map.get("2026-05-03")!.origin).toBe("unknown");
    expect(map.get("2026-05-04")!.origin).toBe("manual");
  });

  it("узгоджений з поденним resolveEffectiveGoal", () => {
    // Дві реалізації (курсор vs повний скан) не мусять розходитись —
    // інакше тижневий графік і денне кільце покажуть різні цифри.
    const map = resolveEffectiveGoalsForRange(
      periods,
      "2026-05-01",
      "2026-05-12",
    );
    for (const [dateKey, goal] of map) {
      expect(goal).toEqual(resolveEffectiveGoal(periods, dateKey));
    }
  });

  it("переживає межу місяця і високосний рік", () => {
    const map = resolveEffectiveGoalsForRange(
      [period({ id: "p", effectiveFrom: "2024-02-01" })],
      "2024-02-27",
      "2024-03-02",
    );
    expect([...map.keys()]).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
    ]);
  });

  it("ігнорує ретраговані періоди так само, як поденний резолвер", () => {
    const withRetracted = [
      period({ id: "p1", effectiveFrom: "2026-05-04", kcal: 2400 }),
      period({
        id: "oops",
        effectiveFrom: "2026-05-06",
        kcal: 240,
        deletedAt: "2026-05-06T12:00:00.000Z",
      }),
    ];
    const map = resolveEffectiveGoalsForRange(
      withRetracted,
      "2026-05-04",
      "2026-05-08",
    );
    expect(map.get("2026-05-08")!.kcal).toBe(2400);
  });

  it("порожня мапа на перевернутий чи зіпсований діапазон", () => {
    expect(
      resolveEffectiveGoalsForRange(periods, "2026-05-10", "2026-05-04").size,
    ).toBe(0);
    expect(
      resolveEffectiveGoalsForRange(periods, "nope", "2026-05-04").size,
    ).toBe(0);
  });

  it("один день — мапа з одного запису", () => {
    const map = resolveEffectiveGoalsForRange(
      periods,
      "2026-05-05",
      "2026-05-05",
    );
    expect(map.size).toBe(1);
    expect(map.get("2026-05-05")!.kcal).toBe(2400);
  });
});
