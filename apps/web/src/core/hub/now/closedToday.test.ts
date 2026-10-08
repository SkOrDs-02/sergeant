// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Habit } from "@sergeant/routine-domain";
import type { Workout } from "@sergeant/fizruk-domain";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "@routine/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "@nutrition/lib/sqliteReader";
import type { Rec } from "../../lib/recommendationEngine";
import { formatNumberUk } from "@sergeant/shared";

// Фінік: контекст витрат підміняємо цілком — правило «закрито» потребує
// лише суми за сьогодні, а не всього всесвіту `bank + manual`.
const finykMock = vi.hoisted(() => ({
  txs: [] as Array<{ id: string; amount: number; time: number }>,
  budgets: [] as Array<Record<string, unknown>>,
}));
vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: finykMock.txs,
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
    budgets: finykMock.budgets,
  }),
}));

const { computeClosedToday } = await import("./closedToday");

const NOW = new Date("2026-09-17T19:30:00+03:00");
const TODAY = "2026-09-17";
const ALL = ["finyk", "fizruk", "routine", "nutrition"] as const;

function habit(id: string, over: Partial<Habit> = {}): Habit {
  return { id, name: id, recurrence: "daily", ...over } as Habit;
}

function seedRoutine(habits: Habit[], completions: Record<string, string[]>) {
  __setRoutineSqliteStateCacheForTests({
    habits,
    habitOrder: habits.map((h) => h.id),
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions });
}

function seedFizruk(workouts: Array<Partial<Workout>>) {
  __setFizrukSqliteCacheForTests({
    workouts: workouts as Workout[],
    refreshedAt: NOW.toISOString(),
  } as Parameters<typeof __setFizrukSqliteCacheForTests>[0]);
}

function seedNutrition(kcalToday: number[], goalKcal: number | null) {
  __setNutritionSqliteCacheForTests({
    log: {
      [TODAY]: {
        meals: kcalToday.map((kcal, i) => ({
          id: `m${i}`,
          macros: { kcal, protein_g: 0, fat_g: 0, carbs_g: 0 },
        })),
      },
    },
    goalPeriods:
      goalKcal === null
        ? []
        : [
            {
              id: "g",
              effectiveFrom: "2000-01-01",
              kcal: goalKcal,
              proteinG: null,
              fatG: null,
              carbsG: null,
              waterMl: null,
              origin: "manual",
              createdAt: "2000-01-01T00:00:00.000Z",
              deletedAt: null,
            },
          ],
    refreshedAt: NOW.toISOString(),
  } as unknown as Parameters<typeof __setNutritionSqliteCacheForTests>[0]);
}

function compute(recs: Rec[] = [], activeModules: readonly string[] = ALL) {
  return computeClosedToday({ activeModules, recs, now: NOW });
}

describe("computeClosedToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    finykMock.txs = [];
    finykMock.budgets = [];
  });
  afterEach(() => {
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
    clearFizrukSqliteCache();
    clearNutritionSqliteCache();
    vi.useRealTimers();
  });

  it("порожні кеші — порожня купа; збій одного читача не гасить решту", () => {
    expect(compute()).toEqual([]);
  });

  describe("Рутина — ціль є завжди (список звичок дня)", () => {
    it("усі заплановані відмічені → рядок «усі відмічені» з N/N", () => {
      seedRoutine([habit("a"), habit("b")], { a: [TODAY], b: [TODAY] });
      expect(compute()).toEqual([
        {
          module: "routine",
          label: "Звички",
          statement: "усі відмічені",
          value: "2/2",
        },
      ]);
    });

    it("одна з двох — не закрито: слово «закрито» не бреше", () => {
      seedRoutine([habit("a"), habit("b")], { a: [TODAY] });
      expect(compute()).toEqual([]);
    });

    it("архівна звичка не рахується ні в чисельник, ні в знаменник", () => {
      seedRoutine([habit("a"), habit("z", { archived: true })], {
        a: [TODAY],
      });
      expect(compute()[0]?.value).toBe("1/1");
      expect(compute()[0]?.statement).toBe("єдина звичка відмічена");
    });
  });

  describe("Їжа — суворо при цілі, інакше будь-який запис", () => {
    it("з ціллю: у коридорі 95–105 % → «у коридорі цілі»", () => {
      seedNutrition([1000, 1000], 2000);
      expect(compute()).toEqual([
        {
          module: "nutrition",
          label: "Їжа",
          statement: "у коридорі цілі",
          value: `${formatNumberUk(2000)} ккал`,
        },
      ]);
    });

    it("з ціллю: 90 % — не закрито", () => {
      seedNutrition([900, 900], 2000);
      expect(compute()).toEqual([]);
    });

    it("без цілі: один прийом — уже закрито", () => {
      seedNutrition([450], null);
      expect(compute()).toEqual([
        {
          module: "nutrition",
          label: "Їжа",
          statement: "1 прийом записано",
          value: "450 ккал",
        },
      ]);
    });
  });

  describe("Фізрук — тренування завершене сьогодні", () => {
    it("завершене сьогодні → рядок з хвилинами", () => {
      seedFizruk([
        {
          id: "w1",
          startedAt: "2026-09-17T07:00:00+03:00",
          endedAt: "2026-09-17T07:52:00+03:00",
        },
      ]);
      expect(compute()).toEqual([
        {
          module: "fizruk",
          label: "Тренування",
          statement: "сьогодні, 52 хв",
          value: "1",
        },
      ]);
    });

    it("вчорашнє або незавершене — не закрито", () => {
      seedFizruk([
        {
          id: "w0",
          startedAt: "2026-09-16T07:00:00+03:00",
          endedAt: "2026-09-16T07:52:00+03:00",
        },
        { id: "w2", startedAt: "2026-09-17T18:00:00+03:00", endedAt: null },
      ]);
      expect(compute()).toEqual([]);
    });
  });

  describe("Фінік — витрата сьогодні без перевищення ліміту", () => {
    it("є ліміт і перевищень немає → «записано · у межах лімітів» із сумою", () => {
      finykMock.txs = [
        // Суми — у копійках (minor units): 250 ₴.
        { id: "t1", amount: -25000, time: NOW.getTime() - 3600_000 },
      ];
      finykMock.budgets = [
        { id: "b1", type: "limit", categoryId: "food", limit: 5000 },
      ];
      const [row] = compute();
      expect(row).toMatchObject({
        module: "finyk",
        label: "Витрати",
        statement: "записано · у межах лімітів",
      });
      expect(row?.value).toContain("250");
    });

    it("без жодного ліміту → просто «записано»: про ліміти нема що казати", () => {
      finykMock.txs = [
        { id: "t1", amount: -25000, time: NOW.getTime() - 3600_000 },
      ];
      finykMock.budgets = [];
      expect(compute()[0]?.statement).toBe("записано");
    });

    it("ціль накопичення — не ліміт: «у межах лімітів» не кажемо", () => {
      finykMock.txs = [
        { id: "t1", amount: -25000, time: NOW.getTime() - 3600_000 },
      ];
      finykMock.budgets = [
        { id: "g1", type: "goal", name: "Відпустка", targetAmount: 100000 },
      ];
      expect(compute()[0]?.statement).toBe("записано");
    });

    it("активне `budget_over_*` знімає рядок: витрати ще в «Зараз»", () => {
      finykMock.txs = [
        // Суми — у копійках (minor units): 250 ₴.
        { id: "t1", amount: -25000, time: NOW.getTime() - 3600_000 },
      ];
      const over = {
        id: "budget_over_food",
        module: "finyk",
        priority: 90,
        icon: "alert",
        title: "",
        body: "",
        action: "finyk",
      } as Rec;
      expect(compute([over])).toEqual([]);
    });

    // f5 (рішення власника 2026-10-01): поки висить попередження про ТЕМП
    // витрат, галочка «записано» поруч із ним суперечить картці в «Зараз».
    describe("попередження про темп знімає рядок", () => {
      const paceRec = (id: string) =>
        ({
          id,
          module: "finyk",
          priority: 72,
          icon: "clock",
          title: "",
          body: "",
          action: "finyk",
        }) as Rec;

      beforeEach(() => {
        finykMock.txs = [
          { id: "t1", amount: -25000, time: NOW.getTime() - 3600_000 },
        ];
      });

      it("денна «Сьогодні вище середнього» не дає Фініку потрапити в «Закрито»", () => {
        expect(compute([paceRec("finyk_daily_vs_weekly_pace")])).toEqual([]);
      });

      it("тижнева «Витрати вище ніж минулого тижня» теж", () => {
        expect(compute([paceRec("spending_velocity_high")])).toEqual([]);
      });

      it("похвала «Витрати нижче ніж минулого тижня» не блокує: це не попередження", () => {
        const [row] = compute([paceRec("spending_velocity_low")]);
        expect(row).toMatchObject({ module: "finyk", statement: "записано" });
      });

      it("без попередження про темп рядок на місці", () => {
        expect(compute([paceRec("nutrition_protein_low")])[0]?.module).toBe(
          "finyk",
        );
      });

      it("попередження блокує лише Фінік: решта модулів закриваються", () => {
        seedRoutine([habit("a")], { a: [TODAY] });
        const rows = compute([paceRec("finyk_daily_vs_weekly_pace")]);
        expect(rows.map((r) => r.module)).toEqual(["routine"]);
      });
    });
  });

  it("неактивний модуль рядка не отримує, порядок — сталий порядок модулів", () => {
    seedRoutine([habit("a")], { a: [TODAY] });
    seedNutrition([450], null);
    expect(compute([], ["nutrition", "routine"]).map((r) => r.module)).toEqual([
      "routine",
      "nutrition",
    ]);
    expect(compute([], ["nutrition"]).map((r) => r.module)).toEqual([
      "nutrition",
    ]);
  });
});

// Доба для ГРОШЕЙ у «Закрито сьогодні» — київська (рішення власника
// 2026-10-01, ADR-0078); решта рядків лишаються на добі телефона. Пояс
// пристрою перемикається прямо в тесті (Node перечитує `process.env.TZ` на
// льоту; `vitest.config.js` пінить UTC лише як стартове значення).
//
// NOW = 2026-09-17 19:30 за Києвом (16:30Z). Київська доба — від 16.09 21:00Z.
describe("computeClosedToday: початок доби для витрат — київський", () => {
  const ORIGINAL_TZ = process.env["TZ"];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    finykMock.txs = [];
    finykMock.budgets = [];
  });
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
    else process.env["TZ"] = ORIGINAL_TZ;
    vi.useRealTimers();
  });

  const spentRow = (tz: string) => {
    process.env["TZ"] = tz;
    return compute([], ["finyk"])[0];
  };

  it("покупка о 01:30 за Києвом — сьогоднішня, хоч у Нью-Йорку на пристрої ще вчора", () => {
    // 16.09 22:30Z = 17.09 01:30 Київ = 16.09 18:30 Нью-Йорк (початок «доби
    // телефона» там — 17.09 04:00Z, тож за годинником пристрою вона вчорашня).
    finykMock.txs = [
      { id: "t1", amount: -30000, time: Date.parse("2026-09-16T22:30:00Z") },
    ];
    const row = spentRow("America/New_York");
    expect(row).toMatchObject({ module: "finyk", statement: "записано" });
    expect(row?.value).toContain("300");
  });

  it("покупка о 23:30 за Києвом учора — вчорашня, хоч у Дубаї на пристрої вже сьогодні", () => {
    // 16.09 20:30Z = 16.09 23:30 Київ = 17.09 00:30 Дубай (UTC+4; початок
    // «доби телефона» там — 16.09 20:00Z, тож за пристроєм вона сьогоднішня).
    finykMock.txs = [
      { id: "t1", amount: -30000, time: Date.parse("2026-09-16T20:30:00Z") },
    ];
    expect(spentRow("Asia/Dubai")).toBeUndefined();
  });

  it("покупка о 13:00 за Києвом — сьогоднішня, хоч у Токіо (де вже 18.09) на пристрої вона вчорашня", () => {
    // 17.09 10:00Z = 17.09 13:00 Київ = 17.09 19:00 Токіо. «Зараз» у Токіо —
    // 18.09 01:30, початок «доби телефона» — 17.09 15:00Z, тож покупка за
    // пристроєм лишилась учорашньою.
    finykMock.txs = [
      { id: "t1", amount: -30000, time: Date.parse("2026-09-17T10:00:00Z") },
    ];
    const row = spentRow("Asia/Tokyo");
    expect(row).toMatchObject({ module: "finyk", statement: "записано" });
    expect(row?.value).toContain("300");
  });

  it("київський пристрій і пристрої поза Києвом бачать одну й ту саму суму", () => {
    finykMock.txs = [
      { id: "today", amount: -25000, time: Date.parse("2026-09-17T10:00:00Z") },
      {
        id: "late-yesterday",
        amount: -9900,
        time: Date.parse("2026-09-16T20:30:00Z"),
      },
    ];
    for (const tz of ["Europe/Kyiv", "UTC", "America/New_York", "Asia/Tokyo"]) {
      const row = spentRow(tz);
      expect(row?.value, `пояс пристрою: ${tz}`).toContain("250");
      expect(row?.value, `пояс пристрою: ${tz}`).not.toContain("349");
    }
  });

  it("запис, датований наперед (завтра за Києвом), у сьогоднішні витрати не входить", () => {
    finykMock.txs = [
      {
        id: "future",
        amount: -50000,
        time: Date.parse("2026-09-17T21:00:00Z"),
      },
    ];
    expect(spentRow("Europe/Kyiv")).toBeUndefined();
  });
});
