import { describe, it, expect } from "vitest";

import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
  type NutritionMealSnapshot,
  type NutritionPantrySnapshot,
  type NutritionRecipeSnapshot,
  type NutritionPrefsSnapshot,
} from "../diff.js";

const EMPTY: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
};

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
    macros: { kcal: 450, protein_g: 18, fat_g: 10, carbs_g: 70 },
    source: "manual",
    macroSource: "manual",
    amountG: 250,
    foodId: null,
    isDemo: false,
    ...overrides,
  };
}

function makePantry(id = "p1"): NutritionPantrySnapshot {
  return { id, name: "Дім", text: "молоко 1л", items: [] };
}

function makeRecipe(id = "rcp1"): NutritionRecipeSnapshot {
  return { id, title: "Омлет", dataJson: '{"id":"rcp1","title":"Омлет"}' };
}

function makePrefs(): NutritionPrefsSnapshot {
  return { prefsJson: '{"goal":"maintain"}', activePantryId: "p1" };
}

describe("diffNutritionDualWriteOps", () => {
  it("returns empty when both states are empty", () => {
    expect(diffNutritionDualWriteOps(EMPTY, EMPTY)).toEqual([]);
  });

  it("returns empty when same reference is passed", () => {
    const state: NutritionDualWriteState = {
      meals: [makeMeal()],
      pantries: [makePantry()],
      prefs: makePrefs(),
      recipes: [makeRecipe()],
    };
    expect(diffNutritionDualWriteOps(state, state)).toEqual([]);
  });

  // --- Meals ---

  it("detects meal add", () => {
    const m = makeMeal();
    const next: NutritionDualWriteState = { ...EMPTY, meals: [m] };
    const ops = diffNutritionDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: m });
  });

  it("detects meal delete", () => {
    const m = makeMeal();
    const prev: NutritionDualWriteState = { ...EMPTY, meals: [m] };
    const ops = diffNutritionDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-delete", mealId: "meal-1" });
  });

  it("detects meal update (time changed)", () => {
    const m1 = makeMeal();
    const m2 = makeMeal({ time: "09:30" });
    const prev: NutritionDualWriteState = { ...EMPTY, meals: [m1] };
    const next: NutritionDualWriteState = { ...EMPTY, meals: [m2] };
    const ops = diffNutritionDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: m2 });
  });

  it("detects meal update (macros changed)", () => {
    const m1 = makeMeal();
    const m2 = makeMeal({
      macros: { kcal: 500, protein_g: 18, fat_g: 10, carbs_g: 70 },
    });
    const prev: NutritionDualWriteState = { ...EMPTY, meals: [m1] };
    const next: NutritionDualWriteState = { ...EMPTY, meals: [m2] };
    const ops = diffNutritionDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "meal-upsert", meal: m2 });
  });

  it("skips meal when same reference (no change)", () => {
    const m = makeMeal();
    const prev: NutritionDualWriteState = { ...EMPTY, meals: [m] };
    const next: NutritionDualWriteState = { ...EMPTY, meals: [m] };
    expect(diffNutritionDualWriteOps(prev, next)).toEqual([]);
  });

  // --- Pantries ---

  it("detects pantry add", () => {
    const p = makePantry();
    const next: NutritionDualWriteState = { ...EMPTY, pantries: [p] };
    const ops = diffNutritionDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "pantry-upsert", pantry: p });
  });

  it("detects pantry delete", () => {
    const p = makePantry();
    const prev: NutritionDualWriteState = { ...EMPTY, pantries: [p] };
    const ops = diffNutritionDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "pantry-delete", pantryId: "p1" });
  });

  it("detects pantry update when items array reference changes", () => {
    const items1 = [
      { id: "it1", name: "молоко", qty: 1, unit: "л", notes: null },
    ];
    const items2 = [
      { id: "it1", name: "молоко", qty: 2, unit: "л", notes: null },
    ];
    const p1 = { ...makePantry(), items: items1 };
    const p2 = { ...makePantry(), items: items2 };
    const prev: NutritionDualWriteState = { ...EMPTY, pantries: [p1] };
    const next: NutritionDualWriteState = { ...EMPTY, pantries: [p2] };
    const ops = diffNutritionDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("pantry-upsert");
  });

  // --- Prefs ---

  it("detects prefs add", () => {
    const prefs = makePrefs();
    const next: NutritionDualWriteState = { ...EMPTY, prefs };
    const ops = diffNutritionDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "prefs-upsert", prefs });
  });

  it("detects prefs change (activePantryId)", () => {
    const prev = makePrefs();
    const next: NutritionPrefsSnapshot = {
      ...prev,
      activePantryId: "p2",
    };
    const ops = diffNutritionDualWriteOps(
      { ...EMPTY, prefs: prev },
      { ...EMPTY, prefs: next },
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "prefs-upsert", prefs: next });
  });

  it("detects prefs change (prefsJson)", () => {
    const prev = makePrefs();
    const next: NutritionPrefsSnapshot = {
      ...prev,
      prefsJson: '{"goal":"cut"}',
    };
    const ops = diffNutritionDualWriteOps(
      { ...EMPTY, prefs: prev },
      { ...EMPTY, prefs: next },
    );
    expect(ops).toHaveLength(1);
  });

  it("skips prefs when unchanged (same reference)", () => {
    const prefs = makePrefs();
    const ops = diffNutritionDualWriteOps(
      { ...EMPTY, prefs },
      { ...EMPTY, prefs },
    );
    expect(ops).toEqual([]);
  });

  it("does NOT emit prefs-upsert when next.prefs is null", () => {
    const prev = makePrefs();
    const ops = diffNutritionDualWriteOps(
      { ...EMPTY, prefs: prev },
      { ...EMPTY, prefs: null },
    );
    expect(ops).toEqual([]);
  });

  // --- Recipes ---

  it("detects recipe add", () => {
    const r = makeRecipe();
    const next: NutritionDualWriteState = { ...EMPTY, recipes: [r] };
    const ops = diffNutritionDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "recipe-upsert", recipe: r });
  });

  it("detects recipe delete", () => {
    const r = makeRecipe();
    const prev: NutritionDualWriteState = { ...EMPTY, recipes: [r] };
    const ops = diffNutritionDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "recipe-delete", recipeId: "rcp1" });
  });

  // --- Mixed ---

  it("handles multiple changes across entity types", () => {
    const m = makeMeal();
    const p = makePantry();
    const r = makeRecipe();
    const prefs = makePrefs();

    const prev: NutritionDualWriteState = {
      meals: [m],
      pantries: [p],
      prefs,
      recipes: [r],
    };
    const next: NutritionDualWriteState = {
      meals: [],
      pantries: [p],
      prefs: { ...prefs, activePantryId: "p2" },
      recipes: [r],
    };
    const ops = diffNutritionDualWriteOps(prev, next);
    // meal-delete + prefs-upsert (p, r same ref → no op)
    expect(ops).toHaveLength(2);
    expect(ops[0].kind).toBe("meal-delete");
    expect(ops[1].kind).toBe("prefs-upsert");
  });

  it("sorts ops by id within each entity type", () => {
    const m1 = makeMeal({ id: "z" });
    const m2 = makeMeal({ id: "a" });
    const next: NutritionDualWriteState = { ...EMPTY, meals: [m1, m2] };
    const ops = diffNutritionDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(2);
    expect((ops[0] as { meal: { id: string } }).meal.id).toBe("a");
    expect((ops[1] as { meal: { id: string } }).meal.id).toBe("z");
  });
});
