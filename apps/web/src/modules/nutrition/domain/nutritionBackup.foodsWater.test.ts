// @vitest-environment jsdom
/**
 * Аудит hands-on 2026-09-29, пункт 10: бекап Їжі несе власні продукти (IDB) і
 * журнал води, а імпорт їх відновлює без дублів.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const triggerSpy = vi.fn();

vi.mock("../lib/foodDb/seedFoodsUk", () => ({
  SEED_FOODS_UK: [
    {
      name: "Молоко 2.5%",
      per100: { kcal: 52, protein_g: 2.8, fat_g: 2.5, carbs_g: 4.7 },
    },
  ],
}));

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
    isNutritionDualWriteRegistered: () => true,
  };
});

import { __resetSergeantDbForTests } from "../../../shared/lib/idb/sergeantDb";
import { listFoods, upsertFood } from "../lib/foodDb/foodDb";
import { __setNutritionSqliteCacheForTests } from "../lib/sqliteReader";
import type { NutritionDualWriteState } from "../lib/sqliteWriter/diff";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
} from "./nutritionBackup";
import {
  applyNutritionBackupFoods,
  withNutritionFoods,
} from "./nutritionBackupFoods";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function freshDevice(waterLog: Record<string, number>) {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
  triggerSpy.mockReset();
  __setNutritionSqliteCacheForTests({ waterLog });
}

beforeEach(() => freshDevice({}));

afterEach(() => {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
});

describe("бекап Їжі: власні продукти і вода", () => {
  it("круговий експорт -> імпорт на чистому пристрої", async () => {
    await upsertFood({
      id: "food_mine",
      name: "Мій сирник",
      per100: { kcal: 200, protein_g: 12, fat_g: 8, carbs_g: 20 },
    });
    await upsertFood({ name: "Молоко 2.5%" }); // збігається з вбудованою базою
    __setNutritionSqliteCacheForTests({
      waterLog: { "2026-10-01": 1500, "2026-10-02": 800 },
    });

    const file = JSON.parse(
      JSON.stringify(
        await withNutritionFoods({ nutrition: buildNutritionBackupPayload() }),
      ),
    ).nutrition;
    expect(file.data.water).toEqual({ "2026-10-01": 1500, "2026-10-02": 800 });
    expect(file.data.foods.map((f: { id: string }) => f.id)).toEqual([
      "food_mine",
    ]);

    freshDevice({ "2026-10-02": 300 });
    await applyNutritionBackupPayload(file, "merge");
    await applyNutritionBackupFoods(file);
    await applyNutritionBackupFoods(file); // повторний імпорт без дублів

    const foods = await listFoods();
    expect(foods.map((f) => f.id)).toEqual(["food_mine"]);
    const waterWrite = (
      triggerSpy.mock.calls as Array<
        [NutritionDualWriteState, NutritionDualWriteState]
      >
    ).find(([, next]) => "2026-10-01" in next.waterLog);
    // merge: наявний день не перетирається, відсутній додається
    expect(waterWrite?.[1].waterLog).toEqual({
      "2026-10-01": 1500,
      "2026-10-02": 300,
    });
  });

  it("бекап версії 1 без water/foods імпортується як раніше", async () => {
    const v1 = {
      kind: "hub-nutrition-backup",
      schemaVersion: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      data: { stateSchemaVersion: 1, prefs: {} },
    };
    await applyNutritionBackupPayload(v1, "merge");
    await applyNutritionBackupFoods(v1);
    expect(await listFoods()).toEqual([]);
  });
});
