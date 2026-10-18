// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Аудит 2026-10-01, data-35 (повторна перевірка): книга рецептів, яку бачить
 * користувач, це SQLite-кеш ПЛЮС власні записи IndexedDB. Рецепт, що є лише в
 * IDB (легасі-міграція `hub_nutrition_recipe_book`), мусить потрапити у файл, а
 * `replace` власного файлу - не знищити його. Тест іде реальним шляхом
 * (`recipeBook` + fake-indexeddb); мокається лише тригер dual-write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const triggerSpy = vi.fn();

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
  };
});

import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState";
import { __resetSergeantDbForTests } from "../../../shared/lib/idb/sergeantDb";
import { listSavedRecipes } from "../lib/recipeBook";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
  getCachedNutritionSqliteState,
} from "../lib/sqliteReader";
import {
  __clearNutritionDualWriteContextForTests,
  registerNutritionDualWriteContext,
} from "../lib/sqliteWriter/index";
import type { NutritionDualWriteState } from "../lib/sqliteWriter/diff";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
} from "./nutritionBackup";
import { withNutritionRecipes } from "./nutritionBackupSections";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;
let unregister: (() => void) | null = null;

const recipe = (id: string, title: string) => ({
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
});

async function seedLegacyRecipeBook(recipes: unknown[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("hub_nutrition_recipe_book", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("recipes", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("recipes", "readwrite");
      for (const r of recipes) tx.objectStore("recipes").put(r);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Переносить `prev -> next` у кеш SQLite, як dual-write + refresh. */
function reduceIntoCache(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
) {
  if (next.recipes === prev.recipes) return;
  __setNutritionSqliteCacheForTests({
    ...getCachedNutritionSqliteState(),
    recipes: next.recipes.map((r) => JSON.parse(r.dataJson)),
  });
}

const exportFile = async () =>
  JSON.parse(
    JSON.stringify(
      (await withNutritionRecipes({ nutrition: buildNutritionBackupPayload() }))
        .nutrition,
    ),
  ) as { data: { recipes?: Array<{ id: string }> } };

const bookIds = async () => (await listSavedRecipes()).map((r) => r.id).sort();

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
  triggerSpy.mockReset().mockImplementation(reduceIntoCache);
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  markInitialPullComplete("user-a", {});
  unregister = registerNutritionDualWriteContext({
    getUserId: () => "user-a",
    getMigrationClient: async () => null,
    getNow: () => "2026-10-08T00:00:00.000Z",
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

describe("бекап Їжі: рецепти, що є лише в IndexedDB", () => {
  it("експорт несе і кеш, і легасі-рецепт з IDB, а replace власного файлу його не знищує", async () => {
    await seedLegacyRecipeBook([recipe("rcp_legacy", "Легасі")]);
    __setNutritionSqliteCacheForTests({
      recipes: [recipe("rcp_cached", "З кешу")] as never,
    });
    // Книга, яку бачить користувач: кеш + IDB-власні записи.
    expect(await bookIds()).toEqual(["rcp_cached", "rcp_legacy"]);

    const file = await exportFile();
    expect(file.data.recipes?.map((r) => r.id)).toEqual([
      "rcp_cached",
      "rcp_legacy",
    ]);

    await applyNutritionBackupPayload(file, "replace");

    expect(await bookIds()).toEqual(["rcp_cached", "rcp_legacy"]);
  });

  it("replace видаляє з IDB лише те, чого немає у файлі (чужий файл = заміна книги)", async () => {
    await seedLegacyRecipeBook([recipe("rcp_legacy", "Легасі")]);
    __setNutritionSqliteCacheForTests({
      recipes: [recipe("rcp_cached", "З кешу")] as never,
    });
    expect(await bookIds()).toEqual(["rcp_cached", "rcp_legacy"]);

    await applyNutritionBackupPayload(
      {
        kind: "hub-nutrition-backup",
        schemaVersion: 2,
        exportedAt: "2026-10-08T00:00:00.000Z",
        data: {
          stateSchemaVersion: 1,
          pantries: [],
          prefs: {},
          recipes: [recipe("rcp_file", "З файлу")],
        },
      },
      "replace",
    );

    expect(await bookIds()).toEqual(["rcp_file"]);
  });

  it("холодний кеш: секції recipes немає, тож restore книгу не чіпає", async () => {
    await seedLegacyRecipeBook([recipe("rcp_legacy", "Легасі")]);
    // Кеш не прогрітий: серверних рецептів не видно, тож книга неповна, і
    // порожній/частковий список у replace стер би справжню.
    const file = await exportFile();
    expect(file.data.recipes).toBeUndefined();
  });
});
