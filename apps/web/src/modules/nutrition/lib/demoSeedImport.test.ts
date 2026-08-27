// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  importNutritionDemoSeed,
  readNutritionDemoStateFromLs,
} from "./demoSeedImport";

const LOG_KEY = "nutrition_log_v1";
const PREFS_KEY = "nutrition_prefs_v1"; // gitleaks:allow
const WATER_KEY = "nutrition_water_v1";

/** Мінімальна форма того, що реально пише `seedNutrition()`. */
function seedLikeLog() {
  return {
    "2026-08-07": {
      meals: [
        {
          id: "demo_meal_1",
          demo: true,
          name: "Омлет + тост",
          time: "08:20",
          mealType: "breakfast",
          label: "Сніданок",
          macros: { kcal: 420, protein_g: 22, fat_g: 18, carbs_g: 38 },
          source: "photo",
          macroSource: "photoAI",
          amount_g: null,
          foodId: null,
        },
      ],
    },
  };
}

function seedLikePrefs() {
  return {
    goal: "maintain",
    servings: 2,
    timeMinutes: 30,
    exclude: "",
    dailyTargetKcal: 2200,
    dailyTargetProtein_g: 140,
    dailyTargetFat_g: 70,
    dailyTargetCarbs_g: 240,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 9,
    waterGoalMl: 2500,
  };
}

/** Форма ПІСЛЯ фіксу пастки з водою — число мілілітрів напряму. */
function seedLikeWater() {
  return { "2026-08-07": 1400, "2026-08-06": 2200 };
}

describe("readNutritionDemoStateFromLs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("повертає null, коли демо-payload у LS немає", () => {
    expect(readNutritionDemoStateFromLs()).toBeNull();
  });

  it("повертає null на порожніх колекціях — лити нема чого", () => {
    localStorage.setItem(LOG_KEY, JSON.stringify({}));
    localStorage.setItem(WATER_KEY, JSON.stringify({}));
    expect(readNutritionDemoStateFromLs()).toBeNull();
  });

  it("збирає стан із журналу, преференцій і води, які пише демо-сід", () => {
    localStorage.setItem(LOG_KEY, JSON.stringify(seedLikeLog()));
    localStorage.setItem(PREFS_KEY, JSON.stringify(seedLikePrefs()));
    localStorage.setItem(WATER_KEY, JSON.stringify(seedLikeWater()));

    const state = readNutritionDemoStateFromLs();

    expect(state?.meals).toHaveLength(1);
    expect(state?.meals[0]).toMatchObject({ id: "demo_meal_1" });
    expect(state?.waterLog).toEqual({ "2026-08-07": 1400, "2026-08-06": 2200 });
    expect(state?.prefs).not.toBeNull();
    // Форма prefs у dual-write — `{prefsJson, activePantryId}`, не сирий
    // обʼєкт (пастка #2 із завдання): перевіряємо, що JSON справді
    // РОЗІБРАНИЙ і нормалізований, а не сирий сід один-в-один.
    const parsedPrefsJson = JSON.parse(state!.prefs!.prefsJson);
    expect(parsedPrefsJson.dailyTargetKcal).toBe(2200);
    expect(state?.prefs?.activePantryId).toBeNull();
  });

  it("recipes/pantries/shoppingList/pantryEvents лишаються порожні — сід їх не пише", () => {
    localStorage.setItem(LOG_KEY, JSON.stringify(seedLikeLog()));
    const state = readNutritionDemoStateFromLs();
    expect(state?.recipes).toEqual([]);
    expect(state?.pantries).toEqual([]);
    expect(state?.shoppingList).toBeNull();
    expect(state?.pantryEvents).toEqual([]);
  });

  it("переживає побитий JSON без винятку", () => {
    localStorage.setItem(LOG_KEY, "{не json");
    expect(() => readNutritionDemoStateFromLs()).not.toThrow();
  });
});

describe("importNutritionDemoSeed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Фейк-клієнт: збирає SQL, який на нього виллють. Нам не треба
   * справжній sqlite — важливо, що demo-payload ПЕРЕТВОРЮЄТЬСЯ на
   * операції запису, бо саме цієї ланки не було (аудит L-8): сід писав
   * у LS, модуль читав із SQLite, і між ними після видалення
   * residual-дренажу не лишилось нічого.
   */
  function makeClient() {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    return {
      calls,
      client: {
        exec: (sql: string) => {
          calls.push({ sql, params: [] });
        },
        run: (sql: string, params?: readonly unknown[]) => {
          calls.push({ sql, params: params ?? [] });
          return Promise.resolve(undefined);
        },
        all: () => Promise.resolve([]),
      },
    };
  }

  it("нічого не робить, коли демо-payload порожній", async () => {
    const { client, calls } = makeClient();

    const applied = await importNutritionDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("перетворює засіяний журнал, воду і преференції на записи в SQLite", async () => {
    localStorage.setItem(LOG_KEY, JSON.stringify(seedLikeLog()));
    localStorage.setItem(PREFS_KEY, JSON.stringify(seedLikePrefs()));
    localStorage.setItem(WATER_KEY, JSON.stringify(seedLikeWater()));
    const { client, calls } = makeClient();

    const applied = await importNutritionDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBeGreaterThan(0);
    const sql = calls.map((c) => c.sql).join(" ");
    expect(sql).toMatch(/nutrition_meals/i);
    expect(sql).toMatch(/nutrition_water_log/i);
    expect(sql).toMatch(/nutrition_prefs/i);
  });

  it("вода, засіяна поламаною формою {ml: N}, НЕ доїжджає до SQLite (регресія)", async () => {
    // Прямий доказ пастки #1 із завдання: якби демо-сід і далі писав
    // обʼєктну форму, `normalizeWaterLog` відкинув би геть усі ключі і
    // жодного `water-log-set` не булоб — цей тест ловить регрес у СІДІ,
    // не лише в імпортері.
    localStorage.setItem(
      WATER_KEY,
      JSON.stringify({ "2026-08-07": { ml: 1400 } }),
    );
    const { client, calls } = makeClient();

    const applied = await importNutritionDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBe(0);
    const sql = calls.map((c) => c.sql).join(" ");
    expect(sql).not.toMatch(/nutrition_water_log/i);
  });

  it("не кидає, коли sqlite падає — демо не має права завалити бут", async () => {
    localStorage.setItem(LOG_KEY, JSON.stringify(seedLikeLog()));
    const failing = {
      exec: () => {
        throw new Error("sqlite down");
      },
      run: () => {
        throw new Error("sqlite down");
      },
      all: () => Promise.resolve([]),
    };

    await expect(
      importNutritionDemoSeed({
        client: failing,
        userId: "demo-local",
        nowIso: "2026-08-08T10:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });

  it("ідемпотентний за кількістю операцій: другий прогін дає те саме `applied`", async () => {
    localStorage.setItem(LOG_KEY, JSON.stringify(seedLikeLog()));
    localStorage.setItem(PREFS_KEY, JSON.stringify(seedLikePrefs()));
    localStorage.setItem(WATER_KEY, JSON.stringify(seedLikeWater()));
    const first = makeClient();
    const second = makeClient();

    const a = await importNutritionDemoSeed({
      client: first.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });
    const b = await importNutritionDemoSeed({
      client: second.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(b).toBe(a);
  });

  /**
   * Пастка #6 (найризикованіша): `diffNutritionDualWriteOps` емітить
   * `goal-period-insert` на КОЖЕН прогін, бо ми завжди diff-имо від
   * `EMPTY_NUTRITION_DUAL_WRITE_STATE` (мірор фізруку). `reseedDemoData()`
   * виконується на кожен cold start — якби `nutrition_goal_periods`
   * ріс на кожному з них, таблиця розпухала б назавжди.
   *
   * Захист живе в `insertGoalPeriod` (`adapter.goalPeriods.ts`):
   * детермінований `id` з `effective_from` (київський день) + значень
   * цілі + `deviceId`, застосований через `INSERT OR IGNORE`. Цей тест
   * фіксує, що при ОДНАКОВОМУ `nowIso` (і, отже, тому самому дню) ІНШИЙ
   * прогін генерує ТОЙ САМИЙ параметр `id` для INSERT-у в
   * `nutrition_goal_periods` — тобто SQLite мовчки проігнорує дублікат
   * і рядок не поїде вдруге, попри те що diff емітить операцію знову.
   */
  it("goal-period-insert детермінований між прогонами — SQLite-дедуп, не подвоєння", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(seedLikePrefs()));
    const first = makeClient();
    const second = makeClient();

    await importNutritionDemoSeed({
      client: first.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });
    await importNutritionDemoSeed({
      client: second.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    const goalCallFirst = first.calls.find((c) =>
      /nutrition_goal_periods/i.test(c.sql),
    );
    const goalCallSecond = second.calls.find((c) =>
      /nutrition_goal_periods/i.test(c.sql),
    );
    expect(goalCallFirst).toBeDefined();
    expect(goalCallSecond).toBeDefined();
    // `id` — перший параметр INSERT-у.
    expect(goalCallSecond!.params[0]).toBe(goalCallFirst!.params[0]);
    // Сам SQL — `INSERT OR IGNORE`, не `ON CONFLICT DO UPDATE`: другий
    // прогін не перезаписує, а мовчки відкидається на рівні SQLite.
    expect(goalCallFirst!.sql).toMatch(/INSERT OR IGNORE/i);
  });
});
