// Pure-функціональний diff між двома LS-snapshot-ами nutrition стейту.
// Покриваємо єдиний експорт `diffNutritionDualWriteOps` через всі шість
// сутностей (meals, pantries, prefs, recipes, waterLog, shoppingList),
// включно з:
// - happy paths (add / update / delete) для кожної сутності,
// - edge-кейсами полів meal-snapshot (mealChanged), pantry-snapshot
//   (pantryChanged), prefs (prefsChanged), shopping-list
//   (shoppingListChanged),
// - порівнянням макронутрієнтів (`macrosEqual`) для null/non-null,
// - стабільним порядком ітерації (id asc для масивів, dateKey asc для
//   waterLog),
// - водним журналом (Stage 11): undefined-map, відсутні ключі, ключі
//   без зміни,
// - "always upsert" семантикою рецептів (JSON-blob),
// - комбінаціями операцій у межах одного diff.
import { describe, expect, it } from "vitest";

import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteOp,
  type NutritionDualWriteState,
  type NutritionMacrosSnapshot,
  type NutritionMealSnapshot,
  type NutritionPantryItemSnapshot,
  type NutritionPantrySnapshot,
  type NutritionPrefsSnapshot,
  type NutritionRecipeSnapshot,
  type NutritionShoppingListSnapshot,
} from "./diff.js";

// --- Factories ---------------------------------------------------------

const BASE_MACROS: NutritionMacrosSnapshot = {
  kcal: 450,
  protein_g: 18,
  fat_g: 10,
  carbs_g: 70,
};

function makeMacros(
  overrides: Partial<NutritionMacrosSnapshot> = {},
): NutritionMacrosSnapshot {
  return { ...BASE_MACROS, ...overrides };
}

function makeMeal(
  overrides: Partial<NutritionMealSnapshot> = {},
): NutritionMealSnapshot {
  return {
    id: "meal-1",
    dateKey: "2026-05-01",
    time: "08:30",
    mealType: "breakfast",
    name: "Вівсянка",
    label: "вівсянка з ягодами",
    macros: BASE_MACROS,
    source: "manual",
    macroSource: "manual",
    amountG: 250,
    foodId: null,
    isDemo: false,
    ...overrides,
  };
}

function makePantryItem(
  overrides: Partial<NutritionPantryItemSnapshot> = {},
): NutritionPantryItemSnapshot {
  return {
    id: "it-1",
    name: "молоко",
    qty: 1,
    unit: "л",
    notes: null,
    ...overrides,
  };
}

function makePantry(
  overrides: Partial<NutritionPantrySnapshot> = {},
): NutritionPantrySnapshot {
  return {
    id: "p1",
    name: "Дім",
    text: "молоко 1л",
    items: [],
    ...overrides,
  };
}

function makeRecipe(
  overrides: Partial<NutritionRecipeSnapshot> = {},
): NutritionRecipeSnapshot {
  return {
    id: "rcp1",
    title: "Омлет",
    dataJson: '{"id":"rcp1","title":"Омлет"}',
    ...overrides,
  };
}

function makePrefs(
  overrides: Partial<NutritionPrefsSnapshot> = {},
): NutritionPrefsSnapshot {
  return {
    prefsJson: '{"goal":"maintain"}',
    activePantryId: "p1",
    ...overrides,
  };
}

function makeShoppingList(
  overrides: Partial<NutritionShoppingListSnapshot> = {},
): NutritionShoppingListSnapshot {
  return { dataJson: '{"categories":[]}', ...overrides };
}

function makeState(
  overrides: Partial<NutritionDualWriteState> = {},
): NutritionDualWriteState {
  return {
    meals: [],
    pantries: [],
    prefs: null,
    recipes: [],
    waterLog: {},
    shoppingList: null,
    ...overrides,
  };
}

const EMPTY: NutritionDualWriteState = makeState();

// --- Tests -------------------------------------------------------------

describe("diffNutritionDualWriteOps — порожні / no-op кейси", () => {
  it("повертає порожній масив для двох порожніх стейтів", () => {
    expect(diffNutritionDualWriteOps(EMPTY, EMPTY)).toEqual([]);
  });

  it("повертає порожній масив, коли передано той самий обʼєкт", () => {
    const state = makeState({
      meals: [makeMeal()],
      pantries: [makePantry()],
      prefs: makePrefs(),
      recipes: [makeRecipe()],
      waterLog: { "2026-05-01": 500 },
      shoppingList: makeShoppingList(),
    });
    expect(diffNutritionDualWriteOps(state, state)).toEqual([]);
  });

  it("не емітить ops, коли всі вкладені колекції — це той самий референс", () => {
    const meals = [makeMeal()];
    const pantries = [makePantry()];
    const recipes = [makeRecipe()];
    const waterLog = { "2026-05-01": 500 };
    const shoppingList = makeShoppingList();
    const prefs = makePrefs();
    const prev = makeState({
      meals,
      pantries,
      prefs,
      recipes,
      waterLog,
      shoppingList,
    });
    const next = makeState({
      meals,
      pantries,
      prefs,
      recipes,
      waterLog,
      shoppingList,
    });
    expect(diffNutritionDualWriteOps(prev, next)).toEqual([]);
  });
});

describe("diffNutritionDualWriteOps — meal-upsert / meal-delete", () => {
  it("емітить meal-upsert для нової страви", () => {
    const m = makeMeal();
    const ops = diffNutritionDualWriteOps(EMPTY, makeState({ meals: [m] }));
    expect(ops).toEqual([{ kind: "meal-upsert", meal: m }]);
  });

  it("емітить meal-delete для видаленої страви", () => {
    const m = makeMeal();
    const ops = diffNutritionDualWriteOps(makeState({ meals: [m] }), EMPTY);
    expect(ops).toEqual([{ kind: "meal-delete", mealId: m.id }]);
  });

  it("не емітить ops, коли той самий референс meal", () => {
    const m = makeMeal();
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [m] }),
      makeState({ meals: [m] }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить meal-upsert, коли референси різні, але поля однакові (deep-equal)", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [makeMeal()] }),
      makeState({ meals: [makeMeal()] }),
    );
    expect(ops).toEqual([]);
  });

  it.each<{ field: keyof NutritionMealSnapshot; value: unknown }>([
    { field: "dateKey", value: "2026-05-02" },
    { field: "time", value: "09:00" },
    { field: "mealType", value: "lunch" },
    { field: "name", value: "Інша страва" },
    { field: "label", value: "інша" },
    { field: "source", value: "scan" },
    { field: "macroSource", value: "ai" },
    { field: "amountG", value: 300 },
    { field: "foodId", value: "food-42" },
    { field: "isDemo", value: true },
  ])("емітить meal-upsert при зміні поля $field", ({ field, value }) => {
    const prevMeal = makeMeal();
    const nextMeal = makeMeal({
      [field]: value,
    } as Partial<NutritionMealSnapshot>);
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [prevMeal] }),
      makeState({ meals: [nextMeal] }),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: nextMeal });
  });

  it.each<{ name: string; macros: NutritionMacrosSnapshot | null }>([
    { name: "змінений kcal", macros: makeMacros({ kcal: 999 }) },
    { name: "змінений protein_g", macros: makeMacros({ protein_g: 99 }) },
    { name: "змінений fat_g", macros: makeMacros({ fat_g: 99 }) },
    { name: "змінений carbs_g", macros: makeMacros({ carbs_g: 99 }) },
    { name: "macros стає null", macros: null },
  ])("емітить meal-upsert при $name", ({ macros }) => {
    const prevMeal = makeMeal();
    const nextMeal = makeMeal({ macros });
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [prevMeal] }),
      makeState({ meals: [nextMeal] }),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: nextMeal });
  });

  it("обробляє macros: null → non-null як зміну", () => {
    const prevMeal = makeMeal({ macros: null });
    const nextMeal = makeMeal({ macros: BASE_MACROS });
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [prevMeal] }),
      makeState({ meals: [nextMeal] }),
    );
    expect(ops).toHaveLength(1);
    expect((ops[0] as { kind: string }).kind).toBe("meal-upsert");
  });

  it("не емітить meal-upsert, коли обидва macros = null", () => {
    const prevMeal = makeMeal({ macros: null });
    const nextMeal = makeMeal({ macros: null });
    const ops = diffNutritionDualWriteOps(
      makeState({ meals: [prevMeal] }),
      makeState({ meals: [nextMeal] }),
    );
    expect(ops).toEqual([]);
  });

  it("сортує meal-ops за id asc у межах одного diff", () => {
    const m1 = makeMeal({ id: "z-meal" });
    const m2 = makeMeal({ id: "a-meal" });
    const m3 = makeMeal({ id: "m-meal" });
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({ meals: [m1, m2, m3] }),
    );
    expect(ops.map((o) => (o as { meal: { id: string } }).meal.id)).toEqual([
      "a-meal",
      "m-meal",
      "z-meal",
    ]);
  });

  it("дельти adds, updates і deletes для meals одночасно", () => {
    const keep = makeMeal({ id: "keep" }); // unchanged ref
    const change = makeMeal({ id: "change", time: "08:00" });
    const changed = makeMeal({ id: "change", time: "10:00" });
    const removed = makeMeal({ id: "drop" });
    const added = makeMeal({ id: "added" });

    const prev = makeState({ meals: [keep, change, removed] });
    const next = makeState({ meals: [keep, changed, added] });

    const ops = diffNutritionDualWriteOps(prev, next);
    // upserts йдуть у sortedNextIds (added, change, keep) — keep не змінений,
    // тому має бути 2 upsert (added, change) + 1 delete (drop).
    expect(ops).toHaveLength(3);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: added });
    expect(ops[1]).toEqual({ kind: "meal-upsert", meal: changed });
    expect(ops[2]).toEqual({ kind: "meal-delete", mealId: "drop" });
  });
});

describe("diffNutritionDualWriteOps — pantry-upsert / pantry-delete", () => {
  it("емітить pantry-upsert для нової pantry", () => {
    const p = makePantry();
    const ops = diffNutritionDualWriteOps(EMPTY, makeState({ pantries: [p] }));
    expect(ops).toEqual([{ kind: "pantry-upsert", pantry: p }]);
  });

  it("емітить pantry-delete для видаленої pantry", () => {
    const p = makePantry();
    const ops = diffNutritionDualWriteOps(makeState({ pantries: [p] }), EMPTY);
    expect(ops).toEqual([{ kind: "pantry-delete", pantryId: p.id }]);
  });

  it("емітить pantry-upsert при зміні name", () => {
    const before = makePantry();
    const after = makePantry({ name: "Дача" });
    const ops = diffNutritionDualWriteOps(
      makeState({ pantries: [before] }),
      makeState({ pantries: [after] }),
    );
    expect(ops).toEqual([{ kind: "pantry-upsert", pantry: after }]);
  });

  it("емітить pantry-upsert при зміні text", () => {
    const before = makePantry();
    const after = makePantry({ text: "молоко 1л, хліб 1шт" });
    const ops = diffNutritionDualWriteOps(
      makeState({ pantries: [before] }),
      makeState({ pantries: [after] }),
    );
    expect(ops).toEqual([{ kind: "pantry-upsert", pantry: after }]);
  });

  it("емітить pantry-upsert при зміні референсу items (навіть якщо вміст рівний)", () => {
    const items1 = [makePantryItem({ id: "it1", qty: 1 })];
    const items2 = [makePantryItem({ id: "it1", qty: 1 })]; // інший масив
    const before = makePantry({ items: items1 });
    const after = makePantry({ items: items2 });
    const ops = diffNutritionDualWriteOps(
      makeState({ pantries: [before] }),
      makeState({ pantries: [after] }),
    );
    expect(ops).toHaveLength(1);
    expect((ops[0] as { kind: string }).kind).toBe("pantry-upsert");
  });

  it("не емітить pantry-upsert, коли items — той самий референс", () => {
    const items = [makePantryItem()];
    const before = makePantry({ items });
    const after = makePantry({ items });
    const ops = diffNutritionDualWriteOps(
      makeState({ pantries: [before] }),
      makeState({ pantries: [after] }),
    );
    expect(ops).toEqual([]);
  });

  it("сортує pantry-ops за id asc", () => {
    const p1 = makePantry({ id: "z" });
    const p2 = makePantry({ id: "a" });
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({ pantries: [p1, p2] }),
    );
    expect(ops.map((o) => (o as { pantry: { id: string } }).pantry.id)).toEqual(
      ["a", "z"],
    );
  });

  it("сортує pantry-delete за id asc, коли видалено кілька", () => {
    const p1 = makePantry({ id: "z" });
    const p2 = makePantry({ id: "a" });
    const ops = diffNutritionDualWriteOps(
      makeState({ pantries: [p1, p2] }),
      EMPTY,
    );
    expect(ops.map((o) => (o as { pantryId: string }).pantryId)).toEqual([
      "a",
      "z",
    ]);
  });
});

describe("diffNutritionDualWriteOps — prefs-upsert", () => {
  it("емітить prefs-upsert для нових prefs (null → object)", () => {
    const prefs = makePrefs();
    const ops = diffNutritionDualWriteOps(EMPTY, makeState({ prefs }));
    expect(ops).toEqual([{ kind: "prefs-upsert", prefs }]);
  });

  it("емітить prefs-upsert при зміні prefsJson", () => {
    const prev = makePrefs();
    const next = makePrefs({ prefsJson: '{"goal":"cut"}' });
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: prev }),
      makeState({ prefs: next }),
    );
    expect(ops).toEqual([{ kind: "prefs-upsert", prefs: next }]);
  });

  it("емітить prefs-upsert при зміні activePantryId", () => {
    const prev = makePrefs();
    const next = makePrefs({ activePantryId: "p2" });
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: prev }),
      makeState({ prefs: next }),
    );
    expect(ops).toEqual([{ kind: "prefs-upsert", prefs: next }]);
  });

  it("емітить prefs-upsert при activePantryId: string → null", () => {
    const prev = makePrefs({ activePantryId: "p1" });
    const next = makePrefs({ activePantryId: null });
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: prev }),
      makeState({ prefs: next }),
    );
    expect(ops).toEqual([{ kind: "prefs-upsert", prefs: next }]);
  });

  it("НЕ емітить prefs-upsert, коли next.prefs === null (downgrade)", () => {
    const prev = makePrefs();
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: prev }),
      makeState({ prefs: null }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить prefs-upsert для (null, null) — no-op", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: null }),
      makeState({ prefs: null }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить prefs-upsert, коли prefs — той самий референс", () => {
    const prefs = makePrefs();
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs }),
      makeState({ prefs }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить prefs-upsert, коли поля рівні, але референс різний", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ prefs: makePrefs() }),
      makeState({ prefs: makePrefs() }),
    );
    expect(ops).toEqual([]);
  });
});

describe("diffNutritionDualWriteOps — recipe-upsert / recipe-delete", () => {
  it("емітить recipe-upsert для нового рецепта", () => {
    const r = makeRecipe();
    const ops = diffNutritionDualWriteOps(EMPTY, makeState({ recipes: [r] }));
    expect(ops).toEqual([{ kind: "recipe-upsert", recipe: r }]);
  });

  it("емітить recipe-delete для видаленого рецепта", () => {
    const r = makeRecipe();
    const ops = diffNutritionDualWriteOps(makeState({ recipes: [r] }), EMPTY);
    expect(ops).toEqual([{ kind: "recipe-delete", recipeId: r.id }]);
  });

  it("завжди емітить recipe-upsert при зміні референсу (JSON-blob → always upsert)", () => {
    // Навіть коли dataJson однаковий, інший референс → upsert.
    const before = makeRecipe();
    const after = makeRecipe();
    const ops = diffNutritionDualWriteOps(
      makeState({ recipes: [before] }),
      makeState({ recipes: [after] }),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "recipe-upsert", recipe: after });
  });

  it("не емітить recipe-upsert, коли той самий референс", () => {
    const r = makeRecipe();
    const ops = diffNutritionDualWriteOps(
      makeState({ recipes: [r] }),
      makeState({ recipes: [r] }),
    );
    expect(ops).toEqual([]);
  });

  it("сортує recipe-ops за id asc", () => {
    const r1 = makeRecipe({ id: "z" });
    const r2 = makeRecipe({ id: "a" });
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({ recipes: [r1, r2] }),
    );
    expect(ops.map((o) => (o as { recipe: { id: string } }).recipe.id)).toEqual(
      ["a", "z"],
    );
  });
});

describe("diffNutritionDualWriteOps — water-log-set (Stage 11)", () => {
  it("емітить water-log-set для нового ключа", () => {
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({ waterLog: { "2026-05-01": 500 } }),
    );
    expect(ops).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 500 },
    ]);
  });

  it("емітить water-log-set з volumeMl=0 для видаленого ключа (м'який скид)", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog: { "2026-05-01": 500 } }),
      EMPTY,
    );
    expect(ops).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 0 },
    ]);
  });

  it("емітить water-log-set при зміні volume для існуючого ключа", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog: { "2026-05-01": 500 } }),
      makeState({ waterLog: { "2026-05-01": 750 } }),
    );
    expect(ops).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 750 },
    ]);
  });

  it("пропускає ключ, який присутній в обох мапах з однаковим volume", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog: { "2026-05-01": 500, "2026-05-02": 300 } }),
      makeState({ waterLog: { "2026-05-01": 500, "2026-05-02": 999 } }),
    );
    expect(ops).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-02", volumeMl: 999 },
    ]);
  });

  it("не емітить ops, коли мапа — той самий референс (fast-path)", () => {
    const waterLog = { "2026-05-01": 500 };
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog }),
      makeState({ waterLog }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить ops, коли вміст мапи рівний, але референс різний", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog: { "2026-05-01": 500 } }),
      makeState({ waterLog: { "2026-05-01": 500 } }),
    );
    expect(ops).toEqual([]);
  });

  it("сортує water-log-set ops за dateKey asc", () => {
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({
        waterLog: {
          "2026-05-03": 600,
          "2026-05-01": 500,
          "2026-05-02": 200,
        },
      }),
    );
    expect(ops).toHaveLength(3);
    expect(
      ops.map((o) => (o as { kind: string; dateKey?: string }).dateKey),
    ).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
  });

  it("використовує 0 як default, коли ключ існує лише у одній мапі", () => {
    // У prev немає ключа → prevVal = 0, nextVal = 250 → emit volumeMl=250.
    const ops = diffNutritionDualWriteOps(
      makeState({ waterLog: { "2026-05-01": 500 } }),
      makeState({ waterLog: { "2026-05-01": 500, "2026-05-02": 250 } }),
    );
    expect(ops).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-02", volumeMl: 250 },
    ]);
  });

  it("обробляє waterLog як undefined без падіння (?? {} fallback)", () => {
    // Хоча тип каже Record<string, number>, runtime nullish-coalesce
    // покриває випадок, коли LS повернув undefined через рейс.
    const prev = makeState({
      waterLog: undefined as unknown as Readonly<Record<string, number>>,
    });
    const next = makeState({
      waterLog: undefined as unknown as Readonly<Record<string, number>>,
    });
    expect(diffNutritionDualWriteOps(prev, next)).toEqual([]);
  });

  it("обробляє prev.waterLog як undefined: emit для всіх ключів у next", () => {
    const prev = makeState({
      waterLog: undefined as unknown as Readonly<Record<string, number>>,
    });
    const next = makeState({ waterLog: { "2026-05-01": 500 } });
    expect(diffNutritionDualWriteOps(prev, next)).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 500 },
    ]);
  });

  it("обробляє next.waterLog як undefined: emit reset для всіх ключів prev", () => {
    const prev = makeState({ waterLog: { "2026-05-01": 500 } });
    const next = makeState({
      waterLog: undefined as unknown as Readonly<Record<string, number>>,
    });
    expect(diffNutritionDualWriteOps(prev, next)).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 0 },
    ]);
  });
});

describe("diffNutritionDualWriteOps — shopping-list-set (Stage 11)", () => {
  it("емітить shopping-list-set для нового документа (null → non-null)", () => {
    const sl = makeShoppingList();
    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({ shoppingList: sl }),
    );
    expect(ops).toEqual([{ kind: "shopping-list-set", shoppingList: sl }]);
  });

  it("емітить shopping-list-set при зміні dataJson", () => {
    const prev = makeShoppingList({ dataJson: '{"categories":[]}' });
    const next = makeShoppingList({
      dataJson: '{"categories":[{"name":"Овочі"}]}',
    });
    const ops = diffNutritionDualWriteOps(
      makeState({ shoppingList: prev }),
      makeState({ shoppingList: next }),
    );
    expect(ops).toEqual([{ kind: "shopping-list-set", shoppingList: next }]);
  });

  it("не емітить ops, коли dataJson не змінився (різні референси, однаковий blob)", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ shoppingList: makeShoppingList() }),
      makeState({ shoppingList: makeShoppingList() }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить ops, коли shoppingList — той самий референс", () => {
    const shoppingList = makeShoppingList();
    const ops = diffNutritionDualWriteOps(
      makeState({ shoppingList }),
      makeState({ shoppingList }),
    );
    expect(ops).toEqual([]);
  });

  it("НЕ емітить shopping-list-set при downgrade non-null → null (немає hard-delete)", () => {
    const ops = diffNutritionDualWriteOps(
      makeState({ shoppingList: makeShoppingList() }),
      makeState({ shoppingList: null }),
    );
    expect(ops).toEqual([]);
  });

  it("не емітить ops для (null, null) — обидва відсутні", () => {
    expect(
      diffNutritionDualWriteOps(
        makeState({ shoppingList: null }),
        makeState({ shoppingList: null }),
      ),
    ).toEqual([]);
  });
});

describe("diffNutritionDualWriteOps — порядок операцій між сутностями", () => {
  it("підтримує стабільний порядок: meals → pantries → prefs → recipes → waterLog → shoppingList", () => {
    const m = makeMeal({ id: "meal-x" });
    const p = makePantry({ id: "p-x" });
    const r = makeRecipe({ id: "rcp-x" });
    const prefs = makePrefs();
    const sl = makeShoppingList();

    const ops = diffNutritionDualWriteOps(
      EMPTY,
      makeState({
        meals: [m],
        pantries: [p],
        prefs,
        recipes: [r],
        waterLog: { "2026-05-01": 500 },
        shoppingList: sl,
      }),
    );

    expect(ops.map((o) => o.kind)).toEqual([
      "meal-upsert",
      "pantry-upsert",
      "prefs-upsert",
      "recipe-upsert",
      "water-log-set",
      "shopping-list-set",
    ]);
  });

  it("спочатку upserts, потім deletes у межах однієї сутності", () => {
    const keep = makeMeal({ id: "z-keep" }); // unchanged ref
    const changed = makeMeal({ id: "a-changed", time: "10:00" });
    const changedPrev = makeMeal({ id: "a-changed", time: "08:00" });
    const removed = makeMeal({ id: "m-removed" });
    const added = makeMeal({ id: "b-added" });

    const prev = makeState({ meals: [keep, changedPrev, removed] });
    const next = makeState({ meals: [keep, changed, added] });

    const ops = diffNutritionDualWriteOps(prev, next);
    // Очікуваний порядок (upserts по sortedNextIds, потім deletes по sortedPrevIds):
    // upsert: a-changed, b-added (keep — той самий референс)
    // delete: m-removed
    expect(ops).toEqual<NutritionDualWriteOp[]>([
      { kind: "meal-upsert", meal: changed },
      { kind: "meal-upsert", meal: added },
      { kind: "meal-delete", mealId: "m-removed" },
    ]);
  });

  it("комбіновані dirty-зміни через всі сутності", () => {
    const mealA = makeMeal({ id: "mA" });
    const mealB = makeMeal({ id: "mB" });
    const mealBNext = makeMeal({ id: "mB", time: "12:00" });
    const pantryA = makePantry({ id: "pA" });
    const pantryB = makePantry({ id: "pB" });
    const recipeA = makeRecipe({ id: "rA" });
    const recipeB = makeRecipe({ id: "rB" });
    const recipeBNext = makeRecipe({ id: "rB", title: "Інша назва" });
    const prefsPrev = makePrefs();
    const prefsNext = makePrefs({ activePantryId: "pZ" });
    const slPrev = makeShoppingList({ dataJson: '{"categories":[]}' });
    const slNext = makeShoppingList({
      dataJson: '{"categories":[{"name":"Фрукти"}]}',
    });

    const prev = makeState({
      meals: [mealA, mealB],
      pantries: [pantryA, pantryB],
      prefs: prefsPrev,
      recipes: [recipeA, recipeB],
      waterLog: { "2026-05-01": 500, "2026-05-02": 250 },
      shoppingList: slPrev,
    });
    const next = makeState({
      meals: [mealBNext], // mA видалено, mB змінено
      pantries: [pantryA], // pB видалено
      prefs: prefsNext, // changed
      recipes: [recipeBNext], // rA видалено, rB змінено
      waterLog: { "2026-05-01": 500, "2026-05-03": 100 }, // -05-02 видалено, +05-03
      shoppingList: slNext,
    });

    const ops = diffNutritionDualWriteOps(prev, next);
    expect(ops.map((o) => o.kind)).toEqual([
      "meal-upsert",
      "meal-delete",
      "pantry-delete",
      "prefs-upsert",
      "recipe-upsert",
      "recipe-delete",
      "water-log-set",
      "water-log-set",
      "shopping-list-set",
    ]);
    // Sanity check: змінені сутності та значення
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: mealBNext });
    expect(ops[1]).toEqual({ kind: "meal-delete", mealId: "mA" });
    expect(ops[2]).toEqual({ kind: "pantry-delete", pantryId: "pB" });
    expect(ops[3]).toEqual({ kind: "prefs-upsert", prefs: prefsNext });
    expect(ops[4]).toEqual({ kind: "recipe-upsert", recipe: recipeBNext });
    expect(ops[5]).toEqual({ kind: "recipe-delete", recipeId: "rA" });
    // waterLog — sorted by dateKey asc
    expect(ops[6]).toEqual({
      kind: "water-log-set",
      dateKey: "2026-05-02",
      volumeMl: 0,
    });
    expect(ops[7]).toEqual({
      kind: "water-log-set",
      dateKey: "2026-05-03",
      volumeMl: 100,
    });
    expect(ops[8]).toEqual({ kind: "shopping-list-set", shoppingList: slNext });
  });
});
