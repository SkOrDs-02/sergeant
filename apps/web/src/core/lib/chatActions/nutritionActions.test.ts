// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The nutrition chat-action mutators must write through the module's canonical
// storage wrappers (so AI writes land in the SQLite-backed source of truth and
// stay visible in the module UI), NOT raw `lsSet`. We mock all three storage
// modules with an in-memory store: a regression back to `lsSet` would leave
// `mem` untouched and fail these assertions.
const mem = vi.hoisted(() => ({
  log: {} as Record<string, { meals: unknown[] }>,
  prefs: {} as Record<string, unknown>,
  pantries: null as Array<{
    id: string;
    name: string;
    items: Array<{ name: string }>;
  }> | null,
  active: "home",
  water: {} as Record<string, number>,
  shopping: null as unknown,
}));

vi.mock("../../../modules/nutrition/lib/nutritionStorage", async () => {
  const domain = await import("@sergeant/nutrition-domain");
  return {
    // Pure domain helpers stay real — they produce the canonical Meal shape.
    addLogEntry: domain.addLogEntry,
    removeLogEntry: domain.removeLogEntry,
    loadNutritionLog: vi.fn(() => domain.normalizeNutritionLog(mem.log)),
    persistNutritionLog: vi.fn((next: unknown) => {
      mem.log = domain.normalizeNutritionLog(next ?? {}) as Record<
        string,
        { meals: unknown[] }
      >;
      return true;
    }),
    loadNutritionPrefs: vi.fn(() => ({
      ...domain.defaultNutritionPrefs(),
      ...mem.prefs,
    })),
    persistNutritionPrefs: vi.fn((p: Record<string, unknown>) => {
      mem.prefs = p;
      return true;
    }),
    loadPantries: vi.fn(() => mem.pantries ?? [domain.makeDefaultPantry()]),
    loadActivePantryId: vi.fn(() => mem.active),
    persistPantries: vi.fn(
      (_k?: unknown, _ak?: unknown, p?: unknown, aid?: unknown) => {
        if (Array.isArray(p))
          mem.pantries = p as typeof mem.pantries extends infer T ? T : never;
        if (aid != null) mem.active = String(aid);
        return true;
      },
    ),
  };
});

vi.mock("../../../modules/nutrition/lib/waterStorage", async () => {
  const domain = await import("@sergeant/nutrition-domain");
  return {
    loadWaterLog: vi.fn(() => ({ ...mem.water })),
    saveWaterLog: vi.fn((log: unknown) => {
      mem.water = domain.normalizeWaterLog(log) as Record<string, number>;
      return true;
    }),
  };
});

vi.mock("../../../modules/nutrition/lib/shoppingListStorage", async () => {
  const domain = await import("@sergeant/nutrition-domain");
  return {
    loadShoppingList: vi.fn(() => domain.normalizeShoppingList(mem.shopping)),
    persistShoppingList: vi.fn((list: unknown) => {
      mem.shopping = domain.normalizeShoppingList(list);
      return true;
    }),
  };
});

import { handleNutritionAction } from "./nutritionActions";
import { persistNutritionLog } from "../../../modules/nutrition/lib/nutritionStorage";
import { saveWaterLog } from "../../../modules/nutrition/lib/waterStorage";
import { persistShoppingList } from "../../../modules/nutrition/lib/shoppingListStorage";
import type { ChatAction } from "./types";

beforeEach(() => {
  mem.log = {};
  mem.prefs = {};
  mem.pantries = null;
  mem.active = "home";
  mem.water = {};
  mem.shopping = null;
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleNutritionAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

function dayMeals(dateKey: string): unknown[] {
  return mem.log[dateKey]?.meals ?? [];
}

// ---------------------------------------------------------------------------
// log_meal
// ---------------------------------------------------------------------------
describe("log_meal", () => {
  it("happy: logs meal with macros", () => {
    const out = call({
      name: "log_meal",
      input: {
        name: "Курка з рисом",
        kcal: 500,
        protein_g: 40,
        fat_g: 15,
        carbs_g: 50,
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Курка з рисом");
    expect(out).toContain("500");
  });

  it("error: empty name uses fallback (not thrown)", () => {
    const out = call({
      name: "log_meal",
      input: { name: "", kcal: 200 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Без назви");
  });

  it("canonical: meal lands in the SQLite-backed store via persistNutritionLog", () => {
    const out = call({
      name: "log_meal",
      input: { name: "Яблуко", kcal: 50 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("записано");
    // The fix: goes through the canonical wrapper, not raw lsSet.
    expect(persistNutritionLog).toHaveBeenCalled();
    expect(dayMeals("2026-04-22")).toHaveLength(1);
    expect((dayMeals("2026-04-22")[0] as { name: string }).name).toBe("Яблуко");
  });
});

// ---------------------------------------------------------------------------
// log_water
// ---------------------------------------------------------------------------
describe("log_water", () => {
  it("happy: logs water intake via saveWaterLog", () => {
    const out = call({
      name: "log_water",
      input: { amount_ml: 500 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("500");
    expect(out).toContain("мл");
    expect(saveWaterLog).toHaveBeenCalled();
    expect(mem.water["2026-04-22"]).toBe(500);
  });

  it("error: non-positive amount returns error", () => {
    const out = call({
      name: "log_water",
      input: { amount_ml: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Некоректна");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "log_water",
      input: { amount_ml: 250 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// add_recipe
// ---------------------------------------------------------------------------
describe("add_recipe", () => {
  it("happy: adds recipe", () => {
    const out = call({
      name: "add_recipe",
      input: {
        title: "Борщ",
        ingredients: ["буряк", "капуста"],
        servings: 4,
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Борщ");
    expect(out).toContain("збережено");
  });

  it("error: empty title returns error", () => {
    const out = call({
      name: "add_recipe",
      input: { title: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("назв");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "add_recipe",
      input: { title: "Каша" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Рецепт");
  });
});

// ---------------------------------------------------------------------------
// add_to_shopping_list
// ---------------------------------------------------------------------------
describe("add_to_shopping_list", () => {
  it("happy: adds item to shopping list via persistShoppingList", () => {
    const out = call({
      name: "add_to_shopping_list",
      input: { name: "Молоко" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Молоко");
    expect(out).toContain("додано");
    expect(persistShoppingList).toHaveBeenCalled();
  });

  it("happy: updates existing item", () => {
    call({ name: "add_to_shopping_list", input: { name: "Молоко" } });
    const out = call({
      name: "add_to_shopping_list",
      input: { name: "Молоко", quantity: "2л" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("оновлено");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "add_to_shopping_list",
      input: { name: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібна");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "add_to_shopping_list",
      input: { name: "Яблука", category: "Фрукти" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Фрукти");
  });
});

// ---------------------------------------------------------------------------
// consume_from_pantry
// ---------------------------------------------------------------------------
describe("consume_from_pantry", () => {
  it("happy: removes item from pantry", () => {
    mem.pantries = [
      { id: "home", name: "Домашня", items: [{ name: "Молоко" }] },
    ];
    const out = call({
      name: "consume_from_pantry",
      input: { name: "Молоко" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Молоко");
    expect(out).toContain("прибрано");
    expect(mem.pantries[0]!.items).toHaveLength(0);
  });

  it("error: item not found in pantry returns error", () => {
    mem.pantries = [{ id: "home", name: "Домашня", items: [{ name: "Хліб" }] }];
    const out = call({
      name: "consume_from_pantry",
      input: { name: "nonexistent" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "consume_from_pantry",
      input: { name: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібна");
  });

  it("shape: result is a non-empty string", () => {
    mem.pantries = [{ id: "home", name: "Домашня", items: [{ name: "Сир" }] }];
    const out = call({
      name: "consume_from_pantry",
      input: { name: "Сир" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// set_daily_plan
// ---------------------------------------------------------------------------
describe("set_daily_plan", () => {
  it("happy: sets daily nutrition targets", () => {
    const out = call({
      name: "set_daily_plan",
      input: { kcal: 2500, protein_g: 150 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2500");
    expect(out).toContain("150");
  });

  it("error: no valid values returns error", () => {
    const out = call({
      name: "set_daily_plan",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("canonical: plan persists via persistNutritionPrefs", () => {
    const out = call({
      name: "set_daily_plan",
      input: { kcal: 2000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("оновлено");
    expect(mem.prefs["dailyTargetKcal"]).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// log_weight  (fizruk daily-log — still on raw LS, fixed in a follow-up)
// ---------------------------------------------------------------------------
describe("log_weight", () => {
  it("happy: logs weight", () => {
    const out = call({
      name: "log_weight",
      input: { weight_kg: 82 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("82");
    expect(out).toContain("кг");
  });

  it("error: invalid weight returns error", () => {
    const out = call({
      name: "log_weight",
      input: { weight_kg: -5 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("додатн");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "log_weight",
      input: { weight_kg: 80 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// suggest_meal
// ---------------------------------------------------------------------------
describe("suggest_meal", () => {
  it("happy: returns meal suggestion based on prefs", () => {
    const out = call({
      name: "suggest_meal",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Рекомендацію");
  });

  it("happy: includes focus when provided", () => {
    const out = call({
      name: "suggest_meal",
      input: { focus: "білок" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("білок");
  });

  it("shape: result always contains summary data", () => {
    mem.prefs = { dailyTargetKcal: 2500, dailyTargetProtein_g: 150 };
    const out = call({ name: "suggest_meal", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("ккал");
  });
});

// ---------------------------------------------------------------------------
// copy_meal_from_date
// ---------------------------------------------------------------------------
describe("copy_meal_from_date", () => {
  it("happy: copies meals from source date", () => {
    mem.log = {
      "2026-04-20": {
        meals: [
          {
            id: "m_old",
            name: "Сніданок",
            macros: { kcal: 400, protein_g: 30, fat_g: 15, carbs_g: 40 },
          },
        ],
      },
    };
    const out = call({
      name: "copy_meal_from_date",
      input: { source_date: "2026-04-20" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Скопійовано");
    expect(out).toContain("1");
    expect(out).toContain("400");
    expect(dayMeals("2026-04-22")).toHaveLength(1);
  });

  it("error: invalid date format returns error", () => {
    const out = call({
      name: "copy_meal_from_date",
      input: { source_date: "bad" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("YYYY-MM-DD");
  });

  it("error: no meals on source date returns error", () => {
    const out = call({
      name: "copy_meal_from_date",
      input: { source_date: "2026-04-01" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("немає");
  });

  it("shape: result is a non-empty string", () => {
    mem.log = {
      "2026-04-20": {
        meals: [
          {
            id: "m1",
            name: "X",
            macros: { kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 15 },
          },
        ],
      },
    };
    const out = call({
      name: "copy_meal_from_date",
      input: { source_date: "2026-04-20", meal_index: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// plan_meals_for_day
// ---------------------------------------------------------------------------
describe("plan_meals_for_day", () => {
  it("happy: plans meals based on targets", () => {
    const out = call({
      name: "plan_meals_for_day",
      input: { target_kcal: 2000, meals_count: 4 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("4");
    expect(out).toContain("2000");
    expect(out).toContain("500");
  });

  it("happy: uses defaults when no input", () => {
    const out = call({
      name: "plan_meals_for_day",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Планую");
  });

  it("shape: result is a non-empty string with recommendation", () => {
    const out = call({
      name: "plan_meals_for_day",
      input: { preferences: "вегетаріанська" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("вегетаріанська");
    expect(out).toContain("Рекомендацію");
  });
});

// ---------------------------------------------------------------------------
// log_meal · undo
// ---------------------------------------------------------------------------
describe("log_meal · undo", () => {
  it("повертає {undo} що видаляє щойно доданий прийом", () => {
    const out = handleNutritionAction({
      name: "log_meal",
      input: { name: "Сніданок", kcal: 450 },
    });
    if (typeof out === "string" || out == null) {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    expect(out.result).toContain("Сніданок");
    expect(dayMeals("2026-04-22")).toHaveLength(1);

    out.undo();

    // Day is removed entirely коли meals = 0 (cleanup empty days).
    expect(mem.log["2026-04-22"]).toBeUndefined();
  });

  it("undo прибирає тільки свій прийом, інші лишаються", () => {
    const first = handleNutritionAction({
      name: "log_meal",
      input: { name: "Перший", kcal: 100 },
    });
    if (typeof first === "string" || first == null)
      throw new Error("expected object");

    // Просуваємо час щоб другий meal отримав інший id
    vi.advanceTimersByTime(1000);
    handleNutritionAction({
      name: "log_meal",
      input: { name: "Другий", kcal: 200 },
    });

    first.undo!();

    expect(dayMeals("2026-04-22")).toHaveLength(1);
    expect((dayMeals("2026-04-22")[0] as { name: string }).name).toBe("Другий");
  });

  it("undo ідемпотентний — повторний виклик не кидає", () => {
    const out = handleNutritionAction({
      name: "log_meal",
      input: { name: "Обід", kcal: 600 },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    expect(() => out.undo!()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// log_water · undo
// ---------------------------------------------------------------------------
describe("log_water · undo", () => {
  it("undo віднімає рівно ту ж кількість ml назад до prev", () => {
    const out = handleNutritionAction({
      name: "log_water",
      input: { amount_ml: 250, date: "2025-04-29" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    expect(mem.water["2025-04-29"]).toBe(250);

    out.undo();
    expect(mem.water["2025-04-29"]).toBeUndefined();
  });

  it("undo поверх існуючого значення — повертає до prev", () => {
    mem.water = { "2025-04-29": 500 };
    const out = handleNutritionAction({
      name: "log_water",
      input: { amount_ml: 200, date: "2025-04-29" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");
    expect(mem.water["2025-04-29"]).toBe(700);

    out.undo();
    expect(mem.water["2025-04-29"]).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// add_to_shopping_list · undo
// ---------------------------------------------------------------------------
describe("add_to_shopping_list · undo", () => {
  it("undo прибирає щойно додану позицію у новій категорії", () => {
    const out = handleNutritionAction({
      name: "add_to_shopping_list",
      input: { name: "Молоко", quantity: "1л", category: "Молочка" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    const cur = mem.shopping as { categories?: unknown[] } | null;
    expect(cur?.categories ?? []).toHaveLength(0);
  });

  it("оновлення існуючого item: return string без undo (no-op для undo-flow)", () => {
    mem.shopping = {
      categories: [
        {
          name: "Інше",
          items: [{ id: "si_1", name: "Хліб", quantity: "1", checked: false }],
        },
      ],
    };
    const out = handleNutritionAction({
      name: "add_to_shopping_list",
      input: { name: "Хліб", quantity: "2" },
    });
    expect(typeof out).toBe("string");
  });
});
