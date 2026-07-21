import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
  type NutritionMealSnapshot,
  type NutritionPantrySnapshot,
  type NutritionPrefsSnapshot,
  type NutritionRecipeSnapshot,
} from "./diff";

const EMPTY: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
  waterLog: {},
  shoppingList: null,
};

function makeMeal(
  overrides: Partial<NutritionMealSnapshot> = {},
): NutritionMealSnapshot {
  return {
    id: "meal-1",
    dateKey: "2026-05-01",
    time: "08:30",
    mealType: "breakfast",
    name: "Oatmeal",
    label: "oatmeal with berries",
    macros: { kcal: 450, protein_g: 18, fat_g: 10, carbs_g: 70 },
    source: "manual",
    macroSource: "manual",
    amountG: 250,
    foodId: null,
    isDemo: false,
    ...overrides,
  };
}

function makePantry(
  overrides: Partial<NutritionPantrySnapshot> = {},
): NutritionPantrySnapshot {
  return {
    id: "pantry-1",
    name: "Home",
    text: "milk 1l",
    items: [],
    ...overrides,
  };
}

function makePrefs(
  overrides: Partial<NutritionPrefsSnapshot> = {},
): NutritionPrefsSnapshot {
  return {
    prefsJson: '{"goal":"maintain"}',
    activePantryId: "pantry-1",
    ...overrides,
  };
}

function makeRecipe(
  overrides: Partial<NutritionRecipeSnapshot> = {},
): NutritionRecipeSnapshot {
  return {
    id: "recipe-1",
    title: "Omelet",
    dataJson: '{"id":"recipe-1","title":"Omelet"}',
    ...overrides,
  };
}

describe("diffNutritionDualWriteOps", () => {
  it("returns no ops for unchanged empty and same-reference states", () => {
    expect(diffNutritionDualWriteOps(EMPTY, EMPTY)).toEqual([]);

    const state: NutritionDualWriteState = {
      meals: [makeMeal()],
      pantries: [makePantry()],
      prefs: makePrefs(),
      recipes: [makeRecipe()],
      waterLog: { "2026-05-01": 500 },
      shoppingList: { dataJson: '{"categories":[]}' },
    };

    expect(diffNutritionDualWriteOps(state, state)).toEqual([]);
  });

  it("emits sorted meal upserts, updates, and deletes", () => {
    const unchanged = makeMeal({ id: "z-unchanged" });
    const changedBefore = makeMeal({ id: "m-changed", time: "08:30" });
    const changedAfter = makeMeal({ id: "m-changed", time: "09:15" });
    const removed = makeMeal({ id: "r-removed" });
    const added = makeMeal({ id: "a-added" });

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, meals: [unchanged, changedBefore, removed] },
        { ...EMPTY, meals: [unchanged, changedAfter, added] },
      ),
    ).toEqual([
      { kind: "meal-upsert", meal: added },
      { kind: "meal-upsert", meal: changedAfter },
      { kind: "meal-delete", mealId: removed.id },
    ]);
  });

  it("detects meal macro nullability and value changes", () => {
    const withMacros = makeMeal();

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, meals: [withMacros] },
        { ...EMPTY, meals: [makeMeal({ macros: null })] },
      ),
    ).toEqual([{ kind: "meal-upsert", meal: makeMeal({ macros: null }) }]);

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, meals: [makeMeal({ macros: null })] },
        { ...EMPTY, meals: [makeMeal({ macros: null })] },
      ),
    ).toEqual([]);

    const changedProtein = makeMeal({
      macros: { kcal: 450, protein_g: 20, fat_g: 10, carbs_g: 70 },
    });
    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, meals: [withMacros] },
        { ...EMPTY, meals: [changedProtein] },
      ),
    ).toEqual([{ kind: "meal-upsert", meal: changedProtein }]);
  });

  it("emits pantry upserts and deletes when pantry fields or item references change", () => {
    const pantry = makePantry({ id: "pantry-b" });
    const added = makePantry({ id: "pantry-a" });
    const changed = makePantry({
      id: "pantry-b",
      items: [{ id: "item-1", name: "Milk", qty: 1, unit: "l", notes: null }],
    });
    const removed = makePantry({ id: "pantry-c" });

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, pantries: [pantry, removed] },
        { ...EMPTY, pantries: [changed, added] },
      ),
    ).toEqual([
      { kind: "pantry-upsert", pantry: added },
      { kind: "pantry-upsert", pantry: changed },
      { kind: "pantry-delete", pantryId: removed.id },
    ]);

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, pantries: [makePantry({ text: "milk" })] },
        { ...EMPTY, pantries: [makePantry({ text: "milk, eggs" })] },
      ),
    ).toEqual([
      { kind: "pantry-upsert", pantry: makePantry({ text: "milk, eggs" }) },
    ]);
  });

  it("emits prefs upserts for adds and changes but not nullable downgrades", () => {
    const prefs = makePrefs();
    const changedPrefs = makePrefs({ activePantryId: null });

    expect(diffNutritionDualWriteOps(EMPTY, { ...EMPTY, prefs })).toEqual([
      { kind: "prefs-upsert", prefs },
    ]);
    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, prefs },
        { ...EMPTY, prefs: changedPrefs },
      ),
    ).toEqual([{ kind: "prefs-upsert", prefs: changedPrefs }]);
    expect(
      diffNutritionDualWriteOps({ ...EMPTY, prefs }, { ...EMPTY, prefs: null }),
    ).toEqual([]);
  });

  it("emits recipe upserts for new or replaced recipe references and deletes removed recipes", () => {
    const recipeA = makeRecipe({ id: "recipe-a" });
    const recipeB = makeRecipe({ id: "recipe-b" });
    const recipeBReplacement = makeRecipe({
      id: "recipe-b",
      title: "Updated omelet",
    });

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, recipes: [recipeA, recipeB] },
        { ...EMPTY, recipes: [recipeBReplacement] },
      ),
    ).toEqual([
      { kind: "recipe-upsert", recipe: recipeBReplacement },
      { kind: "recipe-delete", recipeId: recipeA.id },
    ]);

    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, recipes: [recipeA] },
        { ...EMPTY, recipes: [recipeA] },
      ),
    ).toEqual([]);
  });

  it("emits sorted water-log set ops including zero resets and nullish fallbacks", () => {
    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, waterLog: { "2026-05-02": 250, "2026-05-03": 600 } },
        { ...EMPTY, waterLog: { "2026-05-01": 500, "2026-05-03": 600 } },
      ),
    ).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-01", volumeMl: 500 },
      { kind: "water-log-set", dateKey: "2026-05-02", volumeMl: 0 },
    ]);

    expect(
      diffNutritionDualWriteOps(
        {
          ...EMPTY,
          waterLog: undefined as unknown as Readonly<Record<string, number>>,
        },
        { ...EMPTY, waterLog: { "2026-05-04": 750 } },
      ),
    ).toEqual([
      { kind: "water-log-set", dateKey: "2026-05-04", volumeMl: 750 },
    ]);
  });

  it("emits shopping-list set ops for non-null adds and JSON changes", () => {
    const emptyList = { dataJson: '{"categories":[]}' };
    const updatedList = { dataJson: '{"categories":[{"name":"Veg"}]}' };

    expect(
      diffNutritionDualWriteOps(EMPTY, {
        ...EMPTY,
        shoppingList: emptyList,
      }),
    ).toEqual([{ kind: "shopping-list-set", shoppingList: emptyList }]);
    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, shoppingList: emptyList },
        { ...EMPTY, shoppingList: updatedList },
      ),
    ).toEqual([{ kind: "shopping-list-set", shoppingList: updatedList }]);
    expect(
      diffNutritionDualWriteOps(
        { ...EMPTY, shoppingList: emptyList },
        { ...EMPTY, shoppingList: null },
      ),
    ).toEqual([]);
  });

  it("keeps entity ordering stable across a combined diff", () => {
    const mealPrev = makeMeal({ id: "meal-1", time: "08:00" });
    const mealNext = makeMeal({ id: "meal-1", time: "09:00" });
    const pantry = makePantry();
    const prefs = makePrefs({ activePantryId: null });
    const recipe = makeRecipe();
    const shoppingList = { dataJson: '{"categories":[]}' };

    const ops = diffNutritionDualWriteOps(
      { ...EMPTY, meals: [mealPrev] },
      {
        ...EMPTY,
        meals: [mealNext],
        pantries: [pantry],
        prefs,
        recipes: [recipe],
        waterLog: { "2026-05-01": 500 },
        shoppingList,
      },
    );

    expect(ops.map((op) => op.kind)).toEqual([
      "meal-upsert",
      "pantry-upsert",
      "prefs-upsert",
      "recipe-upsert",
      "water-log-set",
      "shopping-list-set",
    ]);
  });
});
