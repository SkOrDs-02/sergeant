// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the IndexedDB-backed saved-recipes book.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const triggerSpy = vi.fn();

vi.mock("./sqliteWriter/index", async () => {
  const actual = await vi.importActual<typeof import("./sqliteWriter/index")>(
    "./sqliteWriter/index",
  );
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
  };
});

import {
  __clearNutritionDualWriteContextForTests,
  diffNutritionDualWriteOps,
  registerNutritionDualWriteContext,
  type NutritionDualWriteState,
} from "./sqliteWriter/index";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "./sqliteReader";

import {
  __resetSergeantDbForTests,
  openSergeantDb,
} from "../../../shared/lib/idb/sergeantDb";
import {
  deleteSavedRecipe,
  listSavedRecipes,
  listSavedRecipesOrThrow,
  normalizeRecipeForSave,
  saveRecipeToBook,
  scaleMacros,
} from "./recipeBook";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

/** Поточний користувач dual-write контексту; тест міняє його між «акаунтами». */
let currentUserId: string | null = "user-a";
let unregister: (() => void) | null = null;

/** Усі recipe-опи, які дельти цього тесту передали у dual-write. */
function emittedRecipeOps() {
  return (
    triggerSpy.mock.calls as [
      NutritionDualWriteState,
      NutritionDualWriteState,
    ][]
  ).flatMap(([prev, next]) =>
    diffNutritionDualWriteOps(prev, next).filter(
      (op) => op.kind === "recipe-upsert" || op.kind === "recipe-delete",
    ),
  );
}

function recipeCacheRow(id: string, title: string) {
  return {
    id,
    title,
    timeMinutes: null,
    servings: null,
    ingredients: [],
    steps: [],
    tips: [],
    macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
    createdAt: 1,
    updatedAt: 1,
  };
}
const LEGACY_DB_NAME = "hub_nutrition_recipe_book";

async function seedLegacyRecipeBook(recipes: unknown[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("recipes", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("recipes", "readwrite");
      const store = tx.objectStore("recipes");
      for (const recipe of recipes) store.put(recipe);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
  triggerSpy.mockReset();
  clearNutritionSqliteCache();
  currentUserId = "user-a";
  unregister = registerNutritionDualWriteContext({
    getUserId: () => currentUserId,
    getMigrationClient: async () => null,
    getNow: () => "2026-10-01T00:00:00.000Z",
  });
});

afterEach(() => {
  unregister?.();
  __clearNutritionDualWriteContextForTests();
  clearNutritionSqliteCache();
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
  vi.clearAllMocks();
});

describe("normalizeRecipeForSave (pure)", () => {
  it("trims title, generates id, and normalizes arrays + macros", () => {
    const r = normalizeRecipeForSave({
      title: "  Борщ  ",
      timeMinutes: -10,
      servings: 4,
      ingredients: ["Буряк", "", "Капуста", 5],
      steps: ["Крок 1"],
      tips: [""],
      macros: { kcal: -2, protein_g: null, fat_g: 3, carbs_g: 10 },
    });
    expect(r.title).toBe("Борщ");
    expect(r.id).toMatch(/^rcp_/);
    expect(r.timeMinutes).toBe(0);
    expect(r.servings).toBe(4);
    expect(r.ingredients).toEqual(["Буряк", "Капуста", "5"]);
    expect(r.steps).toEqual(["Крок 1"]);
    expect(r.tips).toEqual([]);
    // unification-modules.md #1.28: normalizeMacrosNullable (canon) treats
    // a negative/invalid macro as "not entered" (null), not as a fake 0 —
    // 0 would silently count a broken AI-generated recipe as a real
    // macros-having day in period averages.
    expect(r.macros).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: 3,
      carbs_g: 10,
    });
    expect(typeof r.createdAt).toBe("number");
    expect(typeof r.updatedAt).toBe("number");
  });

  it("preserves an explicit id and createdAt", () => {
    const r = normalizeRecipeForSave({
      title: "X",
      id: "rcp_keep",
      createdAt: 1000,
    });
    expect(r.id).toBe("rcp_keep");
    expect(r.createdAt).toBe(1000);
  });

  it("defaults null sub-fields when absent", () => {
    const r = normalizeRecipeForSave({ title: "Y" });
    expect(r.timeMinutes).toBeNull();
    expect(r.servings).toBeNull();
    expect(r.ingredients).toEqual([]);
    expect(r.macros).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
  });

  it("tolerates non-object input", () => {
    expect(normalizeRecipeForSave(null).title).toBe("");
  });
});

describe("components і cookedWeightG", () => {
  const comp = (grams: unknown, name: unknown = "Гречка") => ({
    name,
    grams,
    foodId: "f1",
    per100: { kcal: 110, protein_g: 4.2, fat_g: 1.1, carbs_g: 21.3 },
  });

  it("пропускає валідний склад і вагу, відкидає невалідні компоненти", () => {
    const r = normalizeRecipeForSave({
      title: "Гречка з філе",
      servings: 2,
      components: [
        comp(250),
        comp(0),
        comp(-5),
        comp(10_001),
        comp(Number.NaN),
        comp(100, ""),
      ],
      cookedWeightG: 400,
    });
    expect(r.components).toHaveLength(1);
    expect(r.components?.[0]).toMatchObject({ name: "Гречка", grams: 250 });
    expect(r.cookedWeightG).toBe(400);
  });

  it("невалідна вага стає null, рецепт зберігається", () => {
    for (const w of [0, -1, 10_001, Number.NaN, "400"]) {
      const r = normalizeRecipeForSave({
        title: "X",
        components: [comp(100)],
        cookedWeightG: w,
      });
      expect(r.cookedWeightG).toBeNull();
      expect(r.components).toHaveLength(1);
    }
  });

  it("вага без складу відкидається", () => {
    const r = normalizeRecipeForSave({ title: "AI", cookedWeightG: 400 });
    expect(r.components).toBeUndefined();
    expect(r.cookedWeightG).toBeUndefined();
  });
});

describe("scaleMacros (pure)", () => {
  it("scales non-null macros by a positive factor", () => {
    expect(
      scaleMacros({ kcal: 100, protein_g: 10, fat_g: null, carbs_g: 5 }, 2),
    ).toEqual({ kcal: 200, protein_g: 20, fat_g: null, carbs_g: 10 });
  });

  it("falls back to factor 1 for non-positive/invalid factor", () => {
    expect(scaleMacros({ kcal: 50 }, -1)).toEqual({
      kcal: 50,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(scaleMacros({ kcal: 50 }, "bad")).toMatchObject({ kcal: 50 });
    expect(scaleMacros(null, 2)).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
  });
});

describe("saveRecipeToBook + listSavedRecipes", () => {
  it("rejects an empty title", async () => {
    expect(await saveRecipeToBook({ title: "  " })).toEqual({
      ok: false,
      error: "Порожня назва рецепту",
    });
  });

  it("saves and lists recipes newest-first", async () => {
    const r1 = await saveRecipeToBook({ title: "Перший" });
    expect(r1.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipeToBook({ title: "Другий" });
    const list = await listSavedRecipes();
    expect(list.map((x) => x.title)).toEqual(["Другий", "Перший"]);
  });

  it("respects the limit argument", async () => {
    await saveRecipeToBook({ title: "A" });
    await saveRecipeToBook({ title: "B" });
    expect(await listSavedRecipes(1)).toHaveLength(1);
  });

  it("migrates recipes from the legacy recipe book DB on first read", async () => {
    await seedLegacyRecipeBook([
      normalizeRecipeForSave({
        id: "rcp_legacy",
        title: "Легасі суп",
        updatedAt: 1_700_000_000_000,
      }),
    ]);

    const list = await listSavedRecipes();
    expect(list.map((recipe) => recipe.title)).toContain("Легасі суп");

    const dbs = await indexedDB.databases();
    expect(dbs.map((db) => db.name)).not.toContain(LEGACY_DB_NAME);
  });

  it("returns safe fallbacks when recipe transactions fail", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    const txSpy = vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("tx failed");
    });

    expect(await listSavedRecipes()).toEqual([]);
    expect(await saveRecipeToBook({ title: "Broken" })).toEqual({
      ok: false,
      error: "Не вдалося зберегти рецепт",
    });
    expect(await deleteSavedRecipe("rcp_broken")).toBe(false);

    txSpy.mockRestore();
  });

  it("listSavedRecipesOrThrow не ховає збій читання під порожній список", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    const txSpy = vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("tx failed");
    });

    await expect(listSavedRecipesOrThrow()).rejects.toThrow("tx failed");

    txSpy.mockRestore();
  });
});

describe("deleteSavedRecipe", () => {
  it("returns false for an empty id", async () => {
    expect(await deleteSavedRecipe("")).toBe(false);
  });

  it("removes a saved recipe", async () => {
    const res = await saveRecipeToBook({ title: "Видалити" });
    const id = res.ok ? res.recipe.id : "";
    expect(await deleteSavedRecipe(id)).toBe(true);
    expect(await listSavedRecipes()).toEqual([]);
  });
});

describe("data-09: дельта і партиція книги рецептів", () => {
  it("збереження рецепта = рівно один recipe-upsert, без delete серверних рецептів", async () => {
    // Новий пристрій: у SQLite-кеші вже є серверні рецепти, у IDB порожньо.
    __setNutritionSqliteCacheForTests({
      recipes: [
        recipeCacheRow("rcp_server_1", "Серверний 1"),
        recipeCacheRow("rcp_server_2", "Серверний 2"),
      ],
    });

    const res = await saveRecipeToBook({ id: "rcp_new", title: "Новий" });
    expect(res.ok).toBe(true);

    const ops = emittedRecipeOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "recipe-upsert",
      recipe: { id: "rcp_new", title: "Новий" },
    });
  });

  it("видалення = рівно один recipe-delete для цього id", async () => {
    const res = await saveRecipeToBook({ id: "rcp_a", title: "A" });
    expect(res.ok).toBe(true);
    __setNutritionSqliteCacheForTests({
      recipes: [
        recipeCacheRow("rcp_a", "A"),
        recipeCacheRow("rcp_server", "Серверний"),
      ],
    });
    triggerSpy.mockReset();

    expect(await deleteSavedRecipe("rcp_a")).toBe(true);

    expect(emittedRecipeOps()).toEqual([
      { kind: "recipe-delete", recipeId: "rcp_a" },
    ]);
  });

  it("рецепти користувача A не потрапляють до B і не їдуть у його outbox", async () => {
    await saveRecipeToBook({ id: "rcp_of_a", title: "Секрет A" });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_of_a"]);

    // Той самий браузер, інший акаунт (logout не відбувся / purge не встиг).
    currentUserId = "user-b";
    expect(await listSavedRecipes()).toEqual([]);

    triggerSpy.mockReset();
    await saveRecipeToBook({ id: "rcp_of_b", title: "Свій B" });

    const ops = emittedRecipeOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "recipe-upsert",
      recipe: { id: "rcp_of_b" },
    });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_of_b"]);
  });

  it("B не може видалити чужий рецепт зі спільної IDB: ні локально, ні op-ом", async () => {
    await saveRecipeToBook({ id: "rcp_of_a", title: "Секрет A" });
    currentUserId = "user-b";
    triggerSpy.mockReset();

    expect(await deleteSavedRecipe("rcp_of_a")).toBe(false);
    expect(emittedRecipeOps()).toEqual([]);

    currentUserId = "user-a";
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_of_a"]);
  });

  it("поки власник невідомий, спільна IDB нічого не віддає", async () => {
    await saveRecipeToBook({ id: "rcp_of_a", title: "Секрет A" });
    currentUserId = null;
    expect(await listSavedRecipes()).toEqual([]);
  });

  it("не віддає ownerId назовні", async () => {
    await saveRecipeToBook({ id: "rcp_x", title: "X" });
    const [first] = await listSavedRecipes();
    expect(first).not.toHaveProperty("ownerId");
  });

  // Записи, що лежать у IDB від версії до партиціювання, не мають ownerId.
  async function putRawRecipe(record: Record<string, unknown>): Promise<void> {
    const db = await openSergeantDb();
    const tx = db!.transaction("nutrition_recipes", "readwrite");
    tx.objectStore("nutrition_recipes").put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbIds(): Promise<string[]> {
    const db = await openSergeantDb();
    const tx = db!.transaction("nutrition_recipes", "readonly");
    const all = await new Promise<{ id: string }[]>((resolve, reject) => {
      const r = tx.objectStore("nutrition_recipes").getAll();
      r.onsuccess = () => resolve(r.result as { id: string }[]);
      r.onerror = () => reject(r.error);
    });
    return all.map((r) => r.id);
  }

  it("безвласний запис із копією в кеші власника видно одразу на маунті", async () => {
    await putRawRecipe(recipeCacheRow("rcp_legacy", "Старий"));
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_legacy", "Старий")],
    });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_legacy"]);
  });

  it("книга з кешу видна навіть коли IDB порожня (новий пристрій)", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_server", "Серверний")],
    });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_server"]);
  });

  it("безвласний запис без копії в кеші невідомого походження не показується", async () => {
    await putRawRecipe(recipeCacheRow("rcp_orphan", "Невідомий"));
    expect(await listSavedRecipes()).toEqual([]);
  });

  it("кеш чужого акаунта не підмішується: читається кеш поточного", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_a_cache", "З кешу A")],
    });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual([
      "rcp_a_cache",
    ]);
    clearNutritionSqliteCache();
    currentUserId = "user-b";
    expect(await listSavedRecipes()).toEqual([]);
  });

  it("видалення безвласного запису (до партиціювання) шле recipe-delete і стирає його з IDB", async () => {
    await putRawRecipe(recipeCacheRow("rcp_legacy", "Старий"));
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_legacy", "Старий")],
    });

    expect(await deleteSavedRecipe("rcp_legacy")).toBe(true);

    expect(emittedRecipeOps()).toEqual([
      { kind: "recipe-delete", recipeId: "rcp_legacy" },
    ]);
    expect(await idbIds()).toEqual([]);
    // Кеш ще не оновився (op у черзі), але видалене не воскресає.
    expect(await listSavedRecipes()).toEqual([]);
  });

  it("видалення запису з тегом local-anon, чия копія вже в кеші акаунта, шле recipe-delete", async () => {
    await putRawRecipe({
      ...recipeCacheRow("rcp_anon", "Анонімний"),
      ownerId: "local-anon",
    });
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_anon", "Анонімний")],
    });

    expect(await deleteSavedRecipe("rcp_anon")).toBe(true);

    expect(emittedRecipeOps()).toEqual([
      { kind: "recipe-delete", recipeId: "rcp_anon" },
    ]);
    // Запис чужого тегу в IDB не чіпаємо, але у списку його вже немає.
    expect(await listSavedRecipes()).toEqual([]);
  });

  it("серверний рецепт, якого немає в IDB, видаляється recipe-delete-ом", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_server", "Серверний")],
    });
    expect(await deleteSavedRecipe("rcp_server")).toBe(true);
    expect(emittedRecipeOps()).toEqual([
      { kind: "recipe-delete", recipeId: "rcp_server" },
    ]);
  });

  it("безвласний запис без копії в кеші відмовляється видалятись (false, без op)", async () => {
    await putRawRecipe(recipeCacheRow("rcp_orphan", "Невідомий"));
    expect(await deleteSavedRecipe("rcp_orphan")).toBe(false);
    expect(emittedRecipeOps()).toEqual([]);
    expect(await idbIds()).toEqual(["rcp_orphan"]);
  });

  it("повторне збереження видаленого id знімає позначку видалення (undo)", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [recipeCacheRow("rcp_u", "Undo")],
    });
    await deleteSavedRecipe("rcp_u");
    expect(await listSavedRecipes()).toEqual([]);
    await saveRecipeToBook({ id: "rcp_u", title: "Undo" });
    expect((await listSavedRecipes()).map((r) => r.id)).toEqual(["rcp_u"]);
  });
});
